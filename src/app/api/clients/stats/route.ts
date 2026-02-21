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
 * Uma única query eficiente — busca só os campos necessários.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    // Busca apenas os campos de agrupamento — sem trazer dados pesados
    const { data, error } = await supabase
      .from('clients')
      .select('source, address_state')
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('❌ Client stats error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data || [];
    const total = rows.length;

    // Agrupar por source
    const sourceMap: Record<string, number> = {};
    for (const row of rows) {
      const key = row.source || 'whatsapp';
      sourceMap[key] = (sourceMap[key] || 0) + 1;
    }
    const by_source = Object.entries(sourceMap)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    // Agrupar por address_state
    const stateMap: Record<string, number> = {};
    for (const row of rows) {
      if (row.address_state) {
        const key = row.address_state.toUpperCase().trim();
        stateMap[key] = (stateMap[key] || 0) + 1;
      }
    }
    const by_state = Object.entries(stateMap)
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ total, by_source, by_state });
  } catch (error) {
    console.error('❌ Client stats error:', error);
    return NextResponse.json({ error: 'Erro ao buscar estatísticas' }, { status: 500 });
  }
}
