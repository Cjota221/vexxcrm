import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/* ── Normalizar estado → UF de 2 letras ──────────────────────────────────
 * Converte nomes completos ("São Paulo", "MINAS GERAIS") e variações
 * para sigla padrão ("SP", "MG"). Garante que a distribuição agrupe
 * corretamente mesmo quando a planilha importada usava nome completo.
 */
const STATE_NAME_TO_UF: Record<string, string> = {
  'ACRE': 'AC', 'ALAGOAS': 'AL', 'AMAPÁ': 'AP', 'AMAPA': 'AP',
  'AMAZONAS': 'AM', 'BAHIA': 'BA', 'CEARÁ': 'CE', 'CEARA': 'CE',
  'DISTRITO FEDERAL': 'DF', 'ESPÍRITO SANTO': 'ES', 'ESPIRITO SANTO': 'ES',
  'GOIÁS': 'GO', 'GOIAS': 'GO', 'MARANHÃO': 'MA', 'MARANHAO': 'MA',
  'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS',
  'MINAS GERAIS': 'MG', 'PARÁ': 'PA', 'PARA': 'PA',
  'PARAÍBA': 'PB', 'PARAIBA': 'PB', 'PARANÁ': 'PR', 'PARANA': 'PR',
  'PERNAMBUCO': 'PE', 'PIAUÍ': 'PI', 'PIAUI': 'PI',
  'RIO DE JANEIRO': 'RJ', 'RIO GRANDE DO NORTE': 'RN',
  'RIO GRANDE DO SUL': 'RS', 'RONDÔNIA': 'RO', 'RONDONIA': 'RO',
  'RORAIMA': 'RR', 'SANTA CATARINA': 'SC', 'SÃO PAULO': 'SP',
  'SAO PAULO': 'SP', 'SERGIPE': 'SE', 'TOCANTINS': 'TO',
};

const VALID_UFS = new Set([
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
  'SP','SE','TO',
]);

function normalizeState(raw: string): string | null {
  const upper = raw.toUpperCase().trim();
  // Já é UF válida de 2 letras
  if (VALID_UFS.has(upper)) return upper;
  // Tentar converter nome completo → UF
  const mapped = STATE_NAME_TO_UF[upper];
  if (mapped) return mapped;
  // Tentar match parcial (ex: "São Paulo - SP" → "SP")
  const ufMatch = upper.match(/\b([A-Z]{2})\b/);
  if (ufMatch && VALID_UFS.has(ufMatch[1])) return ufMatch[1];
  return null;
}

/**
 * GET /api/clients/stats
 *
 * Retorna contagens agrupadas da base de clientes:
 * - total geral
 * - por source (whatsapp, facilzap, import, manual, campaign)
 * - por address_state (UF normalizada)
 *
 * Usa paginação para superar o limite de 1.000 linhas do Supabase,
 * garantindo que toda a base seja contabilizada mesmo com 10.000+ clientes.
 * Normaliza estados para UF de 2 letras (ex: "São Paulo" → "SP").
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

    // Agrupar por address_state — normaliza para UF de 2 letras
    const stateMap: Record<string, number> = {};
    let sem_estado = 0;
    for (const row of allRows) {
      if (row.address_state && row.address_state.trim() !== '') {
        const uf = normalizeState(row.address_state);
        if (uf) {
          stateMap[uf] = (stateMap[uf] || 0) + 1;
        } else {
          // Valor existe mas não reconhecido como estado brasileiro
          sem_estado++;
        }
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
