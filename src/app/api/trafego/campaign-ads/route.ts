import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

const META_BASE = 'https://graph.facebook.com/v23.0';

/**
 * GET /api/trafego/campaign-ads?campaign_id=XXX
 * Returns all ads (with creatives) for a given campaign.
 */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const campaignId = req.nextUrl.searchParams.get('campaign_id');
    if (!campaignId) return NextResponse.json({ error: 'campaign_id obrigatório' }, { status: 400 });

    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token) return NextResponse.json({ error: 'Meta não configurado' }, { status: 400 });

    const token = config.meta_access_token;

    // Fetch adsets then ads to get creative details
    const adsetRes = await fetch(
      `${META_BASE}/${campaignId}/adsets?fields=id,name,status,daily_budget&limit=20&access_token=${token}`
    );
    if (!adsetRes.ok) {
      const err = await adsetRes.json().catch(() => ({})) as { error?: { message?: string } };
      return NextResponse.json({ error: err.error?.message || 'Erro Meta API' }, { status: 502 });
    }
    const adsetData = await adsetRes.json() as { data: Array<{ id: string; name: string; status: string; daily_budget?: string }> };
    const adsets = adsetData.data || [];

    // For each adset, fetch ads with creative
    const allAds: Array<{
      id: string;
      name: string;
      status: string;
      adset_id: string;
      adset_name: string;
      creative?: {
        id: string;
        name?: string;
        body?: string;
        title?: string;
        thumbnail_url?: string;
        image_url?: string;
        video_id?: string;
        call_to_action_type?: string;
        object_story_spec?: Record<string, unknown>;
      };
    }> = [];

    await Promise.all(adsets.map(async (adset) => {
      try {
        const adRes = await fetch(
          `${META_BASE}/${adset.id}/ads` +
          `?fields=id,name,status,creative{id,name,body,title,thumbnail_url,image_url,video_id,call_to_action_type,object_story_spec}` +
          `&limit=20&access_token=${token}`
        );
        if (!adRes.ok) return;
        const adData = await adRes.json() as { data: Array<{ id: string; name: string; status: string; creative?: Record<string, unknown> }> };
        for (const ad of adData.data || []) {
          allAds.push({
            id: ad.id,
            name: ad.name,
            status: ad.status,
            adset_id: adset.id,
            adset_name: adset.name,
            creative: ad.creative as typeof allAds[0]['creative'],
          });
        }
      } catch { /* silencioso */ }
    }));

    return NextResponse.json({ ads: allAds, adsets });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
