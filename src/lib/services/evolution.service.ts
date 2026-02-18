/**
 * Evolution API Service — SaaS Multi-Tenant Orchestrator.
 * 
 * Modelo SaaS: A GLOBAL_API_KEY e EVOLUTION_API_URL ficam APENAS no servidor.
 * Cada tenant recebe uma instância isolada (vexx-{tenantId}).
 * O lojista nunca vê credenciais da Evolution API.
 * 
 * Funções recebem EvolutionAPIConfig OU usam getGlobalConfig() + instanceName.
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TIPOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface EvolutionAPIConfig {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
}

export interface InstanceProvisionResult {
  instanceName: string;
  status: 'created' | 'exists';
  qrCode?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONFIG GLOBAL (protegida no servidor)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Retorna as credenciais globais da Evolution API.
 * NUNCA expostas ao client-side.
 */
export function getGlobalConfig(): { apiUrl: string; apiKey: string } {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_GLOBAL_KEY || process.env.EVOLUTION_API_KEY;

  if (!apiUrl || !apiKey) {
    throw new Error(
      'Evolution API não configurada no servidor. ' +
      'Defina EVOLUTION_API_URL e EVOLUTION_GLOBAL_KEY no .env'
    );
  }

  return { apiUrl: apiUrl.replace(/\/$/, ''), apiKey };
}

/**
 * Gera o nome determinístico da instância para um tenant.
 * Formato: vexx-{primeiros 12 chars do tenantId}
 */
export function getInstanceName(tenantId: string): string {
  return `vexx-${tenantId.replace(/-/g, '').slice(0, 12)}`;
}

/**
 * Monta o EvolutionAPIConfig completo para um tenant.
 */
export function getTenantEvolutionConfig(tenantId: string): EvolutionAPIConfig {
  const { apiUrl, apiKey } = getGlobalConfig();
  return { apiUrl, apiKey, instanceName: getInstanceName(tenantId) };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SAFE JSON HELPER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Faz parsing seguro de response JSON.
 * Se a Evolution API retornar HTML (Cloudflare, nginx 502, etc.),
 * lança erro legível ao invés de "Unexpected token '<'".
 */
async function safeJson<T = any>(response: Response, context = 'Evolution API'): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (!contentType.includes('application/json') && !text.trim().startsWith('{') && !text.trim().startsWith('[')) {
    const preview = text.substring(0, 150).replace(/\n/g, ' ');
    throw new Error(
      `${context} retornou resposta não-JSON (HTTP ${response.status}). ` +
      `Content-Type: ${contentType || 'vazio'}. Preview: "${preview}"`
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.substring(0, 150).replace(/\n/g, ' ');
    throw new Error(
      `${context} retornou JSON inválido (HTTP ${response.status}). ` +
      `Preview: "${preview}"`
    );
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ORQUESTRADOR DE INSTÂNCIAS (SaaS Connect)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Provisiona ou recupera instância para um tenant.
 * Se não existe, cria. Se existe, retorna status.
 * Também configura webhook automaticamente.
 */
export async function provisionInstance(
  tenantId: string,
  webhookBaseUrl: string
): Promise<InstanceProvisionResult> {
  const config = getTenantEvolutionConfig(tenantId);
  const { instanceName } = config;

  // 1. Verificar se instância já existe
  let status = 'close';
  let instanceExists = false;
  try {
    status = await getInstanceStatus(config);
    instanceExists = true;
  } catch {
    // Instância não existe, criar
  }

  // 2. Se já está conectada, retornar
  if (status === 'open') {
    return { instanceName, status: 'exists' };
  }

  // 3. Se existe mas está desconectada, tentar reconectar (buscar QR novo)
  if (instanceExists && status !== 'open') {
    try {
      const qrCode = await reconnectInstance(config);
      if (qrCode) {
        return { instanceName, status: 'created', qrCode };
      }
    } catch (err) {
      console.warn(`[Evolution] Reconexão falhou, deletando e recriando:`, err);
      // Se falhar, deletar e recriar
      try { await deleteInstance(config); } catch { /* ignore */ }
    }
  }

  // 4. Criar instância nova
  const qrCode = await createInstance(config);

  // 5. Configurar webhook apontando para nosso backend
  try {
    await setInstanceWebhook(config, webhookBaseUrl, tenantId);
  } catch (err) {
    console.warn(`[Evolution] Erro ao configurar webhook para ${instanceName}:`, err);
  }

  return { instanceName, status: 'created', qrCode };
}

/**
 * Reconecta uma instância existente e retorna novo QR Code.
 */
async function reconnectInstance(config: EvolutionAPIConfig): Promise<string | null> {
  const response = await fetch(`${config.apiUrl}/instance/connect/${config.instanceName}`, {
    method: 'GET',
    headers: {
      'apikey': config.apiKey,
    },
  });

  if (!response.ok) {
    throw new Error('Erro ao reconectar instância');
  }

  const data = await safeJson(response, 'Reconectar instância');
  return data.base64 || data.qrcode?.base64 || null;
}

/**
 * Configura o webhook da instância para apontar para nosso backend.
 */
async function setInstanceWebhook(
  config: EvolutionAPIConfig,
  webhookBaseUrl: string,
  tenantId: string
): Promise<void> {
  const webhookUrl = `${webhookBaseUrl}/api/webhooks/evolution?tenant_id=${tenantId}`;

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
        ],
      },
    }),
  });

  if (!response.ok) {
    const err = await safeJson(response, 'Webhook set').catch(() => ({}));
    console.warn('[Evolution] Webhook set error:', err);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CRUD DE INSTÂNCIAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Cria uma nova instância WhatsApp.
 * @returns QR Code base64 para autenticação
 */
export async function createInstance(config: EvolutionAPIConfig): Promise<string> {
  const response = await fetch(`${config.apiUrl}/instance/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': config.apiKey,
    },
    body: JSON.stringify({
      instanceName: config.instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    }),
  });

  if (!response.ok) {
    const error = await safeJson(response, 'Criar instância').catch(() => ({}));
    throw new Error(error.message || 'Erro ao criar instância');
  }

  const data = await safeJson(response, 'Criar instância');
  return data.qrcode?.base64 || '';
}

/**
 * Busca o status da conexão de uma instância.
 * @returns Status: 'open' | 'close' | 'connecting'
 */
export async function getInstanceStatus(config: EvolutionAPIConfig): Promise<string> {
  const response = await fetch(`${config.apiUrl}/instance/connectionState/${config.instanceName}`, {
    method: 'GET',
    headers: {
      'apikey': config.apiKey,
    },
  });

  if (!response.ok) {
    throw new Error('Erro ao buscar status da instância');
  }

  const data = await safeJson(response, 'Status da instância');
  return data.instance?.state || 'close';
}

/**
 * Deleta uma instância WhatsApp.
 */
export async function deleteInstance(config: EvolutionAPIConfig): Promise<void> {
  const response = await fetch(`${config.apiUrl}/instance/delete/${config.instanceName}`, {
    method: 'DELETE',
    headers: {
      'apikey': config.apiKey,
    },
  });

  if (!response.ok) {
    throw new Error('Erro ao deletar instância');
  }
}

/**
 * Logout da instância (desconecta do WhatsApp).
 */
export async function logoutInstance(config: EvolutionAPIConfig): Promise<void> {
  const response = await fetch(`${config.apiUrl}/instance/logout/${config.instanceName}`, {
    method: 'DELETE',
    headers: {
      'apikey': config.apiKey,
    },
  });

  if (!response.ok) {
    throw new Error('Erro ao fazer logout');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ENVIO DE MENSAGENS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Envia mensagem de texto via WhatsApp.
 */
export async function sendTextMessage(
  config: EvolutionAPIConfig,
  to: string,
  text: string
): Promise<string> {
  const response = await fetch(`${config.apiUrl}/message/sendText/${config.instanceName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': config.apiKey,
    },
    body: JSON.stringify({ number: to, text }),
  });

  if (!response.ok) {
    const error = await safeJson(response, 'Enviar texto').catch(() => ({}));
    throw new Error(error.message || 'Erro ao enviar mensagem');
  }

  const data = await safeJson(response, 'Enviar texto');
  return data.key?.id || '';
}

/**
 * Envia mensagem com mídia (imagem, vídeo, áudio, documento).
 */
export async function sendMediaMessage(
  config: EvolutionAPIConfig,
  to: string,
  mediaUrl: string,
  caption?: string,
  mediaType: 'image' | 'video' | 'audio' | 'document' = 'image'
): Promise<string> {
  const typeCapitalized = mediaType.charAt(0).toUpperCase() + mediaType.slice(1);
  const endpoint = `${config.apiUrl}/message/send${typeCapitalized}/${config.instanceName}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': config.apiKey,
    },
    body: JSON.stringify({ number: to, mediaUrl, caption }),
  });

  if (!response.ok) {
    const error = await safeJson(response, 'Enviar mídia').catch(() => ({}));
    throw new Error(error.message || 'Erro ao enviar mídia');
  }

  const data = await safeJson(response, 'Enviar mídia');
  return data.key?.id || '';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ENCAMINHAMENTO DE MÍDIA PARA n8n
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BUSCA DE DADOS (para Sync Histórico)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface EvolutionChat {
  id: string | null;
  remoteJid: string;
  pushName: string | null;
  profilePicUrl: string | null;
  unreadCount: number;
  lastMessage?: {
    key: { id: string; fromMe: boolean; remoteJid: string };
    message: Record<string, unknown>;
    messageTimestamp: number;
    pushName: string;
    messageType: string;
  };
}

export interface EvolutionMessage {
  id: string;
  key: { id: string; fromMe: boolean; remoteJid: string };
  pushName: string;
  messageType: string;
  message: Record<string, unknown>;
  messageTimestamp: number;
  source: string;
  contextInfo: unknown;
}

/**
 * Busca todos os chats da instância na Evolution API.
 * Retorna apenas chats individuais (exclui grupos e broadcast).
 */
export async function fetchChats(config: EvolutionAPIConfig): Promise<EvolutionChat[]> {
  const response = await fetch(`${config.apiUrl}/chat/findChats/${config.instanceName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': config.apiKey,
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Erro ao buscar chats: HTTP ${response.status}. ${text.substring(0, 100)}`);
  }

  const data: EvolutionChat[] = await safeJson(response, 'Buscar chats');

  // Filtrar apenas chats individuais (@s.whatsapp.net), excluir grupos e broadcast
  return data.filter(
    (c) =>
      c.remoteJid.includes('@s.whatsapp.net') &&
      c.remoteJid !== '0@s.whatsapp.net'
  );
}

/**
 * Busca mensagens de um chat específico na Evolution API (com paginação).
 * @param jid - remoteJid do chat (ex: '5521999999999@s.whatsapp.net')
 * @param page - Número da página (1-based)
 * @param offset - Itens por página (max 100)
 */
export async function fetchMessages(
  config: EvolutionAPIConfig,
  jid: string,
  page = 1,
  offset = 100
): Promise<{ total: number; pages: number; records: EvolutionMessage[] }> {
  const response = await fetch(`${config.apiUrl}/chat/findMessages/${config.instanceName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': config.apiKey,
    },
    body: JSON.stringify({
      where: { key: { remoteJid: jid } },
      page,
      offset,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Erro ao buscar mensagens: HTTP ${response.status}. ${text.substring(0, 100)}`);
  }

  const data = await safeJson(response, 'Buscar mensagens');
  return {
    total: data.messages?.total || 0,
    pages: data.messages?.pages || 0,
    records: data.messages?.records || [],
  };
}

/**
 * Busca URL da foto de perfil de um contato WhatsApp.
 * @param jid - remoteJid (ex: '5521999999999@s.whatsapp.net')
 * @returns URL da foto ou null se não disponível
 */
export async function fetchProfilePicUrl(
  config: EvolutionAPIConfig,
  jid: string
): Promise<string | null> {
  try {
    const response = await fetch(
      `${config.apiUrl}/chat/fetchProfilePictureUrl/${config.instanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.apiKey,
        },
        body: JSON.stringify({ number: jid.replace('@s.whatsapp.net', '') }),
      }
    );

    if (!response.ok) return null;

    const data = await safeJson(response, 'Foto de perfil');
    return data.profilePictureUrl || data.profilePicUrl || data.picture || null;
  } catch {
    return null;
  }
}

export interface MediaForwardPayload {
  tenantId: string;
  messageId: string;
  clientId: string;
  mediaType: 'audio' | 'image' | 'video' | 'document';
  mediaUrl: string;
  mimetype?: string;
  caption?: string;
  senderPhone?: string;
  senderName?: string;
  timestamp: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DOWNLOAD DE MÍDIA → SUPABASE STORAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/3gpp': '3gp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg; codecs=opus': 'ogg',
  'application/pdf': 'pdf', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'image/sticker': 'webp',
};

/**
 * Baixa mídia via Evolution API (getBase64FromMediaMessage) e faz upload
 * para o Supabase Storage. Retorna a URL pública permanente.
 *
 * Fluxo:
 * 1. Chama Evolution API para obter base64 da mídia (ela descriptografa)
 * 2. Converte base64 → Buffer
 * 3. Upload para bucket 'media' no Supabase Storage
 * 4. Retorna URL pública permanente
 *
 * @param config - Config da Evolution API do tenant
 * @param messageKey - key da mensagem (id, remoteJid, fromMe)
 * @param message - objeto message da Evolution API
 * @param tenantId - ID do tenant para namespace no storage
 * @param mimetype - MIME type da mídia (ex: image/jpeg)
 * @returns URL permanente do Supabase Storage ou null se falhar
 */
export async function downloadMediaToStorage(
  config: EvolutionAPIConfig,
  messageKey: { id: string; remoteJid: string; fromMe: boolean },
  message: Record<string, unknown>,
  tenantId: string,
  mimetype?: string
): Promise<string | null> {
  try {
    // 1. Verificar se já temos base64 no payload (webhook com webhook_base64: true)
    let base64Data: string | null = null;

    const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
    for (const mt of mediaTypes) {
      const msgObj = message[mt] as Record<string, unknown> | undefined;
      if (msgObj?.base64) {
        base64Data = msgObj.base64 as string;
        if (!mimetype) mimetype = msgObj.mimetype as string;
        break;
      }
    }

    // 2. Se não temos base64 no payload, buscar via Evolution API
    if (!base64Data) {
      const response = await fetch(
        `${config.apiUrl}/chat/getBase64FromMediaMessage/${config.instanceName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.apiKey,
          },
          body: JSON.stringify({
            message: { key: messageKey, message },
            convertToMp4: false,
          }),
        }
      );

      if (!response.ok) {
        console.warn(`[Media] Evolution getBase64 falhou: HTTP ${response.status}`);
        return null;
      }

      const data = await safeJson(response, 'getBase64FromMediaMessage');
      base64Data = data.base64 || null;
      if (!mimetype && data.mimetype) mimetype = data.mimetype;
    }

    if (!base64Data) {
      console.warn('[Media] Nenhum base64 obtido para mídia');
      return null;
    }

    // 3. Remover prefixo data:xxx;base64, se presente
    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    // Limitar a 25MB para não sobrecarregar storage
    if (buffer.length > 25 * 1024 * 1024) {
      console.warn(`[Media] Arquivo muito grande (${(buffer.length / 1024 / 1024).toFixed(1)}MB), ignorando`);
      return null;
    }

    // 4. Determinar extensão
    const ext = (mimetype && MIME_TO_EXT[mimetype]) || 'bin';
    const fileName = `${tenantId}/${Date.now()}-${messageKey.id.slice(-8)}.${ext}`;

    // 5. Upload para Supabase Storage
    const { createServerSupabaseClient } = await import('@/lib/supabase');
    const supabase = createServerSupabaseClient();

    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('media')
      .upload(fileName, buffer, {
        contentType: mimetype || 'application/octet-stream',
        cacheControl: '31536000', // 1 ano
        upsert: false,
      });

    if (uploadErr) {
      console.warn('[Media] Erro no upload Storage:', uploadErr.message);
      return null;
    }

    // 6. Gerar URL pública permanente
    const { data: publicUrlData } = supabase.storage
      .from('media')
      .getPublicUrl(uploadData.path);

    console.log(`[Media] Mídia salva: ${publicUrlData.publicUrl.substring(0, 60)}...`);
    return publicUrlData.publicUrl;
  } catch (err) {
    console.warn('[Media] Erro ao baixar/upload mídia:', err);
    return null;
  }
}

/**
 * Encaminha mídia recebida para o webhook do n8n para processamento
 * (transcrição de áudio, visão computacional de imagens, etc).
 */
export async function forwardMediaToN8n(payload: MediaForwardPayload): Promise<void> {
  const n8nWebhookUrl = process.env.N8N_MEDIA_WEBHOOK_URL;
  if (!n8nWebhookUrl) {
    console.log('[n8n] N8N_MEDIA_WEBHOOK_URL não configurada, ignorando transbordo de mídia');
    return;
  }

  try {
    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.N8N_WEBHOOK_SECRET
          ? { 'x-webhook-secret': process.env.N8N_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify({
        ...payload,
        callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/anne/media-callback`,
      }),
    });

    if (!response.ok) {
      console.warn('[n8n] Erro ao encaminhar mídia:', response.status);
    } else {
      console.log(`[n8n] Mídia ${payload.mediaType} encaminhada para processamento`);
    }
  } catch (err) {
    console.warn('[n8n] Falha ao encaminhar mídia:', err);
  }
}
