import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { META_BASE } from '@/lib/meta-config';

/**
 * GET /api/meta/leads/forms
 * Lista todos os Instant Forms (formulários de lead) da página configurada.
 * Retorna nome, id, status e contagem de leads de cada formulário.
 */
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
      return NextResponse.json({ error: 'Token Meta ou Page ID não configurados' }, { status: 400 });
    }

    const token  = config.meta_access_token;
    const pageId = config.meta_page_id;

    const url = new URL(`${META_BASE}/${pageId}/leadgen_forms`);
    url.searchParams.set('fields', 'id,name,status,leads_count,created_time,questions');
    url.searchParams.set('limit', '50');
    url.searchParams.set('access_token', token);

    const res = await fetch(url.toString());
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      return NextResponse.json({ error: err.error?.message || `Meta API ${res.status}` }, { status: 502 });
    }

    const data = await res.json() as {
      data: Array<{
        id: string;
        name: string;
        status: string;
        leads_count?: number;
        created_time: string;
        questions?: Array<{ key: string; label: string; type: string }>;
      }>;
    };

    const forms = (data.data || []).map(f => ({
      id:           f.id,
      nome:         f.name,
      status:       f.status,
      leads_count:  f.leads_count || 0,
      created_time: f.created_time,
      campos:       (f.questions || []).map(q => q.key),
    }));

    return NextResponse.json({ forms });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
