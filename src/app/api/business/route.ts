import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

import { META_BASE } from '@/lib/meta-config';

/** GET /api/business — fetch business manager info */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const supabase = createServerSupabaseClient();

    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_ad_account_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token) {
      return NextResponse.json({ connected: false });
    }

    const token = config.meta_access_token;

    const [businessRes, pagesRes] = await Promise.all([
      fetch(`${META_BASE}/me/businesses?fields=id,name,created_time&access_token=${token}`),
      fetch(`${META_BASE}/me/accounts?fields=id,name,category,followers_count,fan_count,instagram_business_account{id,username,followers_count}&access_token=${token}`),
    ]);

    let businesses: unknown[] = [];
    let pages: unknown[] = [];

    if (businessRes.ok) {
      const data = await businessRes.json() as { data: unknown[] };
      businesses = data.data || [];
    }
    if (pagesRes.ok) {
      const data = await pagesRes.json() as { data: unknown[] };
      pages = data.data || [];
    }

    // Ad account info
    let adAccount: unknown = null;
    if (config.meta_ad_account_id) {
      const accountId = config.meta_ad_account_id.startsWith('act_')
        ? config.meta_ad_account_id : `act_${config.meta_ad_account_id}`;
      try {
        const res = await fetch(`${META_BASE}/${accountId}?fields=id,name,currency,account_status,spend_cap,amount_spent,balance&access_token=${token}`);
        if (res.ok) adAccount = await res.json();
      } catch { /* silencioso */ }
    }

    return NextResponse.json({ connected: true, businesses, pages, adAccount });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
