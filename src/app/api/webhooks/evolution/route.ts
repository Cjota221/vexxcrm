import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { PhoneNormalizer } from '@/lib/phone-normalizer';
import { eventBus } from '@/lib/event-bus';
import { forwardMediaToN8n, getTenantEvolutionConfig, fetchChats, fetchMessages, downloadMediaToStorage, fetchProfilePicUrl } from '@/lib/services/evolution.service';
import { processPipelineTriggers } from '@/lib/services/pipeline-triggers';
import { extractTrackingCode, extractOrderNumber } from '@/lib/services/anne-pipeline';
import { processAutoReply } from '@/lib/services/anne-auto-reply';
import { transcribeAudio } from '@/lib/services/audio-transcription';
import type { EvolutionWebhookPayload } from '@/types';

// Nomes conhecidos da instância que NUNCA devem ser salvos como nome de cliente
const INSTANCE_NAME_BLACKLIST = [
  'cjota rasteirinhas',
  'cjota',
  'você',
  'voce',
  'loja',
  'atendente',
  'desconhecido',
];

/**
 * Verifica se um nome é da instância (não do cliente).
 * Rejeita: nome vazio, só números, nomes na blacklist.
 */
function isInstanceName(name: string): boolean {
  if (!name || !name.trim()) return true;
  const lower = name.trim().toLowerCase();
  if (INSTANCE_NAME_BLACKLIST.some(b => lower.includes(b))) return true;
  if (/^\d{8,15}$/.test(name.replace(/\D/g, ''))) return true;
  return false;
}

/**
 * Faz cache permanente da foto no Supabase Storage.
 * Retorna URL permanente ou null se falhar.
 */
async function cacheProfilePic(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  clientId: string,
  picUrl: string
): Promise<string | null> {
  try {
    const res = await fetch(picUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const path = `${tenantId}/clients/${clientId}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, buffer, { contentType, upsert: true });

    if (uploadErr) return null;

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    return pub.publicUrl || null;
  } catch {
    return null;
  }
}

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
    // ━━━ LOG IMEDIATO — confirma que o webhook chegou ao servidor ━━━
    console.log(`[Webhook] ▶ POST recebido — ${new Date().toISOString()} | URL: ${request.url}`);

    // 1. Segurança: a URL já contém ?tenant_id= que identifica o tenant.
    //    EVOLUTION_WEBHOOK_SECRET foi removido pois a Evolution API não envia
    //    esse header — causava 403 silencioso em todas as mensagens recebidas.
    //    Se quiser reativar no futuro: configurar o mesmo secret na Evolution API
    //    em Configurações → Webhook → Global Webhook API Key.

    const payload: EvolutionWebhookPayload = await request.json();
    const { event, instance } = payload;

    console.log(`[Webhook] 📨 Evento: ${event} | Instância: ${instance} | Tenant param: ${request.nextUrl.searchParams.get('tenant_id') || 'N/A'} | fromMe: ${payload.data?.key?.fromMe ?? 'N/A'} | remoteJid: ${payload.data?.key?.remoteJid?.substring(0, 20) ?? 'N/A'}`);

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

      case 'presence.update':
        handlePresenceUpdate(tenantId, payload);
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
  const pushName = data.pushName || '';

  // Ignorar broadcasts; grupos são processados separadamente
  if (remoteJid.includes('@broadcast')) return;
  if (remoteJid.includes('@g.us')) {
    await handleGroupMessage(supabase, tenantId, payload);
    return;
  }

  // Extrair telefone do JID
  let phone = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '');

  if (remoteJid.includes('@lid')) {
    console.warn(`[Webhook] JID @lid detectado: ${remoteJid}`);
    phone = remoteJid.replace('@lid', '');
    if (phone.length < 8 || phone.length > 15) {
      console.warn(`[Webhook] @lid com ID inválido (${phone}), descartando`);
      return;
    }
  }

  const phoneNormalized = PhoneNormalizer.canonical(phone);
  const phoneDisplay = PhoneNormalizer.normalize(phone);

  const messageContent = data.message || {};
  const text =
    messageContent.conversation ||
    messageContent.extendedTextMessage?.text ||
    messageContent.imageMessage?.caption ||
    messageContent.videoMessage?.caption ||
    '';

  let type: string = 'text';
  if (messageContent.imageMessage) type = 'image';
  else if (messageContent.videoMessage) type = 'video';
  else if (messageContent.audioMessage) type = 'audio';
  else if (messageContent.documentMessage) type = 'document';
  else if (messageContent.stickerMessage) type = 'sticker';

  // DEBUG: Log tipos de mídia recebidas
  if (type !== 'text') {
    console.log(`[Webhook] Tipos de mídia no payload: ${Object.keys(messageContent).filter(k => k.includes('Message')).join(', ') || 'nenhum'}`);
  }

  // ── FIX NOMES ────────────────────────────────────────────────────────────
  // Buscar cliente existente ANTES do upsert para preservar nome e avatar
  const { data: existingClient } = await supabase
    .from('clients')
    .select('id, name, name_manual, avatar_url')
    .eq('tenant_id', tenantId)
    .eq('phone_normalized', phoneNormalized)
    .maybeSingle();

  // Regras de resolução do nome (ordem de prioridade):
  // 1. name_manual (editado pelo atendente) → nunca sobrescrever
  // 2. pushName válido do cliente (não fromMe, não é nome da instância)
  // 3. Nome atual do banco (se já existe e não é telefone) → PROTEGE contra disparo fromMe
  // 4. Telefone formatado (fallback apenas para clientes novos sem nenhum nome)
  let resolvedName: string;
  if (existingClient?.name_manual) {
    resolvedName = existingClient.name_manual;
  } else if (!fromMe && pushName && !isInstanceName(pushName)) {
    resolvedName = pushName.trim();
  } else if (existingClient?.name && !/^\d/.test(existingClient.name)) {
    // Nome já salvo no banco é real (não começa com dígito) → preservar mesmo em fromMe
    resolvedName = existingClient.name;
  } else {
    resolvedName = phoneDisplay;
  }

  // ── FIX FOTOS ─────────────────────────────────────────────────────────────
  // Só atualizar avatar se o cliente não tem foto permanente no Storage
  const hasPermamentAvatar = existingClient?.avatar_url?.includes('supabase.co/storage');

  if (!hasPermamentAvatar && existingClient?.id) {
    cacheAvatarInBackground(supabase, tenantId, existingClient.id, phoneNormalized).catch(() => {});
  }

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .upsert(
      {
        tenant_id: tenantId,
        phone: phoneDisplay,
        phone_normalized: phoneNormalized,
        name: resolvedName,
        // Não incluir avatar_url aqui — só o cacheAvatarInBackground salva
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
  // IMPORTANTE: usar order+limit (não .single()) para suportar múltiplas conversas
  // NOTA: NÃO filtrar por channel — garante que buscamos a mesma conversa que o front-end exibe
  let conversationId: string;
  const { data: existingConvs } = await supabase
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('client_id', client.id)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1);

  const existingConv = existingConvs?.[0] ?? null;

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
      console.log(`[Webhook] Tentando baixar mídia: type=${type}, mediaUrl=${mediaUrl.substring(0, 80)}...`);
      const config = getTenantEvolutionConfig(tenantId);
      const permanentUrl = await downloadMediaToStorage(
        config,
        { id: messageId, remoteJid, fromMe },
        messageContent as Record<string, unknown>,
        tenantId,
        mimetype
      );

      if (permanentUrl) {
        console.log(`[Webhook] Mídia salva permanentemente: ${permanentUrl.substring(0, 80)}...`);
        mediaUrl = permanentUrl;
      } else {
        // Fallback: manter URL original (pode expirar)
        console.warn(`[Webhook] Falha ao baixar mídia para Storage, usando URL original`);
        if (mediaUrl && !mediaUrl.startsWith('http')) {
          const config2 = getTenantEvolutionConfig(tenantId);
          mediaUrl = `${config2.apiUrl}${mediaUrl}`;
        }
      }
    } catch (err) {
      console.warn('[Webhook] Erro ao processar mídia, mantendo URL original:', err);
      // Fallback: manter URL original
      if (mediaUrl && !mediaUrl.startsWith('http')) {
        const config3 = getTenantEvolutionConfig(tenantId);
        mediaUrl = `${config3.apiUrl}${mediaUrl}`;
      }
    }
  } else if (mediaUrl) {
    console.log(`[Webhook] Mídia ignorada: type=${type} não é suportado ou mediaUrl vazio`);
  }

  // ━━━ DEDUPLICAÇÃO ━━━
  // Se a mensagem já foi gravada (ex: /api/whatsapp/send gravou antes do webhook chegar),
  // apenas atualizar a media_url se necessário e sair.
  // IMPORTANTE: select('*') para que o SSE emita a mensagem COMPLETA (com content)
  // — select('id, media_url') causava bolhas vazias no chat ao fazer deduplicação.
  const { data: existingMsg } = await supabase
    .from('messages')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('external_id', messageId)
    .single();

  if (existingMsg) {
    // Mensagem já existe — atualizar media_url se temos URL melhor (storage permanente)
    // Também atualiza se a mensagem existente não tem media_url mas o webhook trouxe uma
    const deveAtualizar =
      (mediaUrl && mediaUrl.includes('supabase.co/storage') && existingMsg.media_url !== mediaUrl) ||
      (mediaUrl && !existingMsg.media_url);

    let msgParaSSE = existingMsg;
    if (deveAtualizar) {
      const { data: updated } = await supabase
        .from('messages')
        .update({ media_url: mediaUrl, media_mime_type: mimetype || null })
        .eq('id', existingMsg.id)
        .select('*')
        .single();
      if (updated) msgParaSSE = updated;
    }
    // Emitir evento SSE com a mensagem COMPLETA para o front-end atualizar corretamente
    eventBus.emitToTenant('new_message', tenantId, {
      client_id: client.id,
      message: msgParaSSE,
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

  // ━━━ ANNE — DETECTOR DE RASTREIO (fromMe) ━━━
  // Quando a FacilZap despacha um pedido, ela envia uma mensagem fromMe no WhatsApp
  // com o código de rastreio e número do pedido.
  // A Anne intercepta APENAS mensagens fromMe com código de rastreio para vincular
  // automaticamente ao pedido correspondente — sem responder ao cliente.
  if (fromMe && text) {
    handleTrackingFromMe(supabase, tenantId, client.id, conversationId, text).catch(
      err => console.warn('[Webhook] Erro no detector de rastreio:', err)
    );
  }

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

  // ━━━ ANNE AUTO-REPLY — Resposta automática via IA ━━━
  // Fire-and-forget: processa mensagens inbound de texto (não grupo, não fromMe)
  if (!fromMe && text && type === 'text') {
    processAutoReply(supabase, {
      tenantId,
      clientId: client.id,
      conversationId,
      remoteJid,
      message: text,
      clientPhone: phoneNormalized,
    }).catch(err => console.warn('[Webhook] Erro no auto-reply:', err));
  }

  // ━━━ ANNE AUDIO TRANSCRIPTION + AUTO-REPLY ━━━
  // Transcreve áudio inbound via Whisper e processa como texto pela Anne
  if (!fromMe && type === 'audio' && mediaUrl) {
    transcribeAndReply(supabase, {
      tenantId,
      clientId: client.id,
      conversationId,
      remoteJid,
      messageId: savedMessage.id,
      audioUrl: mediaUrl,
      clientPhone: phoneNormalized,
    }).catch(err => console.warn('[Webhook] Erro na transcrição de áudio:', err));
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// ÁUDIO — Transcrição + auto-reply para mensagens de voz
// ──────────────────────────────────────────────────────────────────────────────

async function transcribeAndReply(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  input: {
    tenantId: string;
    clientId: string;
    conversationId: string;
    remoteJid: string;
    messageId: string;
    audioUrl: string;
    clientPhone: string;
  },
): Promise<void> {
  const { tenantId, clientId, conversationId, remoteJid, messageId, audioUrl, clientPhone } = input;

  // 1. Carregar config do tenant para obter API key
  const { data: tenant } = await supabase
    .from('tenants')
    .select('openai_api_key, openai_provider, openai_base_url')
    .eq('id', tenantId)
    .single();

  if (!tenant?.openai_api_key) {
    console.log('[audio-transcription] Tenant sem API key configurada, pulando');
    return;
  }

  // 2. Transcrever áudio
  const result = await transcribeAudio(
    audioUrl,
    tenant.openai_api_key,
    tenant.openai_provider || undefined,
    tenant.openai_base_url || undefined,
  );

  if (!result) return;

  const transcribedText = result.text;

  // 3. Atualizar mensagem no DB com o texto transcrito
  await supabase
    .from('messages')
    .update({
      content: `🎤 ${transcribedText}`,
      metadata: { transcription: transcribedText, transcribed_at: new Date().toISOString() },
    })
    .eq('id', messageId);

  // 4. Emitir SSE para atualizar o chat em tempo real
  eventBus.emitToTenant('message_updated', tenantId, {
    message_id: messageId,
    content: `🎤 ${transcribedText}`,
  });

  // 5. Processar auto-reply com o texto transcrito
  await processAutoReply(supabase, {
    tenantId,
    clientId,
    conversationId,
    remoteJid,
    message: transcribedText,
    clientPhone,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// GRUPOS — Processa mensagens de grupo WhatsApp (@g.us)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Processa mensagens recebidas em grupos WhatsApp.
 * Cria/atualiza uma conversation sem client_id (keyed by remote_jid).
 */
async function handleGroupMessage(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  payload: EvolutionWebhookPayload
) {
  const { data } = payload;
  const groupJid = data.key.remoteJid;
  const fromMe = data.key.fromMe;
  const senderName = data.pushName || 'Grupo';

  const messageContent = data.message || {};
  const text =
    messageContent.conversation ||
    messageContent.extendedTextMessage?.text ||
    messageContent.imageMessage?.caption ||
    messageContent.videoMessage?.caption ||
    '';

  let type = 'text';
  if (messageContent.imageMessage) type = 'image';
  else if (messageContent.videoMessage) type = 'video';
  else if (messageContent.audioMessage) type = 'audio';
  else if (messageContent.documentMessage) type = 'document';
  else if (messageContent.stickerMessage) type = 'sticker';

  const content = text || `📎 ${type}`;
  const now = new Date().toISOString();
  const msgTs = data.messageTimestamp
    ? new Date(Number(data.messageTimestamp) * 1000).toISOString()
    : now;

  // Buscar ou criar conversa do grupo
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('id, contact_name')
    .eq('tenant_id', tenantId)
    .eq('remote_jid', groupJid)
    .maybeSingle();

  let convId: string;
  if (existingConv) {
    convId = existingConv.id;
  } else {
    // Usar últimos 9 dígitos do JID como nome fallback do grupo
    const jidNum = groupJid.replace('@g.us', '');
    const groupLabel = `Grupo ${jidNum.slice(-9)}`;
    const { data: newConv, error } = await supabase
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        client_id: null,
        channel: 'whatsapp',
        status: 'open',
        remote_jid: groupJid,
        contact_name: groupLabel,
      })
      .select('id')
      .single();

    if (error || !newConv) {
      console.error('[Webhook Grupo] Erro ao criar conversa de grupo:', error);
      return;
    }
    convId = newConv.id;
  }

  // Inserir mensagem
  const externalId = data.key.id;
  const msgPayload = {
    tenant_id: tenantId,
    conversation_id: convId,
    client_id: null as string | null,
    external_id: externalId || undefined,
    direction: fromMe ? 'outbound' : 'inbound',
    sender_name: fromMe ? 'Você' : senderName,
    content,
    type,
    status: fromMe ? 'sent' : 'delivered',
    created_at: msgTs,
  };

  if (externalId) {
    await supabase
      .from('messages')
      .upsert(msgPayload, { onConflict: 'tenant_id,external_id', ignoreDuplicates: true });
  } else {
    await supabase.from('messages').insert(msgPayload);
  }

  // Atualizar preview da conversa
  await supabase
    .from('conversations')
    .update({
      last_message_text: content.substring(0, 120),
      last_message_at: msgTs,
      last_message_type: type,
      updated_at: now,
    })
    .eq('id', convId)
    .eq('tenant_id', tenantId);
}

// ──────────────────────────────────────────────────────────────────────────────
// ANNE — Vinculação automática de rastreio (mensagens fromMe da FacilZap)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Detecta código de rastreio em mensagens enviadas pelo sistema (fromMe)
 * e vincula automaticamente ao pedido correspondente no banco.
 *
 * Padrões reconhecidos (exemplos de mensagens da FacilZap):
 *   "Olá! Seu pedido #1234 foi despachado! Código de rastreio: BR123456789BR"
 *   "Código de rastreamento do pedido 5678: JD0123456789"
 *   "Rastreio: AA123456789BR — pedido 1234"
 *
 * Roda em fire-and-forget — não bloqueia o webhook.
 */
async function handleTrackingFromMe(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  clientId: string,
  conversationId: string,
  text: string
): Promise<void> {
  // 1. Extrair código de rastreio
  const trackingResult = extractTrackingCode(text);
  if (!trackingResult) return; // Mensagem não tem código — ignorar

  const { code: trackingCode, carrier } = trackingResult;

  // 2. Extrair número do pedido da mensagem
  const orderNumber = extractOrderNumber(text);

  console.log(`[Anne Rastreio] Código detectado: ${trackingCode} (${carrier}) | Pedido: ${orderNumber ?? 'não identificado'} | Cliente: ${clientId}`);

  // 3. Localizar o pedido — estratégia em cascata
  let orderId: string | null = null;
  let currentTrackingCode: string | null = null;

  if (orderNumber) {
    // Estratégia A: pedido pelo número explícito na mensagem
    const { data: order } = await supabase
      .from('orders')
      .select('id, tracking_code')
      .eq('tenant_id', tenantId)
      .eq('order_number', orderNumber)
      .maybeSingle();

    if (order) {
      orderId = order.id;
      currentTrackingCode = order.tracking_code;
    }
  }

  if (!orderId) {
    // Estratégia B: pedido mais recente do cliente sem rastreio (status: shipped/processing/confirmed)
    const { data: orders } = await supabase
      .from('orders')
      .select('id, tracking_code, order_number')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .is('tracking_code', null)
      .in('status', ['shipped', 'processing', 'confirmed', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (orders?.[0]) {
      orderId = orders[0].id;
      currentTrackingCode = orders[0].tracking_code ?? null;
      console.log(`[Anne Rastreio] Estratégia B: pedido #${orders[0].order_number} selecionado`);
    }
  }

  if (!orderId) {
    console.warn(`[Anne Rastreio] Nenhum pedido encontrado para vincular o código ${trackingCode}`);
    return;
  }

  // 4. Evitar sobrescrever código já existente (a não ser que seja o mesmo)
  if (currentTrackingCode && currentTrackingCode === trackingCode) {
    console.log(`[Anne Rastreio] Código ${trackingCode} já está vinculado ao pedido ${orderId} — sem alteração`);
    return;
  }

  // 5. Gravar o código no pedido
  const trackingUrl = buildTrackingUrl(trackingCode, carrier);

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      tracking_code: trackingCode,
      tracking_url: trackingUrl,
      status: 'shipped',
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', orderId);

  if (updateError) {
    console.error(`[Anne Rastreio] Erro ao gravar código ${trackingCode} no pedido ${orderId}:`, updateError.message);
    return;
  }

  // 6. Mover kanban → DESPACHADO (upsert garante criação do card se ainda não existe)
  await supabase
    .from('kanban_cards')
    .upsert(
      {
        tenant_id: tenantId,
        chat_id: conversationId,
        client_id: clientId,
        coluna: 'DESPACHADO',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,chat_id' }
    );

  // 7. Emitir SSE para atualizar a UI em tempo real
  eventBus.emitToTenant('order_updated', tenantId, {
    order_id: orderId,
    client_id: clientId,
    tracking_code: trackingCode,
    tracking_url: trackingUrl,
    carrier,
    source: 'anne_auto',
  });

  console.log(`[Anne Rastreio] ✅ Código ${trackingCode} (${carrier}) vinculado ao pedido ${orderId} | Cliente ${clientId}`);
}

/**
 * Monta URL de rastreio baseada na transportadora detectada.
 */
function buildTrackingUrl(code: string, carrier: string): string {
  const upper = code.toUpperCase();
  if (carrier === 'Correios' || /^[A-Z]{2}\d{9}BR$/i.test(upper)) {
    return `https://rastreamento.correios.com.br/app/index.php?objetos=${upper}`;
  }
  if (carrier === 'Jadlog' || upper.startsWith('JD')) {
    return `https://www.jadlog.com.br/jadlog/tracking.jad?cte=${upper}`;
  }
  if (carrier === 'Total Express' || upper.startsWith('TE')) {
    return `https://www.totalexpress.com.br/rastreamento/${upper}`;
  }
  if (carrier === 'J&T Express' || /^\d{13,16}$/.test(upper)) {
    return `https://www.jtexpress.com.br/trajectoryQuery?bills=${upper}`;
  }
  if (carrier === 'Loggi' || upper.startsWith('FZ')) {
    return `https://www.loggi.com/rastreador/?q=${upper}`;
  }
  if (carrier === 'Shopee Xpress' || upper.startsWith('SP')) {
    return `https://spx.shopee.com.br/track?trackingNumber=${upper}`;
  }
  // Fallback: Correios (aceita vários formatos)
  return `https://rastreamento.correios.com.br/app/index.php?objetos=${upper}`;
}

/**
 * Busca foto via Evolution API e faz cache permanente no Storage.
 * Roda em background sem bloquear o webhook.
 */
async function cacheAvatarInBackground(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  clientId: string,
  phoneNormalized: string
): Promise<void> {
  try {
    const config = getTenantEvolutionConfig(tenantId);
    const picUrl = await fetchProfilePicUrl(config, `${phoneNormalized}@s.whatsapp.net`);
    if (!picUrl) return;

    // Só cachear se for URL válida do WhatsApp
    if (!picUrl.includes('whatsapp') && !picUrl.includes('pps.') && !picUrl.includes('mmg.')) return;

    const permanentUrl = await cacheProfilePic(supabase, tenantId, clientId, picUrl);
    if (!permanentUrl) return;

    await supabase
      .from('clients')
      .update({ avatar_url: permanentUrl })
      .eq('id', clientId)
      .eq('tenant_id', tenantId);

    console.log(`[Avatar] Cache permanente salvo para cliente ${clientId}`);
  } catch (err) {
    console.warn(`[Avatar] Erro ao cachear foto do cliente ${clientId}:`, err);
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

  // A Evolution API às vezes envia messages.update sem data.key (ex: receipt updates)
  // Guardar defensivamente para não crashar
  const messageId = data?.key?.id;
  const status = data?.status;

  if (!messageId || !status) {
    console.log(`[Webhook] messages.update sem key.id ou status — ignorando. data keys: ${Object.keys(data || {}).join(',')}`);
    return;
  }

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
  console.log(`[Sync Auto] Iniciando para tenant ${tenantId}...`);

  const config = getTenantEvolutionConfig(tenantId);
  const chats = await fetchChats(config);
  const recentChats = chats
    .sort((a, b) => (b.lastMessage?.messageTimestamp || 0) - (a.lastMessage?.messageTimestamp || 0))
    .slice(0, 100);

  let totalMessages = 0;
  let totalClients = 0;

  for (const chat of recentChats) {
    try {
      const phone = chat.remoteJid.replace('@s.whatsapp.net', '');
      if (phone.length < 8 || phone.length > 15) continue;

      const phoneNormalized = PhoneNormalizer.canonical(phone);
      const phoneDisplay = PhoneNormalizer.normalize(phone);

      // ── FIX NOMES no sync histórico ───────────────────────────────────────
      // pushName do chat pode ser o nome da instância quando a última mensagem
      // foi enviada por nós. Verificar antes de usar.
      const rawPushName = chat.pushName || chat.lastMessage?.pushName || '';
      const safePushName = !isInstanceName(rawPushName) ? rawPushName.trim() : '';

      // Buscar cliente existente para preservar nome e avatar
      const { data: existingClient } = await supabase
        .from('clients')
        .select('id, name, name_manual, avatar_url')
        .eq('tenant_id', tenantId)
        .eq('phone_normalized', phoneNormalized)
        .maybeSingle();

      // Resolver nome com hierarquia
      let resolvedName: string;
      if (existingClient?.name_manual) {
        resolvedName = existingClient.name_manual;
      } else if (safePushName) {
        resolvedName = safePushName;
      } else if (existingClient?.name && !/^\d/.test(existingClient.name)) {
        resolvedName = existingClient.name;
      } else {
        resolvedName = phoneDisplay;
      }

      // ── FIX FOTOS no sync histórico ───────────────────────────────────────
      // Nunca salvar URLs temporárias do WhatsApp diretamente.
      // Só atualizar avatar se ainda não tem URL permanente no Storage.
      const hasPermamentAvatar = existingClient?.avatar_url?.includes('supabase.co/storage');

      const { data: client, error: upsertErr } = await supabase
        .from('clients')
        .upsert(
          {
            tenant_id: tenantId,
            phone: phoneDisplay,
            phone_normalized: phoneNormalized,
            name: resolvedName,
            // Não inclui avatar_url — só cacheAvatarInBackground salva
          },
          { onConflict: 'tenant_id,phone_normalized', ignoreDuplicates: false }
        )
        .select('id')
        .single();

      if (upsertErr || !client) continue;

      // Cachear foto em background se não tem permanente
      if (!hasPermamentAvatar) {
        cacheAvatarInBackground(supabase, tenantId, client.id, phoneNormalized).catch(() => {});
      }

      totalClients++;

      // Buscar ou criar conversa
      // NOTA: NÃO filtrar por channel — garante consistência com messages/route.ts
      let convId: string;
      const { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('client_id', client.id)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1)
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

      // Buscar mensagens com paginação
      let page = 1;
      let chatMsgsInserted = 0;
      const PAGE_SIZE = 100;
      const MAX_PER_CHAT = 200;

      while (chatMsgsInserted < MAX_PER_CHAT) {
        const batch = await fetchMessages(config, chat.remoteJid, page, PAGE_SIZE);
        if (batch.records.length === 0) break;

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

        if (page >= batch.pages) break;
        page++;
      }

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

  console.log(`[Sync Auto] Concluído: ${totalClients} clientes, ${totalMessages} mensagens`);

  eventBus.emitToTenant('sync_complete', tenantId, {
    clients: totalClients,
    messages: totalMessages,
  });
}

/**
 * Processa eventos de presença (online / digitando / gravando).
 * Evolution API envia: { event: 'presence.update', data: { id: 'phone@s.whatsapp.net', presences: { 'phone@s.whatsapp.net': { lastKnownPresence: 'available'|'unavailable'|'composing'|'recording' } } } }
 */
function handlePresenceUpdate(
  tenantId: string,
  payload: EvolutionWebhookPayload
) {
  try {
    const data = payload.data as Record<string, unknown>;
    const jid = data.id as string;
    if (!jid) return;

    const phone = jid.replace('@s.whatsapp.net', '').replace('@lid', '');
    const presences = (data.presences as Record<string, { lastKnownPresence: string }>) || {};
    const presenceKey = Object.keys(presences)[0];
    const presence = presenceKey ? presences[presenceKey]?.lastKnownPresence : null;

    if (!presence) return;

    // Mapear para estado legível
    const statusMap: Record<string, string> = {
      available: 'online',
      unavailable: 'offline',
      composing: 'typing',
      recording: 'recording',
    };

    const mappedStatus = statusMap[presence] || presence;

    console.log(`[Webhook] presence.update — ${phone} → ${mappedStatus}`);

    // Emitir via SSE para atualizar UI em tempo real
    eventBus.emitToTenant('presence_update', tenantId, {
      phone,
      jid,
      status: mappedStatus,
      // TTL: presença expira em 10s (disponível/offline) ou 15s (digitando/gravando)
      expires_at: Date.now() + (['typing', 'recording'].includes(mappedStatus) ? 15_000 : 10_000),
    });
  } catch (err) {
    console.warn('[Webhook] Erro ao processar presence.update:', err);
  }
}
