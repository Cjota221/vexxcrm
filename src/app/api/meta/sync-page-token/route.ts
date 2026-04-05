/**
 * POST /api/meta/sync-page-token
 *
 * Força a extração e salvamento do Page Access Token a partir do
 * meta_access_token já configurado. Útil quando o meta_page_token
 * está NULL após a migração 059.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(req);
    const supabase = createServerSupabaseClient();

    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_page_id, meta_page_token')
      .eq('tenant_id', tenantId)
      .single();

    if (!config?.meta_access_token) {
      return NextResponse.json({ error: 'Token Meta não configurado' }, { status: 400 });
    }

    if (config.meta_page_token) {
      return NextResponse.json({ ok: true, already_set: true, message: 'meta_page_token já estava configurado' });
    }

    const res = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${config.meta_access_token}`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      return NextResponse.json({ error: err.error?.message || 'Falha ao buscar páginas' }, { status: 400 });
    }

    const data = await res.json() as {
      data?: Array<{ id: string; name: string; access_token?: string; instagram_business_account?: { id: string } }>;
    };

    const pages = data.data || [];
    if (pages.length === 0) {
      return NextResponse.json({ error: 'Nenhuma página encontrada com este token' }, { status: 404 });
    }

    const page = config.meta_page_id
      ? pages.find((p) => p.id === config.meta_page_id) ?? pages[0]
      : pages[0];

    if (!page.access_token) {
      return NextResponse.json({ error: 'Página não retornou access_token. Token pode ser de usuário sem permissão pages_show_list.' }, { status: 422 });
    }

    await supabase
      .from('ai_provider_config')
      .update({
        meta_page_token: page.access_token,
        meta_page_id: page.id,
        ...(page.instagram_business_account?.id && { meta_instagram_id: page.instagram_business_account.id }),
      })
      .eq('tenant_id', tenantId);

    return NextResponse.json({
      ok: true,
      page_id: page.id,
      page_name: page.name,
      ig_id: page.instagram_business_account?.id || null,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
