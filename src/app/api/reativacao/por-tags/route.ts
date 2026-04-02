import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { checkRateLimit } from '@/lib/rate-limit';

const LEAD_TAGS = ['lead_frio', 'lead_morno', 'lead_quente'] as const;

/**
 * GET /api/reativacao/por-tags
 * Retorna clientes agrupados pelas tags de temperatura de lead.
 * Cada grupo retorna data[] (primeiros per_page) + count total.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);

    const rl = checkRateLimit(`${tenantId}:reativacao-tags`);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Muitas requisições.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
      );
    }

    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const perPage = Math.min(500, Math.max(1, parseInt(searchParams.get('per_page') || '50')));
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const ascending = searchParams.get('order') === 'asc';
    const tagFilter = searchParams.get('tag'); // filtra 1 tag específica (para sub-grupos)
    const offset = (page - 1) * perPage;

    async function fetchByTag(tag: string) {
      if (tagFilter && tagFilter !== tag) return { data: [], count: 0 };

      const { data, error, count } = await supabase
        .from('clients')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .contains('tags', [tag])
        .order('created_at', { ascending })
        .range(offset, offset + perPage - 1);

      if (error) throw new Error(`[${tag}] ${error.message}`);
      return { data: data ?? [], count: count ?? 0 };
    }

    const [lead_frio, lead_morno, lead_quente] = await Promise.all(
      LEAD_TAGS.map(fetchByTag)
    );

    return NextResponse.json({
      grupos: { lead_frio, lead_morno, lead_quente },
      total: lead_frio.count + lead_morno.count + lead_quente.count,
    });
  } catch (err) {
    console.error('[reativacao/por-tags]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 }
    );
  }
}
