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
 * Sincronização AGRESSIVA para importar até 24 mil mensagens.
 * Pagina TODOS os chats e TODAS as mensagens de cada chat.
 *
 * Body:
 *   - batchSize: chats por batch (default: 50, max: 200)
 *   - messagesPerChat: mensagens por chat (default: 200, max: 1000)
 *   - startFrom: índice para continuar sync interrompido
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    // Parâmetros
    let batchSize = 50;
    let messagesPerChat = 200;
    let startFrom = 0;

    try {
      const body = await request.json();
      batchSize = Math.min(body.batchSize || 50, 200);
      messagesPerChat = Math.min(body.messagesPerChat || 200, 1000);
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
    const remaining = Math.max(0, totalChats - startFrom - chatsBatch.length);

    let clientsCreated = 0;
    let conversationsCreated = 0;
    let messagesInserted = 0;
    let errors = 0;

    // 2. Processar batch com concorrência controlada
    const CONCURRENCY = 5; // Menos concorrência = menos pressão na VPS
    for (let i = 0; i < chatsBatch.length; i += CONCURRENCY) {
      const chunk = chatsBatch.slice(i, i + CONCURRENCY);

      const results = await Promise.allSettled(
        chunk.map(chat => syncOneChatFull(supabase, tenantId, config, chat, messagesPerChat))
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
      const currentProgress = startFrom + i + chunk.length;
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
 * Sincroniza UM chat completo — paginando TODAS as mensagens.
 * Diferente da versão anterior, não para na page 1.
 */
async function syncOneChatFull(
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
    .maybeSingle();

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
        contact_phone: phoneDisplay,
        contact_name: pushName,
      })
      .select('id')
      .single();

    if (convErr || !newConv) {
      throw new Error(`Erro ao criar conversa: ${convErr?.message}`);
    }

    conversationId = newConv.id;
    conversationCreated = true;
  }

  // 3. Buscar mensagens com PAGINAÇÃO COMPLETA
  let totalInserted = 0;
  let page = 1;
  const PAGE_SIZE = 100;
  let hasMorePages = true;

  while (hasMorePages && totalInserted < maxMessages) {
    try {
      const batch = await fetchMessages(config, jid, page, PAGE_SIZE);

      if (batch.records.length === 0) {
        hasMorePages = false;
        break;
      }

      // Dedup por external_id
      const externalIds = batch.records.map(m => m.key.id).filter(Boolean);
      const { data: existingMsgs } = await supabase
        .from('messages')
        .select('external_id')
        .eq('tenant_id', tenantId)
        .eq('conversation_id', conversationId)
        .in('external_id', externalIds);

      const existingSet = new Set((existingMsgs || []).map(m => m.external_id));
      const newMessages = batch.records.filter(m => m.key.id && !existingSet.has(m.key.id));

      if (newMessages.length > 0) {
        // Preparar rows
        const rows = newMessages.map(m => mapEvolutionMessage(m, tenantId, conversationId, client.id, phone, phoneDisplay));

        // Inserir em batch (máx 100 por insert do Supabase)
        const { error: insertErr } = await supabase.from('messages').insert(rows);
        if (!insertErr) {
          totalInserted += rows.length;
        } else {
          console.warn(`[BulkSync] Erro insert page ${page} de ${jid}:`, insertErr.message);
        }
      }

      // Avançar página
      hasMorePages = page < batch.pages;
      page++;
    } catch (err) {
      console.warn(`[BulkSync] Erro page ${page} de ${jid}:`, err);
      break; // Parar paginação deste chat se der erro
    }
  }

  // 4. Atualizar metadados da conversa
  if (totalInserted > 0) {
    // Buscar última mensagem para atualizar a conversa
    const { data: lastMsg } = await supabase
      .from('messages')
      .select('content, type, created_at, direction')
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (lastMsg) {
      // Contar mensagens não lidas
      const { count: unreadCount } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('conversation_id', conversationId)
        .eq('direction', 'inbound')
        .neq('status', 'read');

      await supabase
        .from('conversations')
        .update({
          last_message_text: lastMsg.content || `📎 ${lastMsg.type}`,
          last_message_at: lastMsg.created_at,
          last_message_type: lastMsg.type,
          unread_count: unreadCount || 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
        .eq('tenant_id', tenantId);
    }
  }

  return { clientCreated, conversationCreated, messagesInserted: totalInserted };
}

/**
 * Mapeia uma mensagem da Evolution API para o formato do Supabase.
 */
function mapEvolutionMessage(
  m: EvolutionMessage,
  tenantId: string,
  conversationId: string,
  clientId: string,
  phone: string,
  phoneDisplay: string
) {
  const mc = m.message || {};
  const text =
    (mc.conversation as string) ||
    (mc.extendedTextMessage as Record<string, unknown>)?.text ||
    (mc.imageMessage as Record<string, unknown>)?.caption ||
    (mc.videoMessage as Record<string, unknown>)?.caption ||
    '';

  let type = 'text';
  if (mc.imageMessage) type = 'image';
  else if (mc.videoMessage) type = 'video';
  else if (mc.audioMessage) type = 'audio';
  else if (mc.documentMessage) type = 'document';
  else if (mc.stickerMessage) type = 'sticker';

  // Extrair media_url corretamente
  let mediaUrl: string | null = null;
  let mediaMime: string | null = null;
  const mediaObj = (mc.imageMessage || mc.videoMessage || mc.audioMessage || mc.documentMessage) as Record<string, unknown> | undefined;
  if (mediaObj) {
    // Evolution pode retornar url ou directPath
    mediaUrl = (mediaObj.url as string) || (mediaObj.directPath as string) || null;
    mediaMime = (mediaObj.mimetype as string) || null;
  }

  return {
    tenant_id: tenantId,
    conversation_id: conversationId,
    client_id: clientId,
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
}
