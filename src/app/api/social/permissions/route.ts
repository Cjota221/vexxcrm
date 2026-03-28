import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

const META_BASE = 'https://graph.facebook.com/v23.0';

/**
 * GET /api/social/permissions
 * Returns which Meta permissions the current token actually has.
 */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const supabase = createServerSupabaseClient();

    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token) {
      return NextResponse.json({ connected: false, granted: [] });
    }

    const res = await fetch(
      `${META_BASE}/me/permissions?access_token=${config.meta_access_token}`
    );

    if (!res.ok) {
      return NextResponse.json({ connected: false, granted: [] });
    }

    const data = await res.json() as {
      data: Array<{ permission: string; status: 'granted' | 'declined' | 'expired' }>;
    };

    const granted = (data.data || [])
      .filter(p => p.status === 'granted')
      .map(p => p.permission);

    return NextResponse.json({ connected: true, granted });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
