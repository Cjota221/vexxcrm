import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * GET /api/clients/stats
 *
 * Retorna contagens agrupadas da base de clientes:
 * - total geral
 * - por source (whatsapp, facilzap, import, manual, campaign)
 * - por address_state (UF)
 *
 * Usa paginação para superar o limite de 1.000 linhas do Supabase,
 * garantindo que toda a base seja contabilizada mesmo com 10.000+ clientes.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    // ── Busca paginada — supera o limite de 1.000 linhas do Supabase ──
    const PAGE_SIZE = 1000;
    let page = 0;
    let allRows: Array<{ source: string | null; address_state: string | null }> = [];
    let keepFetching = true;

    while (keepFetching) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('clients')
        .select('source, address_state')
        .eq('tenant_id', tenantId)
        .range(from, to);

      if (error) {
        console.error('❌ Client stats error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const rows = data || [];
      allRows = allRows.concat(rows);

      // Se vieram menos que PAGE_SIZE, não há mais páginas
      if (rows.length < PAGE_SIZE) {
        keepFetching = false;
      } else {
        page++;
      }
    }

    const total = allRows.length;

    // Agrupar por source
    const sourceMap: Record<string, number> = {};
    for (const row of allRows) {
      const key = row.source || 'whatsapp';
      sourceMap[key] = (sourceMap[key] || 0) + 1;
    }
    const by_source = Object.entries(sourceMap)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    // Agrupar por address_state
    const stateMap: Record<string, number> = {};
    let sem_estado = 0;
    for (const row of allRows) {
      if (row.address_state && row.address_state.trim() !== '') {
        const key = row.address_state.toUpperCase().trim();
        stateMap[key] = (stateMap[key] || 0) + 1;
      } else {
        sem_estado++;
      }
    }
    const by_state = Object.entries(stateMap)
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ total, by_source, by_state, sem_estado });
  } catch (error) {
    console.error('❌ Client stats error:', error);
    return NextResponse.json({ error: 'Erro ao buscar estatísticas' }, { status: 500 });
  }
}
