/**
 * fix-dirty-names.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Script ONE-TIME para limpar dados sujos de nome na tabela `clients`.
 *
 * Problema: O motor de sync salvou alguns contatos com o nome da instância
 * WhatsApp (ex: "Cjota Rasteirinhas") em vez do nome real do contato.
 * Isso ocorre porque o campo pushName da Evolution API retorna o nome de quem
 * ENVIOU a mensagem — em mensagens do próprio atendente (fromMe=true), o
 * pushName é o nome da instância, não do cliente.
 *
 * O que este script faz:
 *   1. Lista TODOS os clients onde name = nome sujo (configurável em DIRTY_NAMES)
 *      OU onde name = phone (número sem nome real) E não há name_manual
 *   2. Para cada cliente sujo:
 *      a. Busca um pedido vinculado para pegar o customer_name real
 *      b. Se não houver pedido, tenta buscar o push_name armazenado
 *      c. Fallback: reseta para o número de telefone formatado
 *      d. Limpa o avatar_url se ele for uma URL inválida/vazia
 *   3. Atualiza o client com o nome correto
 *   4. Imprime relatório final
 *
 * Como usar:
 *   1. Copie o .env.local para o mesmo nível do script OU exporte as vars:
 *        $env:NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
 *        $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
 *   2. Execute:
 *        node scripts/fix-dirty-names.js
 *      Modo dry-run (não salva):
 *        node scripts/fix-dirty-names.js --dry-run
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// ─── Configuração ────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Suporta ambos os nomes de variável (SUPABASE_SERVICE_KEY e SUPABASE_SERVICE_ROLE_KEY)
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios.');
  console.error('    Crie um .env.local na raiz do projeto ou exporte as variáveis.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const DRY_RUN = process.argv.includes('--dry-run');

// Nomes conhecidos como "sujos" — nome da instância ou genéricos
// Adicione aqui outros nomes de instância que queira limpar
const DIRTY_NAMES = [
  'Cjota Rasteirinhas',
  'J Rasteirinhas',
  'Cjota',
  'Rasteirinhas',
  'Você',
  'voce',
  'vexx',
  'VEXX',
  'Atendimento',
  'Suporte',
  'Loja',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
  return raw;
}

function isDirtyName(name, phone) {
  if (!name) return true;
  const n = name.trim();
  if (n === '') return true;
  // É um dos nomes proibidos?
  if (DIRTY_NAMES.some(d => n.toLowerCase() === d.toLowerCase())) return true;
  // O nome é só dígitos (número de telefone como nome)?
  if (/^\+?\d[\d\s\-().]+$/.test(n) && n.replace(/\D/g, '').length >= 8) return true;
  // O nome é idêntico ao telefone normalizado?
  const phoneDigits = (phone || '').replace(/\D/g, '');
  const nameDigits = n.replace(/\D/g, '');
  if (phoneDigits && nameDigits && phoneDigits === nameDigits) return true;
  return false;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍  fix-dirty-names.js ${DRY_RUN ? '[DRY-RUN — nada será salvo]' : '[MODO REAL]'}\n`);

  // 1. Buscar todos os clients paginado (evita timeout em tabelas grandes)
  let allClients = [];
  let page = 0;
  const PAGE_SIZE = 500;

  while (true) {
    const { data, error } = await supabase
      .from('clients')
      .select('id, tenant_id, name, phone, phone_normalized, avatar_url, created_at')
      // Não filtramos por name_manual aqui pois a coluna pode não existir ainda
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌  Erro ao buscar clients:', error.message);
      process.exit(1);
    }

    allClients = allClients.concat(data || []);
    if (!data || data.length < PAGE_SIZE) break;
    page++;
  }

  console.log(`📋  Total de clients sem nome_manual: ${allClients.length}`);

  // 2. Filtrar apenas os sujos
  const dirty = allClients.filter(c => isDirtyName(c.name, c.phone));
  console.log(`🗑️   Clients com nome sujo: ${dirty.length}`);

  if (dirty.length === 0) {
    console.log('\n✅  Nenhum dado sujo encontrado. Banco limpo!\n');
    return;
  }

  // 3. Mostrar preview
  console.log('\n📝  Preview dos primeiros 20:');
  dirty.slice(0, 20).forEach((c, i) => {
    console.log(`  ${i + 1}. [${c.id.slice(0,8)}] nome="${c.name}" | phone="${c.phone}"`);
  });
  if (dirty.length > 20) console.log(`  ... e mais ${dirty.length - 20} registros.\n`);

  if (DRY_RUN) {
    console.log('\n⚠️   DRY-RUN: execute sem --dry-run para aplicar as correções.\n');
    return;
  }

  // 4. Corrigir cada cliente sujo
  let fixed = 0;
  let skipped = 0;
  let errors = 0;

  for (const client of dirty) {
    try {
      let newName = null;

      // Estratégia A: nome do pedido vinculado
      const { data: order } = await supabase
        .from('orders')
        .select('customer_name')
        .eq('tenant_id', client.tenant_id)
        .eq('client_id', client.id)
        .not('customer_name', 'is', null)
        .neq('customer_name', '')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (order?.customer_name && !isDirtyName(order.customer_name, client.phone)) {
        newName = order.customer_name.trim();
      }

      // Estratégia B: push_name armazenado (disponível após migration 011)
      if (!newName && client.push_name && !isDirtyName(client.push_name, client.phone)) {
        newName = client.push_name.trim();
      }

      // Estratégia C: fallback para telefone formatado
      if (!newName) {
        newName = formatPhone(client.phone) || client.phone_normalized || client.phone || 'Sem nome';
      }

      if (newName === client.name) {
        skipped++;
        continue;
      }

      // Avatar: limpar se for string vazia ou malformada
      const updates = { name: newName };
      if (!client.avatar_url || client.avatar_url.trim() === '' || !client.avatar_url.startsWith('http')) {
        updates.avatar_url = null;
      }

      const { error: updateErr } = await supabase
        .from('clients')
        .update(updates)
        .eq('id', client.id)
        .eq('tenant_id', client.tenant_id);

      if (updateErr) {
        console.error(`  ❌ [${client.id.slice(0,8)}] Erro: ${updateErr.message}`);
        errors++;
      } else {
        console.log(`  ✅ [${client.id.slice(0,8)}] "${client.name}" → "${newName}"`);
        fixed++;
      }
    } catch (err) {
      console.error(`  ❌ [${client.id.slice(0,8)}] Exceção: ${err.message}`);
      errors++;
    }
  }

  // 5. Relatório final
  console.log('\n─────────────────────────────────────────────────────');
  console.log(`✅  Corrigidos : ${fixed}`);
  console.log(`⏭️   Ignorados  : ${skipped} (nome já estava correto)`);
  console.log(`❌  Erros      : ${errors}`);
  console.log('─────────────────────────────────────────────────────');
  console.log('\n💡  Dica: agora rode uma nova sincronização para re-buscar os pushNames');
  console.log('         e avatars atualizados da Evolution API.\n');
}

main().catch(err => {
  console.error('\n💥 Erro fatal:', err.message);
  process.exit(1);
});
