/**
 * backfill-address-state.js
 *
 * Problema: 1.937 clientes não têm address_state preenchido na tabela clients,
 * mesmo a maioria tendo endereço completo em custom_fields->demais_dados
 * (clientes vindos via FacilZap).
 *
 * A chave: o endereço completo fica em clients.custom_fields.demais_dados
 * com os campos: estado, cidade, bairro, endereco, numero, complemento, cep.
 *
 * Solução: percorrer todos os clientes sem address_state, extrair o endereço
 * de custom_fields.demais_dados e preencher os campos address_* na tabela.
 *
 * Execução:
 *   node scripts/backfill-address-state.js
 *
 * Variáveis necessárias (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Mapa nome completo → UF ──────────────────────────────────────────────────
const STATE_NAME_TO_UF = {
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

function normalizeState(raw) {
  if (!raw) return null;
  const upper = String(raw).toUpperCase().trim();
  if (VALID_UFS.has(upper)) return upper;
  const mapped = STATE_NAME_TO_UF[upper];
  if (mapped) return mapped;
  // "São Paulo - SP" → "SP"
  const ufMatch = upper.match(/\b([A-Z]{2})\b/);
  if (ufMatch && VALID_UFS.has(ufMatch[1])) return ufMatch[1];
  return null;
}

/**
 * Extrai campos de endereço do objeto demais_dados (formato FacilZap).
 * Exemplo: { cep, bairro, cidade, estado, numero, endereco, complemento }
 */
function extractFromDemaisDados(raw) {
  if (!raw) return null;

  let dd;
  if (typeof raw === 'string') {
    try { dd = JSON.parse(raw); } catch { return null; }
  } else if (typeof raw === 'object') {
    dd = raw;
  } else {
    return null;
  }

  const state = normalizeState(dd.estado || dd.uf || dd.state || null);
  if (!state) return null;

  return {
    address_state: state,
    address_city: String(dd.cidade || dd.city || '').trim() || null,
    address_zip: String(dd.cep || dd.zip || '').replace(/\D/g, '') || null,
    address_neighborhood: String(dd.bairro || dd.neighborhood || '').trim() || null,
    address_street: String(dd.endereco || dd.rua || dd.logradouro || dd.street || '').trim() || null,
    address_number: String(dd.numero || dd.number || '').trim() || null,
    address_complement: String(dd.complemento || dd.complement || '').trim() || null,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔍 Iniciando backfill de endereços (lendo custom_fields.demais_dados)...\n');

  const PAGE = 500;
  let page = 0;
  let keep = true;

  let totalUpdated = 0;
  let totalNotFound = 0;

  while (keep) {
    const { data: clients, error: cErr } = await supabase
      .from('clients')
      .select('id, name, custom_fields')
      .or('address_state.is.null,address_state.eq.')
      .range(page * PAGE, page * PAGE + PAGE - 1)
      .order('created_at', { ascending: false });

    if (cErr) throw new Error('Erro ao buscar clientes: ' + cErr.message);
    if (!clients || clients.length === 0) { keep = false; break; }
    if (clients.length < PAGE) keep = false;
    page++;

    const updates = [];

    for (const client of clients) {
      const cf = client.custom_fields || {};

      // Tentar extrair endereço de demais_dados (FacilZap)
      const fields = extractFromDemaisDados(cf.demais_dados);

      if (fields) {
        updates.push({ id: client.id, ...fields });
      } else {
        totalNotFound++;
      }
    }

    if (updates.length === 0) {
      console.log(`Lote ${page}: nenhum endereço encontrado (${clients.length} clientes sem demais_dados)`);
      continue;
    }

    // Agrupar updates por estado (para fazer update em lote por grupo)
    // Agrupa por combinação de campos de endereço para minimizar queries
    const byKey = new Map();
    for (const row of updates) {
      const { id, ...fields } = row;
      const key = JSON.stringify(fields);
      if (!byKey.has(key)) byKey.set(key, { fields, ids: [] });
      byKey.get(key).ids.push(id);
    }

    for (const { fields, ids } of byKey.values()) {
      // update em lotes de 100 ids por vez
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        const { error: uErr } = await supabase
          .from('clients')
          .update(fields)
          .in('id', batch);
        if (uErr) throw new Error('Erro ao atualizar: ' + uErr.message);
        totalUpdated += batch.length;
      }
    }

    console.log(`✅ Lote ${page}: ${updates.length} clientes atualizados com endereço (${clients.length - updates.length} sem endereço no lote)`);
  }

  console.log('\n──────────────────────────────────────────');
  console.log(`✅ Atualizados:       ${totalUpdated}`);
  console.log(`⚪ Sem endereço:      ${totalNotFound}`);
  console.log('──────────────────────────────────────────');
  console.log('\n💡 Pronto! Recarregue a página de Clientes para ver a distribuição por estado.');
}

main().catch(err => {
  console.error('❌ Erro fatal:', err.message);
  process.exit(1);
});
