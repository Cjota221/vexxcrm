/**
 * POST /api/meta/campanhas/aprovar
 * Aprova ou rejeita uma campanha da fila.
 * Body: { draftId: string, acao: 'aprovar' | 'rejeitar', novoHeadline?: string, novoBody?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { resolverTokenMeta } from '@/lib/services/meta-token.service';
import { META_BASE } from '@/lib/meta-config';

async function getTenantId(req: NextRequest): Promise<string | null> {
  const tenantId = req.headers.get('x-tenant-id');
  if (tenantId) return tenantId;
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
  return data?.tenant_id ?? null;
}

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const body = await req.json() as {
    draftId: string;
    acao: 'aprovar' | 'rejeitar';
    novoHeadline?: string;
    novoBody?: string;
  };

  if (!body.draftId || !body.acao) {
    return NextResponse.json({ error: 'draftId e acao são obrigatórios' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const { data: draft } = await supabase
    .from('meta_campaign_drafts')
    .select('*')
    .eq('id', body.draftId)
    .eq('tenant_id', tenantId)
    .single();

  if (!draft) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });

  const tokenConfig = await resolverTokenMeta(tenantId);
  if (!tokenConfig) return NextResponse.json({ error: 'Token Meta não configurado' }, { status: 400 });

  const accessToken = tokenConfig.token;

  if (body.acao === 'rejeitar') {
    if (draft.meta_campaign_id) {
      await fetch(`${META_BASE}/${draft.meta_campaign_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ARCHIVED', access_token: accessToken }),
      });
    }

    await supabase
      .from('meta_campaign_drafts')
      .update({ status: 'rejeitado' })
      .eq('id', body.draftId);

    return NextResponse.json({ ok: true, acao: 'rejeitado' });
  }

  if (body.acao === 'aprovar') {
    // Se editou o copy, atualizar criativo antes de ativar
    if ((body.novoHeadline || body.novoBody) && draft.meta_ad_id) {
      const adAccountId = tokenConfig.account_id?.startsWith('act_')
        ? tokenConfig.account_id
        : `act_${tokenConfig.account_id}`;

      const adRes = await fetch(
        `${META_BASE}/${draft.meta_ad_id}?fields=creative&access_token=${accessToken}`
      );
      const adData = await adRes.json() as { creative?: { id: string } };

      if (adData.creative?.id) {
        const creativeRes = await fetch(
          `${META_BASE}/${adData.creative.id}?fields=object_story_spec&access_token=${accessToken}`
        );
        const creativeData = await creativeRes.json() as {
          object_story_spec?: {
            page_id?: string;
            video_data?: { video_id?: string; image_url?: string; call_to_action?: { type?: string } };
          };
        };

        const spec = creativeData.object_story_spec;
        if (spec?.video_data) {
          const novoCreativeRes = await fetch(`${META_BASE}/${adAccountId}/adcreatives`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: `[VEXX Aprovado] ${body.novoHeadline || draft.copy_headline}`,
              object_story_spec: {
                page_id: spec.page_id,
                video_data: {
                  video_id: spec.video_data.video_id,
                  image_url: spec.video_data.image_url,
                  message: body.novoBody || draft.copy_texto || '',
                  call_to_action: spec.video_data.call_to_action,
                },
              },
              access_token: accessToken,
            }),
          });
          const novoCreative = await novoCreativeRes.json() as { id?: string };
          if (novoCreative.id) {
            await fetch(`${META_BASE}/${draft.meta_ad_id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                creative: { creative_id: novoCreative.id },
                access_token: accessToken,
              }),
            });
          }
        }
      }
    }

    // Ativar campanha, adset e ad no Meta em paralelo
    await Promise.all([
      draft.meta_campaign_id && fetch(`${META_BASE}/${draft.meta_campaign_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACTIVE', access_token: accessToken }),
      }),
      draft.meta_adset_id && fetch(`${META_BASE}/${draft.meta_adset_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACTIVE', access_token: accessToken }),
      }),
      draft.meta_ad_id && fetch(`${META_BASE}/${draft.meta_ad_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACTIVE', access_token: accessToken }),
      }),
    ].filter(Boolean));

    await supabase
      .from('meta_campaign_drafts')
      .update({
        status: 'publicado',
        ...(body.novoHeadline && { copy_headline: body.novoHeadline }),
        ...(body.novoBody && { copy_texto: body.novoBody }),
      })
      .eq('id', body.draftId);

    return NextResponse.json({ ok: true, acao: 'aprovado' });
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
}
