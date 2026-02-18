import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { PhoneNormalizer } from '@/lib/phone-normalizer';
import {
  getTenantEvolutionConfig,
  fetchChats,
  fetchMessages,
  type EvolutionChat,
  type EvolutionMessage,
} from '@/lib/services/evolution.service';
import { eventBus } from '@/lib/event-bus';

/**
 * POST /api/whatsapp/bulk-sync
 *
 * Sincronização de massa para milhares de chats.
 * Processa em batches para não travar o servidor.
 *
 * Body:
 *   - batchSize: chats por batch (default: 100, max: 500)
 *   - messagesPerChat: mensagens por chat (default: 50, max: 200)
 *   - startFrom: índice para continuar sync interrompido
 *
 * Retorna progresso para UI mostrar barra de loading.
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId, userId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    // Parâmetros
    let batchSize = 100;
    let messagesPerChat = 50;
    let startFrom = 0;

    try {
      const body = await request.json();
      batchSize = Math.min(body.batchSize || 100, 500);
      messagesPerChat = Math.min(body.messagesPerChat || 50, 200);
      startFrom = body.startFrom || 0;
    } catch {
      // Body vazio — usar defaults
    }

    const config = getTenantEvolutionConfig(tenantId);

    // 1. Buscar TODOS os chats da Evolution API
    console.log(`[BulkSync] Iniciando sync de massa para tenant ${tenantId}`);
    let allChats: EvolutionChat[];
    try {
      allChats = await fetchChats(config);
    } catch (err) {
      console.error('[BulkSync] Erro ao buscar chats:', err);
      return NextResponse.json(
        { error: 'Erro ao buscar chats da Evolution API. Verifique a conexão.' },
        { status: 502 }
      );
    }

    console.log(`[BulkSync] ${allChats.length} chats encontrados na Evolution API`);

    // Ordenar por atividade recente
    allChats.sort((a, b) => {
      const tA = a.lastMessage?.messageTimestamp || 0;
      const tB = b.lastMessage?.messageTimestamp || 0;
      return tB - tA;
    });

    // Pegar batch atual
    const chatsBatch = allChats.slice(startFrom, startFrom + batchSize);
    const totalChats = allChats.length;
    const processed = startFrom;
    const remaining = Math.max(0, totalChats - startFrom - chatsBatch.length);

    let clientsCreated = 0;
    let conversationsCreated = 0;
    let messagesInserted = 0;
    let errors = 0;

    // 2. Processar batch em paralelo (com limite de concorrência)
    const CONCURRENCY = 10;
    for (let i = 0; i < chatsBatch.length; i += CONCURRENCY) {
      const chunk = chatsBatch.slice(i, i + CONCURRENCY);
      
      const results = await Promise.allSettled(
        chunk.map(chat => syncOneChat(supabase, tenantId, config, chat, messagesPerChat))
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          clientsCreated += result.value.clientCreated ? 1 : 0;
          conversationsCreated += result.value.conversationCreated ? 1 : 0;
          messagesInserted += result.value.messagesInserted;
        } else {
          errors++;
          console.error('[BulkSync] Erro em chat:', result.reason);
        }
      }

      // Emitir progresso via SSE
      const currentProgress = processed + i + chunk.length;
      eventBus.emitToTenant('sync_progress', tenantId, {
        current: currentProgress,
        total: totalChats,
        percent: Math.round((currentProgress / totalChats) * 100),
        clients: clientsCreated,
        messages: messagesInserted,
      });
    }

    // 3. Retornar resultado com próximo cursor
    const hasMore = remaining > 0;
    const nextStartFrom = hasMore ? startFrom + batchSize : null;

    console.log(`[BulkSync] Batch concluído: ${clientsCreated} clientes, ${conversationsCreated} conversas, ${messagesInserted} mensagens, ${errors} erros`);

    return NextResponse.json({
      success: true,
      data: {
        total_chats: totalChats,
        batch_processed: chatsBatch.length,
        clients_created: clientsCreated,
        conversations_created: conversationsCreated,
        messages_synced: messagesInserted,
        errors,
        has_more: hasMore,
        next_start_from: nextStartFrom,
        progress: {
          current: startFrom + chatsBatch.length,
          total: totalChats,
          percent: Math.round(((startFrom + chatsBatch.length) / totalChats) * 100),
        },
      },
    });
  } catch (error: any) {
    console.error('[BulkSync] Erro:', error);

    if (error.message?.includes('Não autorizado') || error.message?.includes('Token')) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error.message || 'Erro interno' },
      { status: 500 }
    );
  }
}

/**
 * Sincroniza um chat individual.
 * Versão otimizada para bulk sync (menos queries, mais batch inserts).
 */
async function syncOneChat(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  config: ReturnType<typeof getTenantEvolutionConfig>,
  chat: EvolutionChat,
  maxMessages: number
): Promise<{ clientCreated: boolean; conversationCreated: boolean; messagesInserted: number }> {
  const jid = chat.remoteJid;
  
  // Ignorar grupos e broadcasts
  if (jid.includes('@g.us') || jid.includes('@broadcast')) {
    return { clientCreated: false, conversationCreated: false, messagesInserted: 0 };
  }

  const phone = jid.replace('@s.whatsapp.net', '').replace('@lid', '');
  
  // Validar telefone
  if (phone.length < 8 || phone.length > 15) {
    return { clientCreated: false, conversationCreated: false, messagesInserted: 0 };
  }

  const phoneNormalized = PhoneNormalizer.canonical(phone);
  const phoneDisplay = PhoneNormalizer.normalize(phone);
  const pushName = chat.pushName || chat.lastMessage?.pushName || phoneDisplay;

  // 1. Upsert cliente
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .upsert({
      tenant_id: tenantId,
      phone: phoneDisplay,
      phone_normalized: phoneNormalized,
      name: pushName,
      avatar_url: chat.profilePicUrl || null,
    }, {
      onConflict: 'tenant_id,phone_normalized',
      ignoreDuplicates: false,
    })
    .select('id, created_at')
    .single();

  if (clientErr || !client) {
    throw new Error(`Erro ao upsert cliente ${phone}: ${clientErr?.message}`);
  }

  const clientCreated = (Date.now() - new Date(client.created_at).getTime()) < 5000;

  // 2. Buscar ou criar conversa
  let conversationCreated = false;
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('client_id', client.id)
    .eq('channel', 'whatsapp')
    .single();

  let conversationId: string;
  if (existingConv) {
    conversationId = existingConv.id;
  } else {
    const { data: newConv, error: convErr } = await supabase
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        client_id: client.id,
        channel: 'whatsapp',
        status: 'open',
      })
      .select('id')
      .single();

    if (convErr || !newConv) {
      throw new Error(`Erro ao criar conversa: ${convErr?.message}`);
    }

    conversationId = newConv.id;
    conversationCreated = true;
  }

  // 3. Buscar mensagens da Evolution API
  let allMessages: EvolutionMessage[] = [];
  try {
    const batch = await fetchMessages(config, jid, 1, maxMessages);
    allMessages = batch.records.slice(0, maxMessages);
  } catch (err) {
    // Se falhar ao buscar mensagens, continuar (cliente/conversa já criados)
    console.warn(`[BulkSync] Erro ao buscar mensagens de ${jid}:`, err);
    return { clientCreated, conversationCreated, messagesInserted: 0 };
  }

  if (allMessages.length === 0) {
    return { clientCreated, conversationCreated, messagesInserted: 0 };
  }

  // 4. Dedup por external_id
  const externalIds = allMessages.map((m) => m.key.id).filter(Boolean);
  const { data: existingMsgs } = await supabase
    .from('messages')
    .select('external_id')
    .eq('tenant_id', tenantId)
    .eq('conversation_id', conversationId)
    .in('external_id', externalIds);

  const existingSet = new Set((existingMsgs || []).map((m) => m.external_id));
  const newMessages = allMessages.filter((m) => m.key.id && !existingSet.has(m.key.id));

  if (newMessages.length === 0) {
    return { clientCreated, conversationCreated, messagesInserted: 0 };
  }

  // 5. Preparar rows para insert
  const rows = newMessages.map((m) => {
    const msgContent = m.message || {};
    const text =
      (msgContent.conversation as string) ||
      (msgContent.extendedTextMessage as Record<string, unknown>)?.text ||
      (msgContent.imageMessage as Record<string, unknown>)?.caption ||
      (msgContent.videoMessage as Record<string, unknown>)?.caption ||
      '';

    let type = 'text';
    if (msgContent.imageMessage) type = 'image';
    else if (msgContent.videoMessage) type = 'video';
    else if (msgContent.audioMessage) type = 'audio';
    else if (msgContent.documentMessage) type = 'document';
    else if (msgContent.stickerMessage) type = 'sticker';

    let mediaUrl: string | null = null;
    const mediaObj = (msgContent.imageMessage ||
      msgContent.videoMessage ||
      msgContent.audioMessage ||
      msgContent.documentMessage) as Record<string, unknown> | undefined;
    if (mediaObj) {
      mediaUrl = (mediaObj.url as string) || null;
    }

    return {
      tenant_id: tenantId,
      conversation_id: conversationId,
      client_id: client.id,
      external_id: m.key.id,
      direction: m.key.fromMe ? 'outbound' : 'inbound',
      sender_name: m.key.fromMe ? 'Atendente' : (m.pushName || phoneDisplay),
      sender_phone: m.key.fromMe ? null : phone,
      content: text,
      type,
      media_url: mediaUrl,
      status: m.key.fromMe ? 'sent' : 'delivered',
      created_at: m.messageTimestamp
        ? new Date(m.messageTimestamp * 1000).toISOString()
        : new Date().toISOString(),
    };
  });

  // 6. Inserir em batch
  let messagesInserted = 0;
  const { error: insertErr } = await supabase.from('messages').insert(rows);

  if (insertErr) {
    console.error(`[BulkSync] Erro ao inserir mensagens:`, insertErr.message);
  } else {
    messagesInserted = rows.length;
  }

  // 7. Atualizar last_message na conversa
  const lastMsg = rows[rows.length - 1];
  if (lastMsg) {
    await supabase
      .from('conversations')
      .update({
        last_message_text: lastMsg.content || `📎 ${lastMsg.type}`,
        last_message_at: lastMsg.created_at,
        last_message_type: lastMsg.type,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId);
  }

  return { clientCreated, conversationCreated, messagesInserted };
}
