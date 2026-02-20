import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { PhoneNormalizer } from '@/lib/phone-normalizer';
import { eventBus } from '@/lib/event-bus';
import { forwardMediaToN8n, getTenantEvolutionConfig, sendTextMessage, fetchChats, fetchMessages, downloadMediaToStorage } from '@/lib/services/evolution.service';
import { processPipelineTriggers } from '@/lib/services/pipeline-triggers';
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
    mediaUrl = messageContent.imageMessage.url || messageContent.imageMessage.directPath;
    mimetype = messageContent.imageMessage.mimetype;
  } else if (messageContent.videoMessage) {
    mediaUrl = messageContent.videoMessage.url || messageContent.videoMessage.directPath;
    mimetype = messageContent.videoMessage.mimetype;
  } else if (messageContent.audioMessage) {
    mediaUrl = messageContent.audioMessage.url || messageContent.audioMessage.directPath;
    mimetype = messageContent.audioMessage.mimetype;
  } else if (messageContent.documentMessage) {
    mediaUrl = messageContent.documentMessage.url || messageContent.documentMessage.directPath;
    mimetype = messageContent.documentMessage.mimetype;
  }

  // ━━━ DOWNLOAD DE MÍDIA PARA STORAGE PERMANENTE ━━━
  // URLs do WhatsApp (mmg.whatsapp.net) expiram e retornam 403.
  // Baixamos via Evolution API e salvamos no Supabase Storage.
  // INCLUI mensagens fromMe=true (áudios/mídias enviados pelo nosso sistema)
  if (mediaUrl && ['image', 'video', 'audio', 'document', 'sticker'].includes(type)) {
    try {
      const config = getTenantEvolutionConfig(tenantId);
      const permanentUrl = await downloadMediaToStorage(
        config,
        { id: messageId, remoteJid, fromMe },
        messageContent as Record<string, unknown>,
        tenantId,
        mimetype
      );

      if (permanentUrl) {
        mediaUrl = permanentUrl;
      } else {
        // Fallback: manter URL original (pode expirar)
        if (mediaUrl && !mediaUrl.startsWith('http')) {
          const config2 = getTenantEvolutionConfig(tenantId);
          mediaUrl = `${config2.apiUrl}${mediaUrl}`;
        }
      }
    } catch (err) {
      console.warn('[Webhook] Falha no download de mídia, mantendo URL original:', err);
      // Fallback: manter URL original
      if (mediaUrl && !mediaUrl.startsWith('http')) {
        const config3 = getTenantEvolutionConfig(tenantId);
        mediaUrl = `${config3.apiUrl}${mediaUrl}`;
      }
    }
  }

  // ━━━ DEDUPLICAÇÃO ━━━
  // Se a mensagem já foi gravada (ex: /api/whatsapp/send gravou antes do webhook chegar),
  // apenas atualizar a media_url se necessário e sair.
  const { data: existingMsg } = await supabase
    .from('messages')
    .select('id, media_url')
    .eq('tenant_id', tenantId)
    .eq('external_id', messageId)
    .single();

  if (existingMsg) {
    // Mensagem já existe — atualizar media_url se temos URL melhor (storage permanente)
    // Também atualiza se a mensagem existente não tem media_url mas o webhook trouxe uma
    const deveAtualizar =
      (mediaUrl && mediaUrl.includes('supabase.co/storage') && existingMsg.media_url !== mediaUrl) ||
      (mediaUrl && !existingMsg.media_url);

    if (deveAtualizar) {
      await supabase
        .from('messages')
        .update({ media_url: mediaUrl, media_mime_type: mimetype || null })
        .eq('id', existingMsg.id);
    }
    // Emitir evento SSE para atualizar a UI (status pode ter mudado)
    eventBus.emitToTenant('new_message', tenantId, {
      client_id: client.id,
      message: { ...existingMsg, media_url: mediaUrl || existingMsg.media_url },
    });
    return;
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
      media_mime_type: mimetype || null,
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

  // ━━━ AUTOMAÇÃO DE PIPELINE (Anne Motor de Gatilhos) ━━━
  // Fire-and-forget: não bloqueia resposta do webhook
  processPipelineTriggers(
    supabase,
    tenantId,
    { id: client.id, name: client.name, name_manual: client.name_manual },
    remoteJid,
    text,
    fromMe
  ).catch(err => console.warn('[Webhook] Erro no pipeline trigger:', err));

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

    // ━━━ VERIFICAR E RECONFIGURAR WEBHOOK ━━━
    ensureWebhookConfig(tenantId).catch((err) =>
      console.warn('[Webhook] Erro ao verificar webhook config:', err)
    );
  }
}

/**
 * Verifica se o webhook está configurado corretamente e reconfigura se necessário.
 * Garante que MESSAGES_UPSERT está na lista de eventos.
 */
async function ensureWebhookConfig(tenantId: string) {
  const config = getTenantEvolutionConfig(tenantId);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || '';
  
  if (!appUrl) {
    console.warn('[Webhook] NEXT_PUBLIC_APP_URL não configurada, impossível verificar webhook');
    return;
  }

  try {
    // Buscar configuração atual do webhook
    const response = await fetch(`${config.apiUrl}/webhook/find/${config.instanceName}`, {
      method: 'GET',
      headers: { 'apikey': config.apiKey },
    });

    if (!response.ok) {
      console.warn('[Webhook] Não foi possível buscar config do webhook, reconfigurando...');
      await reconfigureWebhook(config, appUrl, tenantId);
      return;
    }

    const webhookText = await response.text();
    let webhookData: any;
    try {
      webhookData = JSON.parse(webhookText);
    } catch {
      console.warn('[Webhook] Resposta não-JSON do webhook/find, reconfigurando...');
      await reconfigureWebhook(config, appUrl, tenantId);
      return;
    }
    const currentUrl = webhookData?.url || webhookData?.webhook?.url || '';
    const currentEvents = webhookData?.events || webhookData?.webhook?.events || [];
    const isEnabled = webhookData?.enabled !== false && webhookData?.webhook?.enabled !== false;

    // Verificar se MESSAGES_UPSERT está nos eventos
    const hasMessagesUpsert = currentEvents.includes('MESSAGES_UPSERT');
    const hasCorrectUrl = currentUrl.includes('/api/webhooks/evolution');

    if (!hasMessagesUpsert || !hasCorrectUrl || !isEnabled) {
      console.log(`[Webhook] Config incorreta: url=${hasCorrectUrl}, MESSAGES_UPSERT=${hasMessagesUpsert}, enabled=${isEnabled}. Reconfigurando...`);
      await reconfigureWebhook(config, appUrl, tenantId);
    } else {
      console.log('[Webhook] Config OK — MESSAGES_UPSERT ativo');
    }
  } catch (err) {
    console.warn('[Webhook] Erro ao verificar webhook, reconfigurando:', err);
    await reconfigureWebhook(config, appUrl, tenantId);
  }
}

/**
 * Reconfigura o webhook da instância com todas as opções necessárias.
 */
async function reconfigureWebhook(
  config: ReturnType<typeof getTenantEvolutionConfig>,
  appUrl: string,
  tenantId: string
) {
  const webhookUrl = `${appUrl}/api/webhooks/evolution?tenant_id=${tenantId}`;

  const response = await fetch(`${config.apiUrl}/webhook/set/${config.instanceName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': config.apiKey,
    },
    body: JSON.stringify({
      webhook: {
        url: webhookUrl,
        enabled: true,
        webhook_by_events: false,
        webhook_base64: true,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'CONNECTION_UPDATE',
          'CONTACTS_UPDATE',
        ],
      },
    }),
  });

  if (response.ok) {
    console.log(`[Webhook] Reconfigurado com sucesso: ${webhookUrl}`);
  } else {
    const err = await response.text().catch(() => 'unknown');
    console.error(`[Webhook] Erro ao reconfigurar: ${err}`);
  }
}

/**
 * Sync automático agressivo: sincroniza os 100 chats mais recentes com paginação completa.
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
    .slice(0, 100); // Top 100 mais recentes

  let totalMessages = 0;
  let totalClients = 0;

  for (const chat of recentChats) {
    try {
      const phone = chat.remoteJid.replace('@s.whatsapp.net', '');
      if (phone.length < 8 || phone.length > 15) continue;
      
      const phoneNormalized = PhoneNormalizer.canonical(phone);
      const phoneDisplay = PhoneNormalizer.normalize(phone);
      const pushName = chat.pushName || chat.lastMessage?.pushName || phoneDisplay;

      // Upsert cliente — NUNCA sobrescrever avatar_url que já existe no banco
      // (URLs do WhatsApp são temporárias; só o sync-avatars/cacheProfilePic salva URLs permanentes)
      const { data: existingForAvatar } = await supabase
        .from('clients')
        .select('id, avatar_url')
        .eq('tenant_id', tenantId)
        .eq('phone_normalized', phoneNormalized)
        .maybeSingle();

      const shouldUpdateAvatar = !existingForAvatar?.avatar_url && !!chat.profilePicUrl;

      const { data: client } = await supabase
        .from('clients')
        .upsert(
          { 
            tenant_id: tenantId, 
            phone: phoneDisplay, 
            phone_normalized: phoneNormalized, 
            name: pushName,
            ...(shouldUpdateAvatar ? { avatar_url: chat.profilePicUrl } : {}),
          },
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
        .maybeSingle();

      if (conv) {
        convId = conv.id;
      } else {
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({ 
            tenant_id: tenantId, 
            client_id: client.id, 
            channel: 'whatsapp', 
            status: 'open',
          })
          .select('id')
          .single();
        if (!newConv) continue;
        convId = newConv.id;
      }

      // Buscar mensagens com PAGINAÇÃO (até 200 por chat)
      let page = 1;
      let chatMsgsInserted = 0;
      const PAGE_SIZE = 100;
      const MAX_PER_CHAT = 200;

      while (chatMsgsInserted < MAX_PER_CHAT) {
        const batch = await fetchMessages(config, chat.remoteJid, page, PAGE_SIZE);
        if (batch.records.length === 0) break;

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

        if (newMsgs.length > 0) {
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

            // Extrair media_url
            let mediaUrl: string | null = null;
            let mediaMime: string | null = null;
            const mediaObj = (mc.imageMessage || mc.videoMessage || mc.audioMessage || mc.documentMessage) as Record<string, unknown> | undefined;
            if (mediaObj) {
              mediaUrl = (mediaObj.url as string) || (mediaObj.directPath as string) || null;
              mediaMime = (mediaObj.mimetype as string) || null;
            }

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
              media_url: mediaUrl,
              media_mime_type: mediaMime,
              status: m.key.fromMe ? 'sent' : 'delivered',
              created_at: m.messageTimestamp
                ? new Date(m.messageTimestamp * 1000).toISOString()
                : new Date().toISOString(),
            };
          });

          const { error: insErr } = await supabase.from('messages').insert(rows);
          if (!insErr) {
            chatMsgsInserted += rows.length;
            totalMessages += rows.length;
          }
        }

        // Avançar página se houver mais
        if (page >= batch.pages) break;
        page++;
      }

      // Atualizar last_message na conversa
      if (chatMsgsInserted > 0) {
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('content, type, created_at')
          .eq('tenant_id', tenantId)
          .eq('conversation_id', convId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (lastMsg) {
          const { count: unreadCount } = await supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('conversation_id', convId)
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
            .eq('id', convId)
            .eq('tenant_id', tenantId);
        }
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
