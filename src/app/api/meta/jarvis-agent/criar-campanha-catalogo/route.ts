/**
 * POST /api/meta/jarvis-agent/criar-campanha-catalogo
 * Cria campanha completa de catálogo carrossel em 4 passos sequenciais.
 * Body: { orcamento_diario: number }
 * Returns: { campaign_id, adset_id, creative_id, ad_id, ok: true }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { META_BASE } from '@/lib/meta-config';

const CATALOG_ID = '373597670167329';
const PIXEL_ID   = '518376893062766';
const PAGE_ID    = '101337882545607';
const LINK_LOJA  = 'https://cjotarasteirinhas.com.br/c/atacado/produtos/62981480687';

async function metaPost(
  token: string,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${META_BASE}/${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ...body, access_token: token }),
  });
  if (!res.ok) {
    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text; }
    throw new Error(JSON.stringify(data));
  }
  const json = await res.json() as Record<string, unknown>;
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json;
}

export async function POST(req: NextRequest) {
  /* ── Auth ──────────────────────────────────────────────────────────── */
  let tenantId: string;
  try {
    ({ tenantId } = await getTenantFromRequest(req));
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  let body: { orcamento_diario?: number };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const orcamentoDiario = Number(body.orcamento_diario ?? 50);

  /* ── Token Meta ────────────────────────────────────────────────────── */
  try {
    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_ad_account_id')
      .eq('tenant_id', tenantId)
      .single();

    if (!config?.meta_access_token) {
      return NextResponse.json(
        { error: 'Token Meta não configurado em ai_provider_config' },
        { status: 400 },
      );
    }

    const token  = config.meta_access_token;
    const actId  = config.meta_ad_account_id ?? 'act_1244920119465862';
    const nomeBase = `[Jarvis] Catálogo — ${new Date().toLocaleDateString('pt-BR')}`;

    /* ── Passo 1: Campanha ───────────────────────────────────────────── */
    const camp = await metaPost(token, `${actId}/campaigns`, {
      name:                            nomeBase,
      objective:                       'OUTCOME_SALES',
      status:                          'PAUSED',
      special_ad_categories:           [],
      is_adset_budget_sharing_enabled: false,
    });

    /* ── Passo 2: Adset ──────────────────────────────────────────────── */
    const adset = await metaPost(token, `${actId}/adsets`, {
      name:              `${nomeBase} — Conjunto`,
      campaign_id:       camp.id,
      daily_budget:      Math.round(orcamentoDiario * 100),
      billing_event:     'IMPRESSIONS',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      bid_strategy:      'LOWEST_COST_WITHOUT_CAP',
      promoted_object: {
        product_catalog_id: CATALOG_ID,
        pixel_id:           PIXEL_ID,
        custom_event_type:  'PURCHASE',
      },
      targeting: {
        geo_locations:         { countries: ['BR'] },
        age_min:               25,
        age_max:               55,
        genders:               [2],
        targeting_automation:  { advantage_audience: 0 },
        publisher_platforms:   ['facebook', 'instagram'],
        facebook_positions:    ['feed'],
        instagram_positions:   ['stream', 'story', 'reels'],
      },
      status: 'PAUSED',
    });

    /* ── Passo 3: Adcreative carrossel ───────────────────────────────── */
    const creative = await metaPost(token, `${actId}/adcreatives`, {
      name: 'Creative Catálogo',
      object_story_spec: {
        page_id:       PAGE_ID,
        template_data: {
          call_to_action: {
            type:  'SHOP_NOW',
            value: { link: LINK_LOJA },
          },
          description: 'Rasteirinhas por atacado direto da fábrica',
          link:        LINK_LOJA,
          message:     'Revenda rasteirinhas CJ! Pedido mínimo 5 pares a partir de R$25/par',
          name:        'CJ Rasteirinhas — Atacado',
        },
      },
      product_set_id: CATALOG_ID,
    });

    /* ── Passo 4: Ad ─────────────────────────────────────────────────── */
    const ad = await metaPost(token, `${actId}/ads`, {
      name:      `${nomeBase} — Anúncio`,
      adset_id:  adset.id,
      creative:  { creative_id: creative.id },
      status:    'PAUSED',
    });

    /* ── Salvar rascunho ─────────────────────────────────────────────── */
    try {
      await supabase.from('meta_campaign_drafts').insert({
        tenant_id:        tenantId,
        nome:             nomeBase,
        objetivo:         'OUTCOME_SALES',
        tipo:             'catalogo',
        status:           'publicado',
        meta_campaign_id: camp.id   as string,
        meta_adset_id:    adset.id  as string,
        meta_ad_id:       ad.id     as string,
        jarvis_log:       `Catálogo ${CATALOG_ID} | Pixel ${PIXEL_ID}`,
        created_at:       new Date().toISOString(),
      });
    } catch (dbErr) {
      console.error('[criar-campanha-catalogo] Erro ao salvar draft:', dbErr);
    }

    return NextResponse.json({
      ok:          true,
      campaign_id: camp.id,
      adset_id:    adset.id,
      creative_id: creative.id,
      ad_id:       ad.id,
    });
  } catch (err) {
    console.error('[criar-campanha-catalogo]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
