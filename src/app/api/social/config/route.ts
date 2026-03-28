/**
 * POST /api/social/config → discover and save page_id + instagram_id from Meta token
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

const META_BASE = 'https://graph.facebook.com/v23.0';

export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const supabase = createServerSupabaseClient();

    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token) {
      return NextResponse.json({ error: 'Token Meta não configurado' }, { status: 400 });
    }

    const token = config.meta_access_token;

    // Get pages managed by this token
    const res = await fetch(`${META_BASE}/me/accounts?fields=id,name,instagram_business_account&access_token=${token}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      return NextResponse.json({ error: err.error?.message || 'Erro ao buscar páginas' }, { status: 400 });
    }

    const data = await res.json() as {
      data: Array<{ id: string; name: string; instagram_business_account?: { id: string } }>;
    };

    const pages = data.data || [];
    if (pages.length === 0) {
      return NextResponse.json({ error: 'Nenhuma página encontrada para este token' }, { status: 404 });
    }

    // Use first page (or let user choose in future)
    const page = pages[0];
    const pageId = page.id;
    const igId = page.instagram_business_account?.id || null;

    await supabase
      .from('ai_provider_config')
      .update({ meta_page_id: pageId, meta_instagram_id: igId, updated_at: new Date().toISOString() })
      .eq('tenant_id', profile.tenant_id);

    return NextResponse.json({ ok: true, pages, pageId, igId, pageName: page.name });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
