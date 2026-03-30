/**
 * GET /api/social/insights → page metrics (fans, impressions, reach, engagement)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

import { META_BASE } from '@/lib/meta-config';

export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const supabase = createServerSupabaseClient();

    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_page_id, meta_instagram_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token || !config?.meta_page_id) {
      return NextResponse.json({ connected: false });
    }

    const token = config.meta_access_token;
    const pageId = config.meta_page_id;

    // Page insights
    const metrics = [
      'page_fans',
      'page_impressions',
      'page_impressions_unique',
      'page_post_engagements',
      'page_views_total',
    ].join(',');

    const [pageRes, igRes] = await Promise.all([
      fetch(`${META_BASE}/${pageId}/insights?metric=${metrics}&period=day&date_preset=last_7d&access_token=${token}`),
      config.meta_instagram_id
        ? fetch(`${META_BASE}/${config.meta_instagram_id}?fields=followers_count,media_count,profile_picture_url,username&access_token=${token}`)
        : Promise.resolve(null),
    ]);

    let pageInsights: Record<string, number> = {};
    if (pageRes.ok) {
      const data = await pageRes.json() as { data: Array<{ name: string; values: Array<{ value: number }> }> };
      for (const metric of (data.data || [])) {
        const values = metric.values || [];
        pageInsights[metric.name] = values.reduce((s, v) => s + (v.value || 0), 0);
      }
    }

    let igData: Record<string, unknown> = {};
    if (igRes?.ok) {
      igData = await igRes.json() as Record<string, unknown>;
    }

    return NextResponse.json({ connected: true, pageInsights, instagram: igData });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
