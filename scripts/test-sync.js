/**
 * Script de teste: Sync rápido dos 5 chats mais recentes
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const TENANT_ID = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';
const API_URL = process.env.EVOLUTION_API_URL.replace(/\/$/, '');
const API_KEY = process.env.EVOLUTION_GLOBAL_KEY;
const INSTANCE = 'vexx-8aa3a7e7cbb5';

async function main() {
  console.log('Buscando chats da Evolution API...');
  
  const r = await fetch(`${API_URL}/chat/findChats/${INSTANCE}`, {
    method: 'POST',
    headers: { apikey: API_KEY, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const allChats = await r.json();
  
  const chats = allChats
    .filter(c => c.remoteJid.includes('@s.whatsapp.net') && c.remoteJid !== '0@s.whatsapp.net')
    .sort((a, b) => (b.lastMessage?.messageTimestamp || 0) - (a.lastMessage?.messageTimestamp || 0))
    .slice(0, 5);

  console.log(`Total real: ${allChats.filter(c => c.remoteJid.includes('@s.whatsapp.net')).length}, syncing top 5`);

  for (const chat of chats) {
    const phone = chat.remoteJid.replace('@s.whatsapp.net', '');
    const name = chat.pushName || chat.lastMessage?.pushName || phone;
    console.log(`\n→ ${phone} (${name})`);

    // Upsert client
    const { data: client, error: clErr } = await sb
      .from('clients')
      .upsert(
        { tenant_id: TENANT_ID, phone, phone_normalized: phone, name },
        { onConflict: 'tenant_id,phone_normalized', ignoreDuplicates: false }
      )
      .select('id')
      .single();

    if (clErr) { console.log('  ❌ client:', clErr.message); continue; }
    console.log(`  ✅ client: ${client.id}`);

    // Conversation
    let convId;
    const { data: conv } = await sb
      .from('conversations')
      .select('id')
      .eq('tenant_id', TENANT_ID)
      .eq('client_id', client.id)
      .eq('channel', 'whatsapp')
      .single();

    if (conv) {
      convId = conv.id;
      console.log(`  ℹ conv exists: ${convId}`);
    } else {
      const { data: nc, error: ncErr } = await sb
        .from('conversations')
        .insert({ tenant_id: TENANT_ID, client_id: client.id, channel: 'whatsapp', status: 'open' })
        .select('id')
        .single();
      if (ncErr) { console.log('  ❌ conv:', ncErr.message); continue; }
      convId = nc.id;
      console.log(`  ✅ conv created: ${convId}`);
    }

    // Fetch messages
    const mr = await fetch(`${API_URL}/chat/findMessages/${INSTANCE}`, {
      method: 'POST',
      headers: { apikey: API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: { key: { remoteJid: chat.remoteJid } }, page: 1, offset: 20 }),
    });
    const md = await mr.json();
    const msgs = md.messages?.records || [];
    console.log(`  📨 ${msgs.length} messages from Evolution`);

    if (msgs.length === 0) continue;

    // Map to rows
    const rows = msgs.map(m => {
      const mc = m.message || {};
      const txt = mc.conversation || mc.extendedTextMessage?.text || mc.imageMessage?.caption || mc.videoMessage?.caption || '';
      let tp = 'text';
      if (mc.imageMessage) tp = 'image';
      else if (mc.videoMessage) tp = 'video';
      else if (mc.audioMessage) tp = 'audio';
      else if (mc.documentMessage) tp = 'document';

      return {
        tenant_id: TENANT_ID,
        conversation_id: convId,
        client_id: client.id,
        external_id: m.key.id,
        direction: m.key.fromMe ? 'outbound' : 'inbound',
        sender_name: m.key.fromMe ? 'Atendente' : (m.pushName || phone),
        sender_phone: m.key.fromMe ? null : phone,
        content: txt,
        type: tp,
        status: m.key.fromMe ? 'sent' : 'delivered',
        created_at: m.messageTimestamp
          ? new Date(m.messageTimestamp * 1000).toISOString()
          : new Date().toISOString(),
      };
    });

    // Insert
    const { error: ie } = await sb.from('messages').insert(rows);
    if (ie) {
      console.log(`  ❌ insert: ${ie.message}`);
    } else {
      console.log(`  ✅ ${rows.length} messages inserted`);
    }

    // Update conversation
    const last = rows[rows.length - 1];
    await sb.from('conversations').update({
      last_message_text: last.content || `📎 ${last.type}`,
      last_message_at: last.created_at,
      last_message_type: last.type,
      message_count: rows.length,
      updated_at: new Date().toISOString(),
    }).eq('id', convId);
  }

  // Verify
  const { data: convs } = await sb.from('conversations')
    .select('id')
    .eq('tenant_id', TENANT_ID);
  const { count } = await sb.from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  
  console.log(`\n✅ RESULTADO: ${convs?.length || 0} conversations, ${count || 0} messages no Supabase`);
}

main().catch(console.error);
