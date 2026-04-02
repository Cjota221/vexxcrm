import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

import { META_BASE } from '@/lib/meta-config';

// Meta Graph API mutations require form-encoded body.
// Complex fields (targeting, object_story_spec, creative, call_to_action, special_ad_categories)
// must be JSON-stringified as individual form values.
const FORM_COMPLEX_FIELDS = new Set([
  'targeting', 'object_story_spec', 'creative', 'call_to_action',
  'special_ad_categories', 'link_data', 'promoted_object',
]);

async function metaPost<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue;
    params.set(k, FORM_COMPLEX_FIELDS.has(k) || typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json() as T & { error?: { message: string; error_user_msg?: string } };
  if (!res.ok) {
    const errData = data as Record<string, unknown> & { error?: { message: string; error_user_msg?: string } };
    throw new Error(errData.error?.error_user_msg || errData.error?.message || `Meta HTTP ${res.status}`);
  }
  return data;
}

/**
 * POST /api/trafego/campaign-create
 * Body:
 * {
 *   nome: string,
 *   objetivo: 'OUTCOME_LEADS' | 'OUTCOME_TRAFFIC' | 'OUTCOME_SALES' | 'OUTCOME_AWARENESS' | 'OUTCOME_ENGAGEMENT',
 *   orcamento_diario: number, // em reais, ex: 50
 *   data_inicio: string, // ISO date
 *   data_fim?: string,   // ISO date opcional
 *   publico: {
 *     paises: string[],   // ex: ['BR']
 *     idade_min: number,
 *     idade_max: number,
 *     genero?: 0 | 1 | 2, // 0=todos 1=homens 2=mulheres
 *     interesses?: Array<{ id: string; name: string }>,
 *   },
 *   criativo: {
 *     titulo: string,       // max 40 chars
 *     texto: string,        // max 125 chars
 *     cta: string,          // ex: 'LEARN_MORE'
 *     url_destino: string,
 *     image_url?: string,
 *   },
 *   page_id?: string, // usa config se não informado
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as {

      nome: string;
      objetivo: string;
      orcamento_diario: number;
      data_inicio: string;
      data_fim?: string;
      publico: {
        paises: string[];
        idade_min: number;
        idade_max: number;
        genero?: number;
        interesses?: Array<{ id: string; name: string }>;
      };
      criativo: {
        titulo: string;
        texto: string;
        cta: string;
        url_destino: string;
        image_url?: string;
      };
      page_id?: string;
    };

    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_ad_account_id, meta_page_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token || !config?.meta_ad_account_id) {
      return NextResponse.json({ error: 'Meta não configurado' }, { status: 400 });
    }

    const token = config.meta_access_token;
    const accountId = config.meta_ad_account_id.startsWith('act_')
      ? config.meta_ad_account_id
      : `act_${config.meta_ad_account_id}`;
    const pageId = body.page_id || config.meta_page_id;

    const orcamentoCentavos = Math.round(body.orcamento_diario * 100);

    // Normalizar objetivo: OUTCOME_LEADS e OUTCOME_SALES → OUTCOME_TRAFFIC
    // (evita exigir pixel/formulário; adset usa LINK_CLICKS como optimization_goal)
    const objetivoNormalizado =
      body.objetivo === 'OUTCOME_AWARENESS'  ? 'OUTCOME_AWARENESS'  :
      body.objetivo === 'OUTCOME_ENGAGEMENT' ? 'OUTCOME_ENGAGEMENT' :
      'OUTCOME_TRAFFIC';

    // 1. Criar campanha
    const campaign = await metaPost<{ id: string }>(`${META_BASE}/${accountId}/campaigns`, {
      name: body.nome,
      objective: objetivoNormalizado,
      status: 'PAUSED',
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: 0,  // 0/1 p/ form-encoded: evita string "false" interpretada como truthy
      access_token: token,
    });

    // 2. Criar adset (conjunto de anúncios)
    const targeting: Record<string, unknown> = {
      geo_locations: { countries: body.publico.paises },
      age_min: body.publico.idade_min,
      age_max: body.publico.idade_max,
    };
    if (body.publico.genero && body.publico.genero !== 0) {
      targeting.genders = [body.publico.genero];
    }
    if (body.publico.interesses && body.publico.interesses.length > 0) {
      targeting.flexible_spec = [{ interests: body.publico.interesses }];
    }

    // optimization_goal seguro: REACH para awareness, LINK_CLICKS para os demais.
    // LEAD_GENERATION exige formulário de lead; OFFSITE_CONVERSIONS exige pixel + bid_amount.
    // Ambos causam erro "lance obrigatório" — usar LINK_CLICKS como fallback seguro.
    const optimizationGoal = body.objetivo === 'OUTCOME_AWARENESS' ? 'REACH' : 'LINK_CLICKS';

    console.log('[campaign-create] objetivo recebido:', body.objetivo);
    console.log('[campaign-create] objetivoNormalizado:', objetivoNormalizado);
    console.log('[campaign-create] optimizationGoal calculado:', optimizationGoal);
    console.log('[campaign-create] campaign_id criado:', campaign.id);

    const adset = await metaPost<{ id: string }>(`${META_BASE}/${accountId}/adsets`, {
      name: `${body.nome} — Conjunto`,
      campaign_id: campaign.id,
      billing_event: 'IMPRESSIONS',
      optimization_goal: optimizationGoal,
      daily_budget: String(orcamentoCentavos),
      targeting,
      start_time: new Date(body.data_inicio).toISOString(),
      ...(body.data_fim ? { end_time: new Date(body.data_fim).toISOString() } : {}),
      status: 'PAUSED',
      access_token: token,
    });

    // 3. Criar criativo
    const linkData: Record<string, unknown> = {
      message: body.criativo.texto,
      link: body.criativo.url_destino,
      name: body.criativo.titulo,
      call_to_action: {
        type: body.criativo.cta,
        value: { link: body.criativo.url_destino },
      },
    };
    if (body.criativo.image_url) linkData.picture = body.criativo.image_url;

    const creative = await metaPost<{ id: string }>(`${META_BASE}/${accountId}/adcreatives`, {
      name: `${body.nome} — Criativo`,
      object_story_spec: { page_id: pageId, link_data: linkData },
      access_token: token,
    });

    // 4. Criar anúncio
    const ad = await metaPost<{ id: string }>(`${META_BASE}/${accountId}/ads`, {
      name: `${body.nome} — Anúncio`,
      adset_id: adset.id,
      creative: { creative_id: creative.id },
      status: 'PAUSED',
      access_token: token,
    });

    return NextResponse.json({
      ok: true,
      campaign_id: campaign.id,
      adset_id: adset.id,
      creative_id: creative.id,
      ad_id: ad.id,
      message: `Campanha "${body.nome}" criada no Meta (pausada para revisão)`,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
