/**
 * POST /api/meta/jarvis-agent/criar-criativo
 * Cria 1 adcreative + 1 ad — 2 chamadas Meta API, ~3-4s.
 * Body: { adset_id, video_id, tipo, nome_base, page_id, thumb_url?, indice }
 * Returns: { creative_id: string; ad_id: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { META_BASE } from '@/lib/meta-config';

const META_ACCOUNT = 'act_1244920119465862';

async function metaPost(token: string, path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${META_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: token }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    let errorData: unknown;
    try { errorData = JSON.parse(errorText); } catch { errorData = errorText; }
    throw new Error(JSON.stringify(errorData));
  }
  const json = await res.json() as Record<string, unknown>;
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json;
}

export async function POST(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  // Supress unused-var warning for tenantId (used only for auth)
  void tenantId;

  let body: {
    adset_id:  string;
    video_id:  string;
    tipo:      string;
    nome_base: string;
    page_id?:  string;
    thumb_url?: string;
    indice?:   number;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data: tenant } = await supabase
      .from('tenants').select('meta_access_token').eq('id', tenantId).single();
    if (!tenant?.meta_access_token) {
      return NextResponse.json({ error: 'Token Meta não configurado' }, { status: 400 });
    }
    const token   = tenant.meta_access_token;
    const pageId  = body.page_id ?? '101337882545607';
    const indice  = body.indice ?? 1;

    // ── Montar video_data ─────────────────────────────────────────────────
    const videoData: Record<string, unknown> = {
      video_id: body.video_id,
      message:  'Conheça nossas rasteirinhas. Comece com R$130 e revenda com lucro!',
      title:    'CJ Rasteirinhas — Seja uma Revendedora',
      call_to_action: {
        type:  'LEARN_MORE',
        value: { link: 'https://wa.me/5562981480687' },
      },
    };
    if (body.thumb_url) videoData.image_url = body.thumb_url;

    // ── Criar adcreative ──────────────────────────────────────────────────
    const creative = await metaPost(token, `${META_ACCOUNT}/adcreatives`, {
      name: `Creative ${body.video_id}`,
      object_story_spec: { page_id: pageId, video_data: videoData },
    });

    // ── Criar ad ──────────────────────────────────────────────────────────
    const ad = await metaPost(token, `${META_ACCOUNT}/ads`, {
      name:      `${body.nome_base} — Anúncio ${indice}`,
      adset_id:  body.adset_id,
      creative:  { creative_id: creative.id },
      status:    'PAUSED',
    });

    return NextResponse.json({ creative_id: creative.id, ad_id: ad.id });
  } catch (err) {
    console.error('[criar-criativo]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
