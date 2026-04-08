/**
 * POST /api/meta/campanhas/aprovar
 * Aprova ou rejeita uma campanha da fila.
 * Body: { draftId: string, acao: 'aprovar' | 'rejeitar', novoHeadline?: string, novoBody?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { resolverTokenMeta } from '@/lib/services/meta-token.service';
import { META_BASE } from '@/lib/meta-config';
import {
  criarAdCreative,
  criarAd,
  publicarRascunho,
  type ConfiguracaoCriativo,
} from '@/lib/services/meta-adset-creator.service';

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
    // ── Caso 0: draft nunca foi enviado ao Meta — criar campanha+adset+ad agora ──
    if (!draft.meta_campaign_id) {
      const { data: aiCfg } = await supabase
        .from('ai_provider_config')
        .select('meta_page_id')
        .eq('tenant_id', tenantId)
        .single();
      const pageId = aiCfg?.meta_page_id ?? '110009834520002';
      const whatsappNumber = draft.copy_cta === 'WHATSAPP_MESSAGE' ? '5562993044255' : undefined;

      try {
        await supabase
          .from('meta_campaign_drafts')
          .update({ status: 'publicando' })
          .eq('id', body.draftId);

        const resultado = await publicarRascunho(tenantId, body.draftId, pageId, whatsappNumber);
        draft.meta_campaign_id = resultado.campaignId;
        draft.meta_adset_id    = resultado.adsetId;
        draft.meta_ad_id       = resultado.adId;
      } catch (pubErr) {
        const msg = pubErr instanceof Error ? pubErr.message : String(pubErr);
        console.error('[aprovar] Erro ao publicar rascunho no Meta:', msg);
        await supabase
          .from('meta_campaign_drafts')
          .update({ status: 'erro', erro: msg })
          .eq('id', body.draftId);
        return NextResponse.json({ error: `Falha ao criar campanha no Meta: ${msg}` }, { status: 500 });
      }
    }

    // Se o ad não foi criado (agente criou campanha+adset mas falhou no ad), criar agora
    if (!draft.meta_ad_id && draft.meta_adset_id && draft.criativo_id) {
      try {
        const adAccountId = tokenConfig.account_id?.startsWith('act_')
          ? tokenConfig.account_id!
          : `act_${tokenConfig.account_id}`;

        const { data: creativeData } = await supabase
          .from('ad_creatives')
          .select('tipo, meta_video_id, meta_image_hash, url_preview')
          .eq('id', draft.criativo_id)
          .single();

        const { data: aiCfg } = await supabase
          .from('ai_provider_config')
          .select('meta_page_id')
          .eq('tenant_id', tenantId)
          .single();
        const pageId = aiCfg?.meta_page_id ?? '110009834520002';

        if (creativeData) {
          const cfgCriativo: ConfiguracaoCriativo = {
            tipo:          creativeData.tipo as 'video' | 'imagem',
            metaVideoId:   creativeData.meta_video_id ?? undefined,
            metaImageHash: creativeData.meta_image_hash ?? undefined,
            imageUrl:      creativeData.url_preview ?? undefined,
            headline:      draft.copy_headline ?? draft.nome,
            texto:         draft.copy_texto || 'Conheça nossos produtos. Qualidade garantida.',
            cta:           draft.copy_cta ?? 'LEARN_MORE',
            urlDestino:    draft.url_destino ?? undefined,
            pageId,
            whatsappNumber: draft.copy_cta === 'WHATSAPP_MESSAGE' ? '5562993044255' : undefined,
          };
          const creativeId = await criarAdCreative(accessToken, adAccountId, cfgCriativo);
          const adId = await criarAd(accessToken, adAccountId, draft.meta_adset_id, creativeId, draft.nome);

          await supabase
            .from('meta_campaign_drafts')
            .update({ meta_ad_id: adId })
            .eq('id', body.draftId);

          draft.meta_ad_id = adId;
        }
      } catch (adErr) {
        console.error('[aprovar] Erro ao criar ad ausente:', adErr);
        // Continua — ativa campanha e adset mesmo sem o ad
      }
    }

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
