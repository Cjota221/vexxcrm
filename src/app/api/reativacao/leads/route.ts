import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { checkRateLimit } from '@/lib/rate-limit';

const now = () => new Date().toISOString();

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/**
 * GET /api/reativacao/leads
 *
 * Retorna leads sem compra (total_orders = 0) já agrupados em 4 buckets:
 *   recentes   → criado nos últimos 7 dias
 *   em_espera  → 7–30 dias
 *   esfriando  → 30–90 dias
 *   frios      → mais de 90 dias
 *
 * Cada bucket retorna os primeiros `per_page` (default 50) registros
 * + o total real do bucket (para paginação futura).
 *
 * Query param `bucket` filtra um único bucket (para "carregar mais").
 * Query param `page` / `per_page` controlam paginação por bucket.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);

    const rl = checkRateLimit(`${tenantId}:reativacao-leads`);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Muitas requisições. Tente novamente em breve.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
      );
    }

    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const perPage = Math.min(500, Math.max(1, parseInt(searchParams.get('per_page') || '50')));
    const bucketFilter = searchParams.get('bucket'); // opcional: filtrar 1 bucket
    const ascending = searchParams.get('order') === 'asc'; // para sub-grupos (mais antigos primeiro)
    const offset = (page - 1) * perPage;

    // Limites de data para cada bucket
    const d7 = daysAgo(7);
    const d30 = daysAgo(30);
    const d90 = daysAgo(90);

    // Base: sem compra
    const base = () =>
      supabase
        .from('clients')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .eq('total_orders', 0);

    // Busca paralela de todos os buckets (ou só o filtrado)
    const buckets = ['recentes', 'em_espera', 'esfriando', 'frios'] as const;

    async function fetchBucket(bucket: typeof buckets[number]) {
      if (bucketFilter && bucketFilter !== bucket) {
        return { data: [], count: 0 };
      }

      let q = base().order('created_at', { ascending }).range(offset, offset + perPage - 1);

      switch (bucket) {
        case 'recentes':
          q = q.gte('created_at', d7);
          break;
        case 'em_espera':
          q = q.lt('created_at', d7).gte('created_at', d30);
          break;
        case 'esfriando':
          q = q.lt('created_at', d30).gte('created_at', d90);
          break;
        case 'frios':
          q = q.lt('created_at', d90);
          break;
      }

      const { data, error, count } = await q;
      if (error) throw new Error(`[${bucket}] ${error.message}`);
      return { data: data ?? [], count: count ?? 0 };
    }

    const [recentes, em_espera, esfriando, frios] = await Promise.all([
      fetchBucket('recentes'),
      fetchBucket('em_espera'),
      fetchBucket('esfriando'),
      fetchBucket('frios'),
    ]);

    // Total geral de clientes do tenant
    const { count: totalClients } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    const total = recentes.count + em_espera.count + esfriando.count + frios.count;

    return NextResponse.json({
      buckets: {
        recentes:  { data: recentes.data,  count: recentes.count  },
        em_espera: { data: em_espera.data, count: em_espera.count },
        esfriando: { data: esfriando.data, count: esfriando.count },
        frios:     { data: frios.data,     count: frios.count     },
      },
      total,
      total_clients: totalClients ?? 0,
      page,
      per_page: perPage,
    });
  } catch (err) {
    console.error('[reativacao/leads] Erro:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro interno' }, { status: 500 });
  }
}
