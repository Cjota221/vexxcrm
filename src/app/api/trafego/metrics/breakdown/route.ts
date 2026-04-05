import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { META_BASE } from '@/lib/meta-config';

function n(v: string | undefined | null): number {
  return parseFloat(v || '0') || 0;
}

/**
 * GET /api/trafego/metrics/breakdown?campaign_id=XXX&period=7d&by=publisher_platform
 * Retorna métricas segmentadas por posicionamento (Facebook Feed, Instagram Reels, etc.)
 * ou por idade/gênero/dispositivo.
 *
 * Parâmetro `by`:
 *   publisher_platform         → Facebook / Instagram / Messenger / Audience Network
 *   platform_position          → feed / story / reels / right_hand_column / etc.
 *   age                        → 18-24 / 25-34 / 35-44 / 45-54 / 55-64 / 65+
 *   gender                     → male / female / unknown
 *   impression_device          → mobile_feed / desktop_feed / iphone / android
 */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const campaignId = req.nextUrl.searchParams.get('campaign_id');
    const period     = req.nextUrl.searchParams.get('period') || '7d';
    const by         = req.nextUrl.searchParams.get('by') || 'publisher_platform';
    const accountIdParam = req.nextUrl.searchParams.get('account_id');

    const ALLOWED_BREAKDOWNS = [
      'publisher_platform', 'platform_position',
      'age', 'gender', 'impression_device',
    ];

    if (!campaignId) {
      return NextResponse.json({ error: 'campaign_id obrigatório' }, { status: 400 });
    }
    if (!ALLOWED_BREAKDOWNS.includes(by)) {
      return NextResponse.json({ error: `breakdown inválido: ${by}` }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_ad_account_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token) {
      return NextResponse.json({ error: 'Token Meta não configurado' }, { status: 400 });
    }

    const token     = config.meta_access_token;
    const accountId = accountIdParam || config.meta_ad_account_id;
    void accountId;

    const datePreset =
      period === '1d'  ? 'today'    :
      period === '7d'  ? 'last_7d'  :
      period === '15d' ? 'last_14d' :
      'last_30d';

    const fields = [
      'spend', 'impressions', 'clicks', 'reach',
      'cpc', 'cpm', 'ctr', 'frequency',
      'actions', 'action_values',
    ].join(',');

    const url = new URL(`${META_BASE}/${campaignId}/insights`);
    url.searchParams.set('fields', fields);
    url.searchParams.set('date_preset', datePreset);
    url.searchParams.set('breakdowns', by);
    url.searchParams.set('level', 'campaign');
    url.searchParams.set('limit', '50');
    url.searchParams.set('access_token', token);

    const res = await fetch(url.toString());
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      return NextResponse.json({ error: err.error?.message || `Meta API ${res.status}` }, { status: 502 });
    }

    const raw = await res.json() as {
      data: Array<Record<string, string> & {
        spend: string;
        impressions: string;
        clicks: string;
        reach: string;
        cpc: string;
        cpm: string;
        ctr: string;
        frequency: string;
        actions?: Array<{ action_type: string; value: string }>;
        action_values?: Array<{ action_type: string; value: string }>;
      }>;
    };

    const rows = (raw.data || []).map((d) => {
      const spend   = n(d.spend);
      const revenue = n(d.action_values?.find(a => a.action_type === 'purchase')?.value);
      const leads   = Math.round(n(d.actions?.find(a => a.action_type === 'lead')?.value));
      const roas    = spend > 0 ? revenue / spend : 0;
      const cpl     = leads > 0 ? spend / leads : 0;
      return {
        segment:     d[by] || d['publisher_platform'] || 'desconhecido',
        spend,
        revenue,
        leads,
        clicks:      Math.round(n(d.clicks)),
        impressions: Math.round(n(d.impressions)),
        reach:       Math.round(n(d.reach)),
        cpc:         n(d.cpc),
        cpm:         n(d.cpm),
        ctr:         n(d.ctr),
        frequency:   n(d.frequency),
        roas,
        cpl,
      };
    }).sort((a, b) => b.spend - a.spend);  // maior gasto primeiro

    return NextResponse.json({ by, rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
