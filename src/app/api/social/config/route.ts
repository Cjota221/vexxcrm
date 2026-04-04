/**
 * GET  /api/social/config  → list available pages (don't save)
 * POST /api/social/config  → save a specific page_id (body: { page_id })
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

import { META_BASE } from '@/lib/meta-config';

/** GET — list all pages managed by this token (for page picker UI) */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const supabase = createServerSupabaseClient();

    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_page_id, meta_page_token')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token) {
      return NextResponse.json({ error: 'Token Meta não configurado' }, { status: 400 });
    }

    // Buscar páginas + access_token de cada uma
    const res = await fetch(
      `${META_BASE}/me/accounts?fields=id,name,fan_count,picture{url},access_token,instagram_business_account{id,username}&access_token=${config.meta_access_token}`
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      return NextResponse.json({ error: err.error?.message || 'Erro ao listar páginas' }, { status: 400 });
    }

    const data = await res.json() as {
      data: Array<{
        id: string;
        name: string;
        fan_count?: number;
        access_token?: string;
        picture?: { data?: { url?: string } };
        instagram_business_account?: { id: string; username?: string };
      }>;
    };

    const pages = data.data || [];

    // Auto-preencher meta_page_token se ainda não foi salvo
    if (!config.meta_page_token && pages.length > 0) {
      const currentPage = config.meta_page_id
        ? pages.find((p) => p.id === config.meta_page_id) ?? pages[0]
        : pages[0];
      if (currentPage?.access_token) {
        await supabase
          .from('ai_provider_config')
          .update({
            meta_page_token: currentPage.access_token,
            meta_page_id: currentPage.id,
            ...(currentPage.instagram_business_account?.id && {
              meta_instagram_id: currentPage.instagram_business_account.id,
            }),
          })
          .eq('tenant_id', profile.tenant_id);
        console.log(`[Social Config] meta_page_token auto-preenchido para page ${currentPage.id}`);
      }
    }

    return NextResponse.json({
      pages,
      currentPageId: config.meta_page_id || null,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** POST — save the selected page_id (body: { page_id }) */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json().catch(() => ({})) as { page_id?: string };

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

    // If page_id provided, use it directly; otherwise auto-detect first page
    let pageId: string;
    let pageName: string;
    let igId: string | null = null;
    let pageToken: string | null = null;

    if (body.page_id) {
      // Verify the page is accessible and get its page access token
      const res = await fetch(
        `${META_BASE}/${body.page_id}?fields=id,name,access_token,instagram_business_account&access_token=${token}`
      );
      if (!res.ok) return NextResponse.json({ error: 'Página não encontrada ou sem acesso' }, { status: 400 });
      const page = await res.json() as { id: string; name: string; access_token?: string; instagram_business_account?: { id: string } };
      pageId = page.id;
      pageName = page.name;
      igId = page.instagram_business_account?.id || null;
      pageToken = page.access_token || null;
    } else {
      // Auto-detect first page
      const res = await fetch(`${META_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${token}`);
      if (!res.ok) return NextResponse.json({ error: 'Erro ao buscar páginas' }, { status: 400 });
      const data = await res.json() as { data: Array<{ id: string; name: string; access_token?: string; instagram_business_account?: { id: string } }> };
      const pages = data.data || [];
      if (pages.length === 0) return NextResponse.json({ error: 'Nenhuma página encontrada' }, { status: 404 });
      const page = pages[0];
      pageId = page.id;
      pageName = page.name;
      igId = page.instagram_business_account?.id || null;
      pageToken = page.access_token || null;
    }

    const updatePayload: Record<string, string | null> = {
      meta_page_id: pageId,
      meta_instagram_id: igId,
      updated_at: new Date().toISOString(),
    };
    // Salvar o Page Access Token separado (para Instagram DM send + name lookup)
    if (pageToken) updatePayload.meta_page_token = pageToken;

    await supabase
      .from('ai_provider_config')
      .update(updatePayload)
      .eq('tenant_id', profile.tenant_id);

    return NextResponse.json({ ok: true, pageId, igId, pageName, hasPageToken: !!pageToken });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
