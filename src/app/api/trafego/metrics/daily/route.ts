import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { META_BASE } from '@/lib/meta-config';

function n(v: string | undefined | null): number {
  return parseFloat(v || '0') || 0;
}

/**
 * GET /api/trafego/metrics/daily?campaign_id=XXX&period=30d
 * Retorna métricas dia a dia de uma campanha para montar gráfico histórico.
 */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const campaignId = req.nextUrl.searchParams.get('campaign_id');
    const period = req.nextUrl.searchParams.get('period') || '30d';
    const accountIdParam = req.nextUrl.searchParams.get('account_id');

    if (!campaignId) {
      return NextResponse.json({ error: 'campaign_id obrigatório' }, { status: 400 });
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

    const token = config.meta_access_token;
    const accountId = accountIdParam || config.meta_ad_account_id;

    const datePreset =
      period === '7d'  ? 'last_7d'  :
      period === '15d' ? 'last_14d' :
      period === '1d'  ? 'today'    :
      'last_30d';

    const fields = [
      'spend', 'impressions', 'clicks', 'reach',
      'cpc', 'cpm', 'ctr', 'frequency',
      'actions', 'action_values',
    ].join(',');

    const url = new URL(`${META_BASE}/${campaignId}/insights`);
    url.searchParams.set('fields', fields);
    url.searchParams.set('date_preset', datePreset);
    url.searchParams.set('time_increment', '1');
    url.searchParams.set('level', 'campaign');
    url.searchParams.set('limit', '90');
    url.searchParams.set('access_token', token);

    // unused but kept for future multi-account routing
    void accountId;

    const res = await fetch(url.toString());
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      return NextResponse.json({ error: err.error?.message || `Meta API ${res.status}` }, { status: 502 });
    }

    const raw = await res.json() as {
      data: Array<{
        date_start: string;
        date_stop: string;
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

    const days = (raw.data || []).map((d) => {
      const spend   = n(d.spend);
      const revenue = n(d.action_values?.find(a => a.action_type === 'purchase')?.value);
      const leads   = Math.round(n(d.actions?.find(a => a.action_type === 'lead')?.value));
      const roas    = spend > 0 ? revenue / spend : 0;
      const cpl     = leads > 0 ? spend / leads : 0;
      return {
        date:       d.date_start,
        spend,
        revenue,
        leads,
        clicks:     Math.round(n(d.clicks)),
        impressions: Math.round(n(d.impressions)),
        reach:      Math.round(n(d.reach)),
        cpc:        n(d.cpc),
        cpm:        n(d.cpm),
        ctr:        n(d.ctr),
        frequency:  n(d.frequency),
        roas,
        cpl,
      };
    });

    return NextResponse.json({ days });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
