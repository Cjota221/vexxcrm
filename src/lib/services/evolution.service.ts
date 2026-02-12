/**
 * Evolution API Service — Comunicação com a API Evolution (WhatsApp Business).
 * 
 * Todas as funções recebem `apiUrl` e `apiKey` como parâmetros (SaaS multi-tenant).
 * Não lê variáveis de ambiente globais.
 */

interface EvolutionAPIConfig {
  apiUrl: string;      // Ex: https://evolution.vps.com
  apiKey: string;      // Global API Key
  instanceName: string; // Nome da instância do tenant
}

/**
 * Cria uma nova instância WhatsApp para o tenant.
 * 
 * @param config - Configuração da Evolution API
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
    const error = await response.json();
    throw new Error(error.message || 'Erro ao criar instância');
  }

  const data = await response.json();
  return data.qrcode?.base64 || '';
}

/**
 * Busca o status da conexão de uma instância.
 * 
 * @param config - Configuração da Evolution API
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

  const data = await response.json();
  return data.instance?.state || 'close';
}

/**
 * Envia mensagem de texto via WhatsApp.
 * 
 * @param config - Configuração da Evolution API
 * @param to - Número de destino (formato: 5562999998888)
 * @param text - Conteúdo da mensagem
 * @returns ID da mensagem enviada
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
    body: JSON.stringify({
      number: to,
      text,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Erro ao enviar mensagem');
  }

  const data = await response.json();
  return data.key?.id || '';
}

/**
 * Envia mensagem com mídia (imagem, vídeo, áudio, documento).
 * 
 * @param config - Configuração da Evolution API
 * @param to - Número de destino
 * @param mediaUrl - URL pública da mídia
 * @param caption - Legenda (opcional)
 * @param mediaType - Tipo: 'image' | 'video' | 'audio' | 'document'
 */
export async function sendMediaMessage(
  config: EvolutionAPIConfig,
  to: string,
  mediaUrl: string,
  caption?: string,
  mediaType: 'image' | 'video' | 'audio' | 'document' = 'image'
): Promise<string> {
  const endpoint = `${config.apiUrl}/message/send${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}/${config.instanceName}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': config.apiKey,
    },
    body: JSON.stringify({
      number: to,
      mediaUrl,
      caption,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Erro ao enviar mídia');
  }

  const data = await response.json();
  return data.key?.id || '';
}

/**
 * Deleta uma instância WhatsApp.
 * 
 * @param config - Configuração da Evolution API
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
 * 
 * @param config - Configuração da Evolution API
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
