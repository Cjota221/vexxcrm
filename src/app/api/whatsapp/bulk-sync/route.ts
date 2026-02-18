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
 *   - batchSize: chats por batch (default: 10, max: 25)
 *   - messagesPerChat: mensagens por chat (default: 50, max: 200)
 *   - startFrom: índice para continuar sync interrompido
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const MAX_EXECUTION_TIME = 8000; // 8s max (margem para 10s do Netlify)
  
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    // Parâmetros — defaults pequenos para caber no timeout do Netlify (~10s)
    let batchSize = 10;
    let messagesPerChat = 50;
    let startFrom = 0;

    try {
      const body = await request.json();
      batchSize = Math.min(body.batchSize || 10, 25); // Max 25 chats por batch
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
      const errMsg = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error('[BulkSync] Erro ao buscar chats:', errMsg);
      return NextResponse.json(
        { error: `Erro ao buscar chats: ${errMsg}` },
        { status: 502 }
      );
    }

    if (!Array.isArray(allChats)) {
      console.error('[BulkSync] Resposta inválida da Evolution API:', typeof allChats);
      return NextResponse.json(
        { error: 'Resposta inválida da Evolution API. Verifique se o WhatsApp está conectado.' },
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
    let processedCount = 0;
    let timedOut = false;

    // 2. Processar batch com verificação de tempo
    for (const chat of chatsBatch) {
      // Verificar tempo de execução
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        console.log(`[BulkSync] Timeout preventivo após ${processedCount} chats`);
        timedOut = true;
        break;
      }
      
      try {
        const result = await syncOneChatFull(supabase, tenantId, config, chat, messagesPerChat);
        clientsCreated += result.clientCreated ? 1 : 0;
        conversationsCreated += result.conversationCreated ? 1 : 0;
        messagesInserted += result.messagesInserted;
        processedCount++;
      } catch (err) {
        errors++;
        console.error('[BulkSync] Erro em chat:', err);
      }

      // Emitir progresso via SSE
      eventBus.emitToTenant('sync_progress', tenantId, {
        current: startFrom + processedCount,
        total: totalChats,
        percent: Math.round(((startFrom + processedCount) / totalChats) * 100),
        clients: clientsCreated,
        messages: messagesInserted,
      });
    }

    // 3. Retornar resultado com próximo cursor
    const actualProcessed = timedOut ? processedCount : chatsBatch.length;
    const hasMore = (startFrom + actualProcessed) < totalChats;
    const nextStartFrom = hasMore ? startFrom + actualProcessed : null;

    const duration = Date.now() - startTime;
    console.log(`[BulkSync] Batch concluído em ${duration}ms: ${clientsCreated} clientes, ${conversationsCreated} conversas, ${messagesInserted} mensagens, ${errors} erros`);

    return NextResponse.json({
      success: true,
      data: {
        total_chats: totalChats,
        batch_processed: actualProcessed,
        clients_created: clientsCreated,
        conversations_created: conversationsCreated,
        messages_synced: messagesInserted,
        errors,
        has_more: hasMore,
        next_start_from: nextStartFrom,
        timed_out: timedOut,
        duration_ms: duration,
        progress: {
          current: startFrom + actualProcessed,
          total: totalChats,
          percent: Math.round(((startFrom + actualProcessed) / totalChats) * 100),
        },
      },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Erro interno';
    console.error('[BulkSync] Erro:', errMsg);

    if (errMsg.includes('Não autorizado') || errMsg.includes('Token')) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    return NextResponse.json(
      { error: errMsg },
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
