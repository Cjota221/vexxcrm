/**
 * full-sync.js
 *
 * Sincronização COMPLETA de todos os chats da Evolution API → Supabase.
 * Roda LOCALMENTE (sem timeout do Netlify).
 *
 * Uso:
 *   node scripts/full-sync.js
 *
 * Funcionalidades:
 *   - Sincroniza TODOS os chats (sem limite)
 *   - Salva progresso em full-sync-progress.json (pode continuar de onde parou)
 *   - Busca e cacheia fotos de perfil permanentemente no Storage
 *   - Resolve nomes corretamente (não usa nome da instância)
 *   - Deduplicação por external_id (não duplica mensagens)
 *   - Relatório final detalhado
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// ── Configuração ──────────────────────────────────────────────────────────────

const TENANT_ID     = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';
const EVOLUTION_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const EVOLUTION_KEY = process.env.EVOLUTION_GLOBAL_KEY || process.env.EVOLUTION_API_KEY;
const INSTANCE      = `vexx-${TENANT_ID.replace(/-/g, '').slice(0, 12)}`;
const PROGRESS_FILE = path.join(__dirname, 'full-sync-progress.json');

const MSGS_PER_CHAT  = 200;   // mensagens por chat
const DELAY_BETWEEN  = 300;   // ms entre chats (evitar rate limit)
const AVATAR_DELAY   = 800;   // ms entre buscas de foto

// Nomes da instância que não devem ser salvos como nome de cliente
const INSTANCE_BLACKLIST = [
  'cjota rasteirinhas', 'cjota', 'você', 'voce', 'loja',
  'atendente', 'desconhecido',
];

if (!EVOLUTION_URL || !EVOLUTION_KEY) {
  console.error('❌ EVOLUTION_API_URL e EVOLUTION_GLOBAL_KEY são obrigatórios no .env.local');
  process.exit(1);
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios no .env.local');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function isInstanceName(name) {
  if (!name || !name.trim()) return true;
  const lower = name.trim().toLowerCase();
  if (INSTANCE_BLACKLIST.some(b => lower.includes(b))) return true;
  if (/^\d{8,15}$/.test(name.replace(/\D/g, ''))) return true;
  return false;
}

function normalizePhone(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const num = digits.slice(4);
    if (num.startsWith('9')) return '55' + ddd + num.slice(1);
  }
  if (digits.length === 12 && digits.startsWith('55')) return digits;
  if (digits.length === 11) return '55' + digits.slice(0, 2) + digits.slice(3);
  if (digits.length === 10) return '55' + digits;
  return digits.startsWith('55') ? digits : '55' + digits;
}

function formatPhone(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const num = digits.slice(4);
    return '55' + ddd + '9' + num;
  }
  return digits;
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      console.log(`📂 Progresso anterior encontrado: ${data.processed} chats processados`);
      return data;
    }
  } catch { /* ignorar */ }
  return { processed: 0, processedJids: [], errors: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ── Evolution API ─────────────────────────────────────────────────────────────

async function fetchAllChats() {
  const res = await fetch(`${EVOLUTION_URL}/chat/findChats/${INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Erro ao buscar chats: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const chats = Array.isArray(data) ? data : (data.chats || data.data || []);
  return chats.filter(c =>
    c.remoteJid?.includes('@s.whatsapp.net') &&
    c.remoteJid !== '0@s.whatsapp.net'
  );
}

async function fetchMessages(jid, page = 1, offset = 100) {
  const res = await fetch(`${EVOLUTION_URL}/chat/findMessages/${INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
    body: JSON.stringify({ where: { key: { remoteJid: jid } }, page, offset }),
  });
  if (!res.ok) return { total: 0, pages: 0, records: [] };
  const data = await res.json();
  return {
    total: data.messages?.total || 0,
    pages: data.messages?.pages || 0,
    records: data.messages?.records || [],
  };
}

async function fetchProfilePic(phone) {
  try {
    const res = await fetch(`${EVOLUTION_URL}/chat/fetchProfilePictureUrl/${INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
      body: JSON.stringify({ number: phone }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.profilePictureUrl || data.profilePicUrl || data.picture || null;
  } catch { return null; }
}

// ── Supabase Storage ──────────────────────────────────────────────────────────

async function cacheAvatar(clientId, picUrl) {
  try {
    const res = await fetch(picUrl, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const ext = ct.includes('png') ? 'png' : 'jpg';
    const storagePath = `${TENANT_ID}/clients/${clientId}.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(storagePath, buffer, { contentType: ct, upsert: true });
    if (error) return null;
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(storagePath);
    return pub.publicUrl || null;
  } catch { return null; }
}

// ── Sync de um chat ───────────────────────────────────────────────────────────

async function syncChat(chat, avatarQueue) {
  const jid = chat.remoteJid;
  const phone = jid.replace('@s.whatsapp.net', '');
  if (phone.length < 8 || phone.length > 15) return { skipped: true };

  const phoneNormalized = normalizePhone(phone);
  const phoneDisplay = formatPhone(phone);

  // Resolver nome
  const rawPushName = chat.pushName || chat.lastMessage?.pushName || '';
  const safePushName = !isInstanceName(rawPushName) ? rawPushName.trim() : '';

  // Buscar cliente existente
  const { data: existing } = await supabase
    .from('clients')
    .select('id, name, name_manual, avatar_url')
    .eq('tenant_id', TENANT_ID)
    .eq('phone_normalized', phoneNormalized)
    .maybeSingle();

  let resolvedName;
  if (existing?.name_manual) {
    resolvedName = existing.name_manual;
  } else if (safePushName) {
    resolvedName = safePushName;
  } else if (existing?.name && !/^\d/.test(existing.name)) {
    resolvedName = existing.name;
  } else {
    resolvedName = phoneDisplay;
  }

  // Upsert cliente (sem avatar_url — será atualizado depois)
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .upsert(
      { tenant_id: TENANT_ID, phone: phoneDisplay, phone_normalized: phoneNormalized, name: resolvedName },
      { onConflict: 'tenant_id,phone_normalized', ignoreDuplicates: false }
    )
    .select('id, avatar_url')
    .single();

  if (clientErr || !client) return { error: clientErr?.message || 'Erro ao criar cliente' };

  // Adicionar à fila de avatares se não tem foto permanente
  const hasPermAvatar = client.avatar_url?.includes('supabase.co/storage');
  if (!hasPermAvatar) {
    avatarQueue.push({ clientId: client.id, phone: phoneNormalized });
  }

  // Buscar ou criar conversa
  let convId;
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('client_id', client.id)
    .eq('channel', 'whatsapp')
    .maybeSingle();

  if (conv) {
    convId = conv.id;
  } else {
    const { data: newConv, error: convErr } = await supabase
      .from('conversations')
      .insert({ tenant_id: TENANT_ID, client_id: client.id, channel: 'whatsapp', status: 'open' })
      .select('id')
      .single();
    if (convErr || !newConv) return { error: convErr?.message || 'Erro ao criar conversa' };
    convId = newConv.id;
  }

  // Buscar e inserir mensagens
  let totalInserted = 0;
  let page = 1;

  while (totalInserted < MSGS_PER_CHAT) {
    const batch = await fetchMessages(jid, page, 100);
    if (batch.records.length === 0) break;

    const extIds = batch.records.map(m => m.key.id).filter(Boolean);
    const { data: existingMsgs } = await supabase
      .from('messages')
      .select('external_id')
      .eq('tenant_id', TENANT_ID)
      .eq('conversation_id', convId)
      .in('external_id', extIds);

    const existSet = new Set((existingMsgs || []).map(m => m.external_id));
    const newMsgs = batch.records.filter(m => m.key.id && !existSet.has(m.key.id));

    if (newMsgs.length > 0) {
      const rows = newMsgs.map(m => {
        const mc = m.message || {};
        const text = mc.conversation || mc.extendedTextMessage?.text ||
          mc.imageMessage?.caption || mc.videoMessage?.caption || '';

        let type = 'text';
        if (mc.imageMessage) type = 'image';
        else if (mc.videoMessage) type = 'video';
        else if (mc.audioMessage) type = 'audio';
        else if (mc.documentMessage) type = 'document';
        else if (mc.stickerMessage) type = 'sticker';

        const mediaObj = mc.imageMessage || mc.videoMessage || mc.audioMessage || mc.documentMessage;
        const mediaUrl = mediaObj?.url || mediaObj?.directPath || null;
        const mediaMime = mediaObj?.mimetype || null;

        return {
          tenant_id: TENANT_ID,
          conversation_id: convId,
          client_id: client.id,
          external_id: m.key.id,
          direction: m.key.fromMe ? 'outbound' : 'inbound',
          sender_name: m.key.fromMe ? 'Atendente' : (m.pushName || phoneDisplay),
          sender_phone: m.key.fromMe ? null : phone,
          content: text,
          type,
          media_url: mediaUrl,
          media_mime_type: mediaMime,
          status: m.key.fromMe ? 'sent' : 'delivered',
          created_at: m.messageTimestamp
            ? new Date(m.messageTimestamp * 1000).toISOString()
            : new Date().toISOString(),
        };
      });

      // Inserir em batches de 50
      for (let i = 0; i < rows.length; i += 50) {
        const { error: insErr } = await supabase.from('messages').insert(rows.slice(i, i + 50));
        if (!insErr) totalInserted += Math.min(50, rows.length - i);
      }
    }

    if (page >= batch.pages) break;
    page++;
  }

  // Atualizar last_message na conversa
  if (totalInserted > 0) {
    const { data: lastMsg } = await supabase
      .from('messages')
      .select('content, type, created_at')
      .eq('tenant_id', TENANT_ID)
      .eq('conversation_id', convId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (lastMsg) {
      await supabase
        .from('conversations')
        .update({
          last_message_text: lastMsg.content || `📎 ${lastMsg.type}`,
          last_message_at: lastMsg.created_at,
          last_message_type: lastMsg.type,
          updated_at: new Date().toISOString(),
        })
        .eq('id', convId)
        .eq('tenant_id', TENANT_ID);
    }
  }

  return { messagesInserted: totalInserted };
}

// ── Processar fila de avatares ────────────────────────────────────────────────

async function processAvatarQueue(queue) {
  console.log(`\n🖼️  Processando fotos de perfil: ${queue.length} clientes sem foto permanente...`);
  let cached = 0;
  let noPhoto = 0;

  for (let i = 0; i < queue.length; i++) {
    const { clientId, phone } = queue[i];
    process.stdout.write(`\r   Foto ${i + 1}/${queue.length} — ${cached} salvas`);

    const picUrl = await fetchProfilePic(phone);
    if (picUrl) {
      const permanentUrl = await cacheAvatar(clientId, picUrl);
      if (permanentUrl) {
        await supabase
          .from('clients')
          .update({ avatar_url: permanentUrl })
          .eq('id', clientId)
          .eq('tenant_id', TENANT_ID);
        cached++;
      } else {
        noPhoto++;
      }
    } else {
      noPhoto++;
    }

    // Delay para evitar rate limit do WhatsApp
    if (i < queue.length - 1) await sleep(AVATAR_DELAY);
  }

  console.log(`\n   ✅ Fotos salvas: ${cached} | ⚠️ Sem foto: ${noPhoto}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 FULL SYNC — Sincronização Completa');
  console.log(`   Instância : ${INSTANCE}`);
  console.log(`   Tenant    : ${TENANT_ID}`);
  console.log(`   Evolution : ${EVOLUTION_URL}\n`);

  // Carregar progresso anterior
  const progress = loadProgress();

  // Buscar todos os chats
  console.log('📡 Buscando todos os chats da Evolution API...');
  const allChats = await fetchAllChats();
  allChats.sort((a, b) => (b.lastMessage?.messageTimestamp || 0) - (a.lastMessage?.messageTimestamp || 0));
  console.log(`   ✅ ${allChats.length} chats encontrados\n`);

  // Filtrar já processados
  const processedSet = new Set(progress.processedJids || []);
  const pending = allChats.filter(c => !processedSet.has(c.remoteJid));
  console.log(`   📋 Pendentes: ${pending.length} | Já processados: ${processedSet.size}\n`);

  const avatarQueue = [];
  let syncedChats = 0;
  let syncedMessages = 0;
  let errors = 0;
  const startTime = Date.now();

  for (let i = 0; i < pending.length; i++) {
    const chat = pending[i];
    const overall = processedSet.size + i + 1;
    const pct = Math.round((overall / allChats.length) * 100);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const rate = i > 0 ? (elapsed / i).toFixed(1) : '...';
    const remaining = i > 0 ? Math.round((pending.length - i) * elapsed / i) : '...';

    process.stdout.write(
      `\r[${overall}/${allChats.length}] ${pct}% | ` +
      `✅ ${syncedChats} chats | 💬 ${syncedMessages} msgs | ❌ ${errors} erros | ` +
      `⏱ ${elapsed}s | ~${remaining}s restantes`
    );

    try {
      const result = await syncChat(chat, avatarQueue);
      if (!result.skipped && !result.error) {
        syncedChats++;
        syncedMessages += result.messagesInserted || 0;
      } else if (result.error) {
        errors++;
        progress.errors.push({ jid: chat.remoteJid, error: result.error });
      }
      progress.processedJids.push(chat.remoteJid);
      progress.processed = (processedSet.size + i + 1);
    } catch (err) {
      errors++;
      progress.errors.push({ jid: chat.remoteJid, error: err.message });
    }

    // Salvar progresso a cada 50 chats
    if ((i + 1) % 50 === 0) saveProgress(progress);

    await sleep(DELAY_BETWEEN);
  }

  // Salvar progresso final
  saveProgress(progress);

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log('\n\n═══════════════════════════════════════════');
  console.log('📊 SYNC DE CHATS CONCLUÍDO:');
  console.log(`   ✅ Chats sincronizados : ${syncedChats}`);
  console.log(`   💬 Mensagens inseridas : ${syncedMessages}`);
  console.log(`   ❌ Erros               : ${errors}`);
  console.log(`   ⏱  Tempo total         : ${Math.floor(totalTime / 60)}min ${totalTime % 60}s`);
  console.log('═══════════════════════════════════════════\n');

  // Processar fotos em lote separado
  if (avatarQueue.length > 0) {
    await processAvatarQueue(avatarQueue);
  }

  console.log('\n🎉 SYNC COMPLETO FINALIZADO!');

  // Limpar arquivo de progresso ao concluir tudo com sucesso
  if (errors === 0 && fs.existsSync(PROGRESS_FILE)) {
    fs.unlinkSync(PROGRESS_FILE);
    console.log('   Arquivo de progresso removido (sync completo sem erros)');
  }
}

main().catch(err => {
  console.error('\n❌ Erro fatal:', err.message);
  console.log('   Rode novamente para continuar de onde parou.');
  process.exit(1);
});
