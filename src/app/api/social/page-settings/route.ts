import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

const META_BASE = 'https://graph.facebook.com/v23.0';

/** GET /api/social/page-settings — fetch page details */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const supabase = createServerSupabaseClient();

    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_page_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token || !config?.meta_page_id) {
      return NextResponse.json({ connected: false });
    }

    const fields = 'id,name,about,description,website,phone,emails,category,fan_count,followers_count,cover,picture';
    const res = await fetch(
      `${META_BASE}/${config.meta_page_id}?fields=${encodeURIComponent(fields)}&access_token=${config.meta_access_token}`
    );

    if (!res.ok) return NextResponse.json({ connected: false });
    const page = await res.json();
    return NextResponse.json({ connected: true, page });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** PATCH /api/social/page-settings — update page info */
export async function PATCH(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as {
      about?: string;
      description?: string;
      website?: string;
      phone?: string;
    };

    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_page_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token || !config?.meta_page_id) {
      return NextResponse.json({ error: 'Página não configurada' }, { status: 400 });
    }

    // Get page token (required for editing page)
    const pageTokenRes = await fetch(
      `${META_BASE}/${config.meta_page_id}?fields=access_token&access_token=${config.meta_access_token}`
    );
    const pageTokenData = await pageTokenRes.json() as { access_token?: string };
    const pageToken = pageTokenData.access_token || config.meta_access_token;

    const updates: Record<string, string> = { access_token: pageToken };
    if (body.about) updates.about = body.about;
    if (body.description) updates.description = body.description;
    if (body.website) updates.website = body.website;
    if (body.phone) updates.phone = body.phone;

    const res = await fetch(`${META_BASE}/${config.meta_page_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    const data = await res.json() as { success?: boolean; error?: { message: string } };
    if (!res.ok) return NextResponse.json({ error: data.error?.message }, { status: 502 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
