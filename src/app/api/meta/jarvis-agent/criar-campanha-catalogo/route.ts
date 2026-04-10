/**
 * POST /api/meta/jarvis-agent/criar-campanha-catalogo
 * Cria campanha OUTCOME_TRAFFIC + link carousel (sem DPA / promoted_object).
 * O catálogo será vinculado manualmente no Meta Ads Manager após a criação.
 *
 * Body: { orcamento_diario: number }
 * Returns: { campaign_id, adset_id, creative_id, ad_id, ok: true }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { META_BASE } from '@/lib/meta-config';

const PAGE_ID   = '101337882545607';
const LINK_LOJA = 'https://cjotarasteirinhas.com.br/c/atacado/produtos/62981480687';

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
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
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

    const token    = config.meta_access_token as string;
    const actId    = (config.meta_ad_account_id as string | null) ?? 'act_1244920119465862';
    const nomeBase = `[Jarvis] Catálogo — ${new Date().toLocaleDateString('pt-BR')}`;

    /* ── Passo 1: Campanha (OUTCOME_TRAFFIC) ─────────────────────────── */
    const camp = await metaPost(token, `${actId}/campaigns`, {
      name:                            nomeBase,
      objective:                       'OUTCOME_TRAFFIC',
      status:                          'PAUSED',
      special_ad_categories:           [],
      is_adset_budget_sharing_enabled: false,
    });

    /* ── Passo 2: Adset (sem promoted_object) ────────────────────────── */
    const adset = await metaPost(token, `${actId}/adsets`, {
      name:              `${nomeBase} — Conjunto`,
      campaign_id:       camp.id,
      daily_budget:      Math.round(orcamentoDiario * 100),
      billing_event:     'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      bid_strategy:      'LOWEST_COST_WITHOUT_CAP',
      targeting: {
        geo_locations:        { countries: ['BR'] },
        age_min:              25,
        age_max:              55,
        genders:              [2],
        targeting_automation: { advantage_audience: 0 },
        publisher_platforms:  ['facebook', 'instagram'],
        facebook_positions:   ['feed'],
        instagram_positions:  ['stream', 'story', 'reels'],
      },
      status: 'PAUSED',
    });

    /* ── Debug: listar product_sets do catálogo ─────────────────────── */
    try {
      const psRes = await fetch(
        `${META_BASE}/373597670167329/product_sets?fields=id,name,filter&access_token=${token}`,
      );
      const psJson = await psRes.json();
      console.log('[Catálogo] Product sets:', JSON.stringify(psJson));
    } catch (psErr) {
      console.log('[Catálogo] Erro ao buscar product_sets:', String(psErr));
    }

    /* ── Passo 3: Adcreative link simples ────────────────────────────── */
    const creative = await metaPost(token, `${actId}/adcreatives`, {
      name: `Creative Catálogo — ${nomeBase}`,
      object_story_spec: {
        page_id: PAGE_ID,
        link_data: {
          link:        LINK_LOJA,
          name:        'CJ Rasteirinhas — Atacado',
          description: 'Rasteirinhas por atacado direto da fábrica',
          message:     'Revenda rasteirinhas CJ! Pedido mínimo 5 pares a partir de R$25/par',
          call_to_action: {
            type:  'SHOP_NOW',
            value: { link: LINK_LOJA },
          },
        },
      },
    });

    /* ── Passo 4: Ad ─────────────────────────────────────────────────── */
    const ad = await metaPost(token, `${actId}/ads`, {
      name:     `${nomeBase} — Anúncio`,
      adset_id: adset.id,
      creative: { creative_id: creative.id },
      status:   'PAUSED',
    });

    /* ── Salvar rascunho ─────────────────────────────────────────────── */
    try {
      await supabase.from('meta_campaign_drafts').insert({
        tenant_id:        tenantId,
        nome:             nomeBase,
        objetivo:         'OUTCOME_TRAFFIC',
        tipo:             'catalogo',
        status:           'publicado',
        meta_campaign_id: camp.id  as string,
        meta_adset_id:    adset.id as string,
        meta_ad_id:       ad.id    as string,
        jarvis_log:       'Link carousel — vincular catálogo manualmente no Meta Ads Manager',
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
