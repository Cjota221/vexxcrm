import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

import { META_BASE } from '@/lib/meta-config';

/**
 * GET /api/trafego/saved-audiences
 * Returns saved audiences and custom audiences from Meta Ad Account.
 */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const supabase = createServerSupabaseClient();

    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_ad_account_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token || !config?.meta_ad_account_id) {
      return NextResponse.json({ connected: false, savedAudiences: [], customAudiences: [] });
    }

    const token = config.meta_access_token;
    const accountId = config.meta_ad_account_id.startsWith('act_')
      ? config.meta_ad_account_id : `act_${config.meta_ad_account_id}`;

    const [savedRes, customRes] = await Promise.all([
      fetch(`${META_BASE}/${accountId}/saved_audiences?fields=id,name,description,approximate_count_lower_bound,approximate_count_upper_bound,targeting_criteria&limit=30&access_token=${token}`),
      fetch(`${META_BASE}/${accountId}/customaudiences?fields=id,name,description,approximate_count_lower_bound,approximate_count_upper_bound,subtype,data_source&limit=30&access_token=${token}`),
    ]);

    let savedAudiences: unknown[] = [];
    let customAudiences: unknown[] = [];

    if (savedRes.ok) {
      const d = await savedRes.json() as { data: unknown[] };
      savedAudiences = d.data || [];
    }
    if (customRes.ok) {
      const d = await customRes.json() as { data: unknown[] };
      customAudiences = d.data || [];
    }

    return NextResponse.json({ connected: true, savedAudiences, customAudiences });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
