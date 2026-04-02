import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

import { META_BASE } from '@/lib/meta-config';

/**
 * POST /api/social/promote
 * Promote an existing page post as an ad (creates campaign+adset+ad)
 * Body: {
 *   post_id: string,         // format: {page_id}_{post_id}
 *   nome_campanha: string,
 *   orcamento_diario: number, // reais
 *   data_inicio: string,
 *   data_fim?: string,
 *   paises?: string[],
 *   idade_min?: number,
 *   idade_max?: number,
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as {
      post_id: string;
      nome_campanha: string;
      orcamento_diario: number;
      data_inicio: string;
      data_fim?: string;
      paises?: string[];
      idade_min?: number;
      idade_max?: number;
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
      ? config.meta_ad_account_id : `act_${config.meta_ad_account_id}`;
    const pageId = config.meta_page_id;

    const orcamentoCentavos = String(Math.round(body.orcamento_diario * 100));

    async function metaPost<T>(url: string, payload: Record<string, unknown>): Promise<T> {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as T & { error?: { message: string } };
      if (!res.ok) throw new Error((data as { error?: { message: string } }).error?.message || `HTTP ${res.status}`);
      return data;
    }

    // 1. Campaign
    const campaign = await metaPost<{ id: string }>(`${META_BASE}/${accountId}/campaigns`, {
      name: body.nome_campanha,
      objective: 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
      access_token: token,
    });

    // 2. Adset — POST_ENGAGEMENT pode exigir bid_amount em v21.0; usar LINK_CLICKS (seguro)
    const adsetPayload = {
      name: `${body.nome_campanha} — Conjunto`,
      campaign_id: campaign.id,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      daily_budget: orcamentoCentavos,
      targeting: {
        geo_locations: { countries: body.paises || ['BR'] },
        age_min: body.idade_min || 18,
        age_max: body.idade_max || 65,
      },
      start_time: new Date(body.data_inicio).toISOString(),
      ...(body.data_fim ? { end_time: new Date(body.data_fim).toISOString() } : {}),
      status: 'PAUSED',
      access_token: token,
    };
    console.log('[social/promote ADSET PAYLOAD]', JSON.stringify(adsetPayload, null, 2));
    const adset = await metaPost<{ id: string }>(`${META_BASE}/${accountId}/adsets`, adsetPayload);

    // 3. Ad using existing post as creative
    const postObjectStoryId = body.post_id.includes('_') ? body.post_id : `${pageId}_${body.post_id}`;
    const ad = await metaPost<{ id: string }>(`${META_BASE}/${accountId}/ads`, {
      name: `${body.nome_campanha} — Anúncio`,
      adset_id: adset.id,
      creative: { object_story_id: postObjectStoryId },
      status: 'PAUSED',
      access_token: token,
    });

    return NextResponse.json({
      ok: true,
      campaign_id: campaign.id,
      adset_id: adset.id,
      ad_id: ad.id,
      message: `Post promovido como campanha "${body.nome_campanha}" (pausada para revisão)`,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
