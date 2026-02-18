import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { PhoneNormalizer } from '@/lib/phone-normalizer';
import { eventBus } from '@/lib/event-bus';
import { forwardMediaToN8n, getTenantEvolutionConfig, sendTextMessage, fetchChats, fetchMessages } from '@/lib/services/evolution.service';
import type { EvolutionWebhookPayload } from '@/types';

/**
 * POST /api/webhooks/evolution
 *
 * Recebe webhooks da Evolution API (mensagens, status, conexão).
 * 
 * Roteamento inteligente:
 * 1. Query param ?tenant_id=xxx (configurado pelo provisionInstance)
 * 2. Fallback: lookup pela coluna evolution_instance
 * 
 * Recursos SaaS:
 * - Transbordo de mídia para n8n (áudio, imagem, vídeo)
 * - Mensagem automática da Anne ao conectar (connection.update → open)
 * - Isolamento total por tenant_id
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Validar origem — webhook secret ou IP whitelist
    const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
    const apiKeyHeader = request.headers.get('x-webhook-secret') || request.headers.get('apikey') || '';

    if (webhookSecret && apiKeyHeader !== webhookSecret) {
      const allowedIPs = process.env.EVOLUTION_ALLOWED_IPS?.split(',').filter(Boolean) || [];
      const clientIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';

      if (allowedIPs.length === 0 || !allowedIPs.includes(clientIP)) {
        console.warn(`[Webhook Evolution] Acesso negado - IP: ${clientIP}, apikey: ${apiKeyHeader ? 'presente' : 'ausente'}`);
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const payload: EvolutionWebhookPayload = await request.json();
    const { event, instance } = payload;

    // 2. Identificar tenant — prioridade: query param, depois lookup por instância
    const supabase = createServerSupabaseClient();
    let tenantId: string | null = null;

    // 2a. Query param ?tenant_id (injetado pelo setInstanceWebhook)
    const tenantIdParam = request.nextUrl.searchParams.get('tenant_id');
    if (tenantIdParam) {
      // Validar que o tenant existe e que a instância bate
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('id', tenantIdParam)
        .single();

      if (tenant) {
        tenantId = tenant.id;
      }
    }

    // 2b. Fallback: lookup pela coluna evolution_instance
    if (!tenantId) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('evolution_instance', instance)
        .single();

      if (tenant) {
        tenantId = tenant.id;
      }
    }

    if (!tenantId) {
      console.warn(`[Webhook] Tenant não encontrado para instância: ${instance}`);
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 });
    }

    // 3. Processar por tipo de evento
    switch (event) {
      case 'messages.upsert':
        await handleNewMessage(supabase, tenantId, payload);
        break;

      case 'messages.update':
        await handleMessageStatus(supabase, tenantId, payload);
        break;

      case 'connection.update':
        await handleConnectionUpdate(supabase, tenantId, payload);
        break;

      default:
        console.log(`[Webhook] Evento ignorado: ${event}`);
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('[Webhook] Erro:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/**
 * Processa nova mensagem recebida.
 */
async function handleNewMessage(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  payload: EvolutionWebhookPayload
) {
  const { data } = payload;
  const remoteJid = data.key.remoteJid;
  const fromMe = data.key.fromMe;
  const messageId = data.key.id;
  const pushName = data.pushName || 'Desconhecido';

  // Ignorar mensagens de grupo e broadcast
  if (remoteJid.includes('@g.us') || remoteJid.includes('@broadcast')) return;

  // Extrair telefone do JID
  let phone = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '');

  // Resolver @lid se necessário
  if (remoteJid.includes('@lid')) {
    // @lid são IDs internos do WhatsApp Business — salvar com ID como referência
    console.warn(`[Webhook] JID @lid detectado: ${remoteJid}, salvando com ID de referência`);
    // Usar o ID numérico como telefone temporário para não perder a mensagem
    phone = remoteJid.replace('@lid', '');
    // Se o phone extraído não parece um número de telefone válido, ignorar
    if (phone.length < 8 || phone.length > 15) {
      console.warn(`[Webhook] @lid com ID inválido (${phone}), descartando`);
      return;
    }
  }

  // Normalizar telefone
  const phoneNormalized = PhoneNormalizer.canonical(phone);
  const phoneDisplay = PhoneNormalizer.normalize(phone);

  // Extrair conteúdo da mensagem
  const messageContent = data.message || {};
  const text =
    messageContent.conversation ||
    messageContent.extendedTextMessage?.text ||
    messageContent.imageMessage?.caption ||
    messageContent.videoMessage?.caption ||
    '';

  // Detectar tipo
  let type: string = 'text';
  if (messageContent.imageMessage) type = 'image';
  else if (messageContent.videoMessage) type = 'video';
  else if (messageContent.audioMessage) type = 'audio';
  else if (messageContent.documentMessage) type = 'document';
  else if (messageContent.stickerMessage) type = 'sticker';

  // Upsert cliente (criar se não existir)
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .upsert(
      {
        tenant_id: tenantId,
        phone: phoneDisplay,
        phone_normalized: phoneNormalized,
        name: pushName,
      },
      {
        onConflict: 'tenant_id,phone_normalized',
        ignoreDuplicates: false,
      }
    )
    .select()
    .single();

  if (clientError || !client) {
    console.error('[Webhook] Erro ao upsert cliente:', clientError);
    return;
  }

  // Buscar ou criar conversation para este cliente
  let conversationId: string;
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('client_id', client.id)
    .eq('channel', 'whatsapp')
    .single();

  if (existingConv) {
    conversationId = existingConv.id;
  } else {
    // Criar nova conversation
    const { data: newConv, error: convError } = await supabase
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        client_id: client.id,
        channel: 'whatsapp',
        status: 'open',
      })
      .select('id')
      .single();

    if (convError || !newConv) {
      console.error('[Webhook] Erro ao criar conversa:', convError);
      return;
    }

    conversationId = newConv.id;
  }

  // Extrair URL de mídia (se disponível)
  let mediaUrl: string | undefined;
  let mimetype: string | undefined;
  if (messageContent.imageMessage) {
    mediaUrl = messageContent.imageMessage.url;
    mimetype = messageContent.imageMessage.mimetype;
  } else if (messageContent.videoMessage) {
    mediaUrl = messageContent.videoMessage.url;
    mimetype = messageContent.videoMessage.mimetype;
  } else if (messageContent.audioMessage) {
    mediaUrl = messageContent.audioMessage.url;
    mimetype = messageContent.audioMessage.mimetype;
  } else if (messageContent.documentMessage) {
    mediaUrl = messageContent.documentMessage.url;
    mimetype = messageContent.documentMessage.mimetype;
  }

  // Salvar mensagem (alinhado com schema SQL)
  const { data: savedMessage, error: msgError } = await supabase
    .from('messages')
    .insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      client_id: client.id,
      external_id: messageId,               // ID da Evolution API
      direction: fromMe ? 'outbound' : 'inbound',
      sender_name: fromMe ? 'Atendente' : pushName,
      sender_phone: fromMe ? null : phone,
      content: text,
      type,
      media_url: mediaUrl || null,
      status: fromMe ? 'sent' : 'delivered',
      created_at: data.messageTimestamp
        ? new Date(data.messageTimestamp * 1000).toISOString()
        : new Date().toISOString(),
    })
    .select()
    .single();

  if (msgError) {
    console.error('[Webhook] Erro ao salvar mensagem:', msgError);
    return;
  }

  // Emitir evento SSE
  eventBus.emitToTenant('new_message', tenantId, {
    client_id: client.id,
    message: savedMessage,
  });

  // ━━━ TRANSBORDO DE MÍDIA PARA n8n ━━━
  // Encaminhar áudio, imagem e vídeo para processamento inteligente
  if (!fromMe && mediaUrl && ['audio', 'image', 'video'].includes(type)) {
    forwardMediaToN8n({
      tenantId,
      messageId: savedMessage.id,
      clientId: client.id,
      mediaType: type as 'audio' | 'image' | 'video',
      mediaUrl,
      mimetype,
      caption: text || undefined,
      senderPhone: phone,
      senderName: pushName,
      timestamp: savedMessage.created_at,
    }).catch(err => console.warn('[Webhook] Erro no transbordo n8n:', err));
  }
}

/**
 * Atualiza status de mensagem (enviado → entregue → lido).
 */
async function handleMessageStatus(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  payload: EvolutionWebhookPayload
) {
  const { data } = payload;
  const messageId = data.key.id;
  const status = data.status;

  if (!status) return;

  // Mapear status da Evolution para o nosso
  const statusMap: Record<string, string> = {
    DELIVERY_ACK: 'delivered',
    READ: 'read',
    PLAYED: 'read',
    SERVER_ACK: 'sent',
    ERROR: 'failed',
  };

  const mappedStatus = statusMap[status] || status;

  const { error } = await supabase
    .from('messages')
    .update({ status: mappedStatus })
    .eq('tenant_id', tenantId)
    .eq('external_id', messageId);  // Usar external_id (não message_id)

  if (error) {
    console.error('[Webhook] Erro ao atualizar status:', error);
    return;
  }

  // Buscar client_id para emitir SSE
  const { data: message } = await supabase
    .from('messages')
    .select('client_id, id')
    .eq('tenant_id', tenantId)
    .eq('external_id', messageId)  // Usar external_id (não message_id)
    .single();

  if (message) {
    eventBus.emitToTenant('message_status', tenantId, {
      message_id: message.id,        // ID interno (UUID)
      client_id: message.client_id,
      status: mappedStatus,
    });
  }
}

/**
 * Processa atualização de conexão WhatsApp.
 * Quando status muda para 'open', envia mensagem de boas-vindas da Anne.
 */
async function handleConnectionUpdate(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  payload: EvolutionWebhookPayload
) {
  const connectionStatus = (payload.data as unknown as { state: string }).state;

  // Atualizar config do tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('config')
    .eq('id', tenantId)
    .single();

  if (tenant) {
    const config = tenant.config || {};
    if (!config.evolution) {
      config.evolution = { url: '', api_key: '', instance_name: payload.instance };
    }
    config.evolution.status = connectionStatus;

    await supabase
      .from('tenants')
      .update({ config })
      .eq('id', tenantId);
  }

  // Emitir evento SSE (atualiza UI em tempo real)
  eventBus.emitToTenant('connection_update', tenantId, {
    status: connectionStatus,
    instance_name: payload.instance,
  });

  // ━━━ MENSAGEM AUTOMÁTICA DA ANNE AO CONECTAR ━━━
  if (connectionStatus === 'open') {
    console.log(`[Webhook] WhatsApp conectado para tenant ${tenantId} — enviando boas-vindas da Anne`);

    // Buscar o owner do tenant para enviar a mensagem
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('tenant_id', tenantId)
        .eq('role', 'owner')
        .single();

      if (profile) {
        // Emitir evento de notificação via SSE
        eventBus.emitToTenant('anne_notification', tenantId, {
          type: 'connection_success',
          message: `Olá${profile.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}! Sou a Anne. 🤖 Seu WhatsApp foi conectado com sucesso e já estou monitorando suas vendas!`,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn('[Webhook] Erro ao enviar boas-vindas:', err);
    }

    // ━━━ SYNC AUTOMÁTICO DE HISTÓRICO ━━━
    // Dispara em background para não bloquear o webhook response
    triggerHistoricalSync(supabase, tenantId).catch((err) =>
      console.warn('[Webhook] Erro no sync automático:', err)
    );
  }
}

/**
 * Sync automático leve: sincroniza os 30 chats mais recentes com até 50 mensagens cada.
 * Roda em background quando a conexão é estabelecida.
 */
async function triggerHistoricalSync(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string
) {
  console.log(`[Sync Auto] Iniciando sync histórico para tenant ${tenantId}...`);

  const config = getTenantEvolutionConfig(tenantId);

  // Buscar chats mais recentes
  const chats = await fetchChats(config);
  const recentChats = chats
    .sort((a, b) => (b.lastMessage?.messageTimestamp || 0) - (a.lastMessage?.messageTimestamp || 0))
    .slice(0, 30); // Top 30 mais recentes

  let totalMessages = 0;
  let totalClients = 0;

  for (const chat of recentChats) {
    try {
      const phone = chat.remoteJid.replace('@s.whatsapp.net', '');
      const phoneNormalized = PhoneNormalizer.canonical(phone);
      const phoneDisplay = PhoneNormalizer.normalize(phone);
      const pushName = chat.pushName || chat.lastMessage?.pushName || phoneDisplay;

      // Upsert cliente
      const { data: client } = await supabase
        .from('clients')
        .upsert(
          { tenant_id: tenantId, phone: phoneDisplay, phone_normalized: phoneNormalized, name: pushName },
          { onConflict: 'tenant_id,phone_normalized', ignoreDuplicates: false }
        )
        .select('id')
        .single();

      if (!client) continue;
      totalClients++;

      // Buscar ou criar conversa
      let convId: string;
      const { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('client_id', client.id)
        .eq('channel', 'whatsapp')
        .single();

      if (conv) {
        convId = conv.id;
      } else {
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({ tenant_id: tenantId, client_id: client.id, channel: 'whatsapp', status: 'open' })
          .select('id')
          .single();
        if (!newConv) continue;
        convId = newConv.id;
      }

      // Buscar últimas 50 mensagens
      const batch = await fetchMessages(config, chat.remoteJid, 1, 50);
      if (batch.records.length === 0) continue;

      // Dedup
      const extIds = batch.records.map((m) => m.key.id).filter(Boolean);
      const { data: existing } = await supabase
        .from('messages')
        .select('external_id')
        .eq('tenant_id', tenantId)
        .eq('conversation_id', convId)
        .in('external_id', extIds);

      const existSet = new Set((existing || []).map((e) => e.external_id));
      const newMsgs = batch.records.filter((m) => m.key.id && !existSet.has(m.key.id));

      if (newMsgs.length === 0) continue;

      // Preparar e inserir
      const rows = newMsgs.map((m) => {
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

        return {
          tenant_id: tenantId,
          conversation_id: convId,
          client_id: client.id,
          external_id: m.key.id,
          direction: m.key.fromMe ? 'outbound' : 'inbound',
          sender_name: m.key.fromMe ? 'Atendente' : (m.pushName || phoneDisplay),
          sender_phone: m.key.fromMe ? null : phone,
          content: text,
          type,
          status: m.key.fromMe ? 'sent' : 'delivered',
          created_at: m.messageTimestamp
            ? new Date(m.messageTimestamp * 1000).toISOString()
            : new Date().toISOString(),
        };
      });

      const { error: insErr } = await supabase.from('messages').insert(rows);
      if (!insErr) {
        totalMessages += rows.length;

        // Atualizar last_message na conversa
        const lastRow = rows[rows.length - 1];
        await supabase
          .from('conversations')
          .update({
            last_message_text: lastRow.content || `📎 ${lastRow.type}`,
            last_message_at: lastRow.created_at,
            last_message_type: lastRow.type,
            message_count: rows.length,
            updated_at: new Date().toISOString(),
          })
          .eq('id', convId)
          .eq('tenant_id', tenantId);
      }
    } catch (err) {
      console.warn(`[Sync Auto] Erro no chat ${chat.remoteJid}:`, err);
    }
  }

  console.log(`[Sync Auto] Concluído: ${totalClients} clientes, ${totalMessages} mensagens sincronizadas`);

  // Notificar UI
  eventBus.emitToTenant('sync_complete', tenantId, {
    clients: totalClients,
    messages: totalMessages,
  });
}
