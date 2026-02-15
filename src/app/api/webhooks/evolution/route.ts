import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { PhoneNormalizer } from '@/lib/phone-normalizer';
import { eventBus } from '@/lib/event-bus';
import type { EvolutionWebhookPayload } from '@/types';

/**
 * POST /api/webhooks/evolution
 *
 * Recebe webhooks da Evolution API (mensagens, status, conexão).
 * Processa e salva no Supabase, emite eventos SSE.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Validar origem — API key ou IP whitelist
    const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
    const apiKeyHeader = request.headers.get('x-webhook-secret') || request.headers.get('apikey') || '';
    
    // Se EVOLUTION_WEBHOOK_SECRET configurado, exigir match
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

    // 2. Identificar tenant pela instância
    const supabase = createServerSupabaseClient();
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, evolution_instance')
      .eq('evolution_instance', instance)
      .single();

    if (tenantError || !tenant) {
      console.warn(`[Webhook] Instância não encontrada: ${instance}`);
      return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 });
    }

    const tenantId = tenant.id;

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
    if (config.evolution) {
      config.evolution.status = connectionStatus;
    }

    await supabase
      .from('tenants')
      .update({ config })
      .eq('id', tenantId);
  }

  // Emitir evento SSE
  eventBus.emitToTenant('connection_update', tenantId, {
    status: connectionStatus,
    instance_name: payload.instance,
  });
}
