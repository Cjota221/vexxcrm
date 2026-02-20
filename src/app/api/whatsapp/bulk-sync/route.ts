import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { PhoneNormalizer } from '@/lib/phone-normalizer';
import {
  getTenantEvolutionConfig,
  fetchChats,
  fetchMessages,
  fetchProfilePicUrl,
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
    console.log(`[BulkSync] Iniciando sync de massa para tenant ${tenantId}, instância: ${config.instanceName}`);
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

    if (!allChats) {
      console.error('[BulkSync] fetchChats retornou null/undefined');
      return NextResponse.json(
        { error: 'Evolution API retornou resposta vazia. Verifique se a instância WhatsApp está conectada.' },
        { status: 502 }
      );
    }

    if (!Array.isArray(allChats)) {
      console.error('[BulkSync] Resposta inválida da Evolution API:', typeof allChats, JSON.stringify(allChats).substring(0, 200));
      return NextResponse.json(
        { error: `Resposta inesperada da Evolution API (tipo: ${typeof allChats}). Verifique se o WhatsApp está conectado.` },
        { status: 502 }
      );
    }

    if (allChats.length === 0) {
      console.log('[BulkSync] Nenhum chat encontrado na instância');
      return NextResponse.json({
        success: true,
        data: {
          progress: { current: 0, total: 0, percentage: 100 },
          clients_created: 0,
          conversations_created: 0,
          messages_synced: 0,
          errors: 0,
          has_more: false,
          next_start_from: 0,
          message: 'Nenhum chat encontrado. Certifique-se de que há conversas no WhatsApp conectado.',
        },
      });
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
    const errorDetails: string[] = [];
    
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
        const errMsg = err instanceof Error ? err.message : 'Erro desconhecido';
        console.error(`[BulkSync] Erro em chat ${chat.remoteJid}:`, errMsg);
        // Guardar primeiros 10 erros para debug
        if (errorDetails.length < 10) {
          errorDetails.push(`${chat.remoteJid}: ${errMsg}`);
        }
        // NÃO interromper — continuar com próximo chat
        processedCount++;
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
    if (errorDetails.length > 0) {
      console.log(`[BulkSync] Primeiros erros:`, errorDetails);
    }

    return NextResponse.json({
      success: true,
      data: {
        total_chats: totalChats,
        batch_processed: actualProcessed,
        clients_created: clientsCreated,
        conversations_created: conversationsCreated,
        messages_synced: messagesInserted,
        errors,
        error_samples: errorDetails, // Amostras de erros para debug
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
 * Faz download da foto de perfil e salva permanentemente no Supabase Storage.
 * Retorna URL permanente (Storage) ou null se falhar.
 * NUNCA salva URLs mmg.whatsapp.net que expiram em 24-48h.
 */
async function cacheProfilePicBulk(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  clientId: string,
  picUrl: string | null | undefined
): Promise<string | null> {
  if (!picUrl) return null;
  // Só fazer cache de URLs temporárias do WhatsApp (mmg.whatsapp.net, pps.whatsapp.net, etc.)
  // URLs do Supabase Storage já são permanentes — não reprocessar
  if (picUrl.includes('supabase.co/storage')) return picUrl;

  try {
    const res = await fetch(picUrl, { redirect: 'follow' });
    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const path = `${tenantId}/clients/${clientId}.${ext}`;

    await supabase.storage.from('avatars').upload(path, buffer, {
      contentType,
      upsert: true,
    });

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    return pub.publicUrl || null;
  } catch {
    return null; // silencioso — a foto é opcional
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

  // Gerar TODAS as variações do telefone para matching flexível
  const phoneWithNine = PhoneNormalizer.normalize(phone);  // COM 9º dígito: 5562999998888
  const phoneWithoutNine = PhoneNormalizer.canonical(phone); // SEM 9º dígito: 556299998888
  const phoneDisplay = phoneWithNine;
  const pushName = chat.pushName || chat.lastMessage?.pushName || phoneDisplay;

  // 1. Buscar cliente existente por QUALQUER variação do telefone
  let client: { id: string; created_at: string } | null = null;
  let clientCreated = false;
  
  // Primeiro, tentar encontrar por phone_normalized (ambas variações)
  const { data: existingClient } = await supabase
    .from('clients')
    .select('id, created_at')
    .eq('tenant_id', tenantId)
    .or(`phone_normalized.eq.${phoneWithNine},phone_normalized.eq.${phoneWithoutNine},phone.eq.${phoneWithNine},phone.eq.${phoneWithoutNine}`)
    .limit(1)
    .maybeSingle();

  if (existingClient) {
    client = existingClient;
  } else {
    // Não existe: criar novo com formato normalizado (COM 9)
    // Fazer cache permanente da foto ANTES de salvar (URL do WhatsApp expira em 24-48h)
    // Usamos um ID temporário para o path do Storage — depois atualizamos
    const { data: newClient, error: clientErr } = await supabase
      .from('clients')
      .insert({
        tenant_id: tenantId,
        phone: phoneDisplay,
        phone_normalized: phoneWithNine, // Usar COM 9 para novos
        name: pushName,
        avatar_url: null, // Preenchido abaixo após cache
        source: 'whatsapp',
      })
      .select('id, created_at')
      .single();

    if (clientErr) {
      // Race condition — buscar novamente
      const { data: retryClient } = await supabase
        .from('clients')
        .select('id, created_at')
        .eq('tenant_id', tenantId)
        .or(`phone_normalized.eq.${phoneWithNine},phone_normalized.eq.${phoneWithoutNine}`)
        .limit(1)
        .single();
      
      if (!retryClient) {
        throw new Error(`Erro ao criar cliente ${phone}: ${clientErr.message}`);
      }
      client = retryClient;
    } else {
      client = newClient;
      clientCreated = true;

      // Fazer cache permanente da foto de perfil (fire-and-forget, não bloqueia sync)
      if (chat.profilePicUrl) {
        void cacheProfilePicBulk(supabase, tenantId, newClient.id, chat.profilePicUrl)
          .then(permanentUrl => {
            if (permanentUrl) {
              void supabase
                .from('clients')
                .update({ avatar_url: permanentUrl })
                .eq('id', newClient.id)
                .eq('tenant_id', tenantId);
            }
          });
      }
    }
  }

  // 2. Buscar ou criar conversa (com retry em caso de race condition)
  let conversationCreated = false;
  let conversationId: string;
  
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('client_id', client.id)
    .eq('channel', 'whatsapp')
    .maybeSingle();

  if (existingConv) {
    conversationId = existingConv.id;
  } else {
    // NOTA: A tabela conversations NÃO tem contact_name nem contact_phone
    // Esses dados ficam no client vinculado
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

    if (convErr) {
      // Race condition — outra request pode ter criado. Buscar novamente.
      const { data: retryConv } = await supabase
        .from('conversations')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('client_id', client.id)
        .eq('channel', 'whatsapp')
        .single();
      
      if (!retryConv) {
        throw new Error(`Erro ao criar conversa: ${convErr.message}`);
      }
      conversationId = retryConv.id;
    } else {
      conversationId = newConv.id;
      conversationCreated = true;
    }
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
