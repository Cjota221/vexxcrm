/**
 * fix-names-from-evolution.js
 *
 * Busca TODOS os contatos salvos na Evolution API (que têm pushName real)
 * e atualiza clients.name + clients.avatar_url para os que ainda têm
 * nome=telefone no banco.
 *
 * Fluxo:
 *   1. Busca todos os contatos na Evolution API (/chat/findContacts)
 *   2. Filtra os que têm pushName válido (não vazio, não numérico, não instância)
 *   3. Para cada contato, normaliza o telefone
 *   4. Busca o client no banco pelo phone_normalized
 *   5. Se o client tem nome=telefone → atualiza com pushName
 *   6. Se tem profilePicUrl → faz cache no Storage
 *
 * Uso:
 *   node scripts/fix-names-from-evolution.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const TENANT_ID      = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';
const EVOLUTION_URL  = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const EVOLUTION_KEY  = process.env.EVOLUTION_GLOBAL_KEY || process.env.EVOLUTION_API_KEY;
const INSTANCE       = `vexx-${TENANT_ID.replace(/-/g, '').slice(0, 12)}`;

if (!EVOLUTION_URL || !EVOLUTION_KEY) {
  console.error('❌ EVOLUTION_API_URL e EVOLUTION_GLOBAL_KEY são obrigatórios no .env.local');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normaliza telefone para o formato phone_normalized do banco (55+DDD+8dígitos) */
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  // A Evolution já devolve o número no formato 556282237075 (55+DDD+8dígitos = 12)
  // O banco armazena phone_normalized também nesse formato (sem o 9 extra)
  // Se vier com 13 dígitos (55+DDD+9dígitos), remove o 9 para bater com o banco
  if (digits.length === 13 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const num = digits.slice(4); // 9 dígitos
    if (num.startsWith('9') && num.length === 9) {
      return '55' + ddd + num.slice(1); // 12 dígitos
    }
  }
  // 12 dígitos (55+DDD+8) → já está no formato certo
  if (digits.length === 12 && digits.startsWith('55')) return digits;
  // Sem DDI → adiciona 55
  if (digits.length === 11) return '55' + digits.slice(0,2) + digits.slice(3); // remove 9
  if (digits.length === 10) return '55' + digits;
  return digits.startsWith('55') ? digits : '55' + digits;
}

/** Gera variantes do phone_normalized para aumentar chance de match */
function phoneVariants(digits) {
  const variants = new Set();
  variants.add(digits);
  // Com DDI 55
  if (!digits.startsWith('55')) variants.add('55' + digits);
  // Sem o 9 extra (13→12)
  if (digits.length === 13 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const num = digits.slice(4);
    if (num.startsWith('9')) variants.add('55' + ddd + num.slice(1));
  }
  // Com o 9 extra (12→13)
  if (digits.length === 12 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const num = digits.slice(4);
    variants.add('55' + ddd + '9' + num);
  }
  return Array.from(variants);
}

/** Verifica se nome é apenas um número de telefone (sem nome real) */
function isPhoneName(name) {
  if (!name || !name.trim()) return true;
  const stripped = name.replace(/[\s\-\+\(\)]/g, '');
  return /^\d{8,15}$/.test(stripped);
}

/** Verifica se um nome é válido (não é telefone, não é "Loja", etc.) */
function isGoodName(name) {
  if (!name || !name.trim()) return false;
  const t = name.trim();
  if (t.length < 3) return false;
  if (['loja', 'você', 'voce'].includes(t.toLowerCase())) return false;
  if (isPhoneName(t)) return false;
  return true;
}

/** Faz cache da foto no Supabase Storage, retorna URL permanente */
async function cacheAvatar(clientId, picUrl) {
  try {
    const res = await fetch(picUrl, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const ext = ct.includes('png') ? 'png' : 'jpg';
    const path = `${TENANT_ID}/clients/${clientId}.${ext}`;
    await supabase.storage.from('avatars').upload(path, buffer, { contentType: ct, upsert: true });
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    return pub.publicUrl || null;
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔄 FIX NAMES FROM EVOLUTION — Iniciando...\n');
  console.log(`   Instância: ${INSTANCE}`);

  // ── 1. Buscar todos os contatos na Evolution API ──────────────────────────
  console.log('\n📡 Buscando contatos na Evolution API...');
  const res = await fetch(`${EVOLUTION_URL}/chat/findContacts/${INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
    body: JSON.stringify({ where: {} }),
  });

  if (!res.ok) {
    console.error('❌ Erro ao buscar contatos:', res.status, await res.text());
    process.exit(1);
  }

  const raw = await res.json();
  const contacts = Array.isArray(raw) ? raw : (raw.contacts || raw.data || []);
  console.log(`   ✅ ${contacts.length} contatos encontrados na Evolution\n`);

  // ── 2. Filtrar contatos com pushName válido ────────────────────────────────
  const INSTANCE_NAMES = ['Cjota Rasteirinhas', 'cjota', INSTANCE];
  const valid = contacts.filter(c => {
    if (!c.remoteJid?.includes('@s.whatsapp.net')) return false; // pular grupos
    const push = c.pushName || '';
    if (!isGoodName(push)) return false;
    if (INSTANCE_NAMES.some(n => push.toLowerCase().includes(n.toLowerCase()))) return false;
    return true;
  });
  console.log(`   📋 Contatos com pushName válido: ${valid.length}`);

  // ── 3. Buscar TODOS os clients com nome=telefone do banco ─────────────────
  const { data: allClients, error: clientErr } = await supabase
    .from('clients')
    .select('id, name, phone, phone_normalized, avatar_url')
    .eq('tenant_id', TENANT_ID);

  if (clientErr) {
    console.error('❌ Erro ao buscar clients:', clientErr.message);
    process.exit(1);
  }

  // Montar mapa: phone_normalized → client (somente os com nome sujo)
  // O phone_normalized do banco é 12 dígitos: 55+DDD+8
  // O JID da Evolution também vem como 55+DDD+8 → match direto
  const dirtyMap = new Map();
  // Mapa secundário por phone bruto (13 dígitos) para fallback
  const dirtyByPhone = new Map();
  for (const c of allClients) {
    if (isPhoneName(c.name)) {
      if (c.phone_normalized) dirtyMap.set(c.phone_normalized, c);
      if (c.phone) dirtyByPhone.set(c.phone.replace(/\D/g,''), c);
    }
  }
  const dirtyCount = new Set([...allClients.filter(c => isPhoneName(c.name)).map(c => c.id)]).size;
  console.log(`   📱 Clients com nome=telefone no banco: ${dirtyCount}\n`);

  // ── 4. Cruzar e atualizar ─────────────────────────────────────────────────
  let updatedNames  = 0;
  let updatedPhotos = 0;
  let skipped       = 0;

  for (const contact of valid) {
    const jidDigits = contact.remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    
    // Match 1: phone_normalized direto (JID 12 dígitos = phone_normalized)
    let client = dirtyMap.get(jidDigits);
    
    // Match 2: phone bruto (JID pode vir com 13 dígitos = phone com 9 extra)
    if (!client) client = dirtyByPhone.get(jidDigits);
    
    // Match 3: adiciona/remove o 9 extra e tenta de novo
    if (!client && jidDigits.length === 12 && jidDigits.startsWith('55')) {
      const withNine = '55' + jidDigits.slice(2, 4) + '9' + jidDigits.slice(4);
      client = dirtyByPhone.get(withNine) || dirtyMap.get(withNine);
    }

    if (!client) {
      skipped++;
      continue;
    }

    const pushName  = contact.pushName.trim();
    const picUrl    = contact.profilePicUrl || null;
    const updates   = {};

    // Atualizar nome se ainda é telefone
    if (isPhoneName(client.name) && isGoodName(pushName)) {
      updates.name = pushName;
    }

    // Atualizar foto se não tem e há URL disponível
    if (!client.avatar_url && picUrl) {
      const cached = await cacheAvatar(client.id, picUrl);
      if (cached) updates.avatar_url = cached;
    }

    if (Object.keys(updates).length === 0) {
      skipped++;
      continue;
    }

    const { error: upErr } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', client.id)
      .eq('tenant_id', TENANT_ID);

    if (upErr) {
      console.error(`  ❌ Erro ao atualizar ${phone}:`, upErr.message);
    } else {
      if (updates.name)       { updatedNames++;  console.log(`  ✅ Nome: "${client.name}" → "${pushName}"`); }
      if (updates.avatar_url) { updatedPhotos++; }
      // Remover do mapa
      dirtyMap.delete(client.phone_normalized);
      if (client.phone) dirtyByPhone.delete(client.phone.replace(/\D/g,''));
    }
  }

  // ── 5. Resumo ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════');
  console.log('📊 RESUMO FINAL:');
  console.log(`   ✅ Nomes atualizados:  ${updatedNames}`);
  console.log(`   🖼️  Fotos atualizadas:  ${updatedPhotos}`);
  console.log(`   ⚠️  Sem match no banco: ${skipped}`);
  console.log(`   📱 Ainda sem nome real: ${dirtyMap.size}`);
  console.log('═══════════════════════════════════════\n');

  if (dirtyMap.size > 0) {
    console.log('ℹ️  Os', dirtyMap.size, 'restantes não têm histórico de mensagens na Evolution');
    console.log('   (são clientes de pedidos que nunca mandaram mensagem no WhatsApp)');
  }
}

main().catch(console.error);
