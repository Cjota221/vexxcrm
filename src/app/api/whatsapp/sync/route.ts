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
 * POST /api/whatsapp/sync
 *
 * Sincronização histórica: puxa chats e mensagens da Evolution API
 * e salva no Supabase com dedup por external_id.
 *
 * Body (opcional):
 *   - maxChats: número máximo de chats para sincronizar (default: 20)
 *   - maxMessagesPerChat: mensagens por chat (default: 50)
 *   - fullSync: sincronizar TODOS os chats (default: false)
 * 
 * NOTA: Netlify tem timeout de 10s. Valores reduzidos para evitar 504.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const MAX_EXECUTION_TIME = 8000; // 8s max (margem para 10s do Netlify)
  
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    // Parâmetros (valores menores para evitar timeout)
    let maxChats = 20;
    let maxMessagesPerChat = 50;

    try {
      const body = await request.json();
      maxChats = Math.min(body.maxChats || 20, 100);
      maxMessagesPerChat = Math.min(body.maxMessagesPerChat || 50, 200);
      if (body.fullSync) maxChats = 100;
    } catch {
      // Body vazio — usar defaults
    }

    const config = getTenantEvolutionConfig(tenantId);

    // 1. Buscar chats da Evolution API
    console.log(`[Sync] Iniciando sync para tenant ${tenantId}`);
    let chats: EvolutionChat[];
    try {
      chats = await fetchChats(config);
    } catch (err) {
      console.error('[Sync] Erro ao buscar chats:', err);
      return NextResponse.json(
        { error: 'Erro ao buscar chats da Evolution API. Verifique a conexão.' },
        { status: 502 }
      );
    }

    console.log(`[Sync] ${chats.length} chats encontrados, processando até ${maxChats}`);

    // Ordenar por atividade recente e limitar
    chats.sort((a, b) => {
      const tA = a.lastMessage?.messageTimestamp || 0;
      const tB = b.lastMessage?.messageTimestamp || 0;
      return tB - tA; // mais recentes primeiro
    });
    chats = chats.slice(0, maxChats);

    let totalClients = 0;
    let totalConversations = 0;
    let totalMessages = 0;
    let errors = 0;
    let processedChats = 0;
    let timedOut = false;

    // 2. Processar cada chat (com verificação de tempo)
    for (const chat of chats) {
      // Verificar tempo de execução
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        console.log(`[Sync] Timeout preventivo após ${processedChats} chats`);
        timedOut = true;
        break;
      }
      
      try {
        const result = await syncOneChat(supabase, tenantId, config, chat, maxMessagesPerChat);
        totalClients += result.clientCreated ? 1 : 0;
        totalConversations += result.conversationCreated ? 1 : 0;
        totalMessages += result.messagesInserted;
        processedChats++;
      } catch (err) {
        errors++;
        console.error(`[Sync] Erro no chat ${chat.remoteJid}:`, err);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Sync] Concluído em ${duration}ms: ${totalClients} clientes, ${totalConversations} conversas, ${totalMessages} mensagens, ${errors} erros`);

    // Emitir evento SSE para atualizar UI
    eventBus.emitToTenant('sync_complete', tenantId, {
      clients: totalClients,
      conversations: totalConversations,
      messages: totalMessages,
      errors,
    });

    return NextResponse.json({
      success: true,
      data: {
        chats_found: chats.length,
        chats_synced: processedChats,
        clients_created: totalClients,
        conversations_created: totalConversations,
        messages_synced: totalMessages,
        errors,
        timed_out: timedOut,
        duration_ms: duration,
      },
    });
  } catch (error: any) {
    console.error('[Sync] Erro:', error);

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
 * Faz download da foto de perfil e salva permanentemente no Supabase Storage.
 * Retorna URL permanente (Storage) ou URL original como fallback.
 */
async function cacheProfilePic(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  clientId: string,
  picUrl: string
): Promise<string | null> {
  const TAG = `[CacheProfilePic][${clientId.slice(0, 8)}]`;
  console.log(`${TAG} Iniciando download: ${picUrl.substring(0, 80)}...`);

  try {
    const res = await fetch(picUrl, { redirect: 'follow' });
    console.log(`${TAG} HTTP status do download: ${res.status} ${res.statusText}`);

    if (!res.ok) {
      console.warn(`${TAG} ❌ Download falhou (status ${res.status}) — abortando, NÃO salvando URL temporária`);
      return null; // NUNCA retornar URL temporária como fallback
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const path = `${tenantId}/clients/${clientId}.${ext}`;

    console.log(`${TAG} Fazendo upload para Storage: avatars/${path} (${buffer.byteLength} bytes, ${contentType})`);

    const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, buffer, {
      contentType,
      upsert: true,
    });

    if (uploadErr) {
      console.error(`${TAG} ❌ Upload falhou: ${uploadErr.message} — abortando, NÃO salvando URL temporária`);
      return null; // NUNCA retornar URL temporária como fallback
    }

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    const permanentUrl = pub.publicUrl || null;
    console.log(`${TAG} ✅ Upload OK — URL permanente: ${permanentUrl?.substring(0, 80)}`);
    return permanentUrl;
  } catch (err) {
    console.error(`${TAG} ❌ Exceção: ${err instanceof Error ? err.message : err} — abortando, NÃO salvando URL temporária`);
    return null; // NUNCA retornar URL temporária como fallback
  }
}

/**
 * Sincroniza um chat individual: cliente → conversa → mensagens.
 */
async function syncOneChat(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  config: ReturnType<typeof getTenantEvolutionConfig>,
  chat: EvolutionChat,
  maxMessages: number
): Promise<{ clientCreated: boolean; conversationCreated: boolean; messagesInserted: number }> {
  const jid = chat.remoteJid;
  const phone = jid.replace('@s.whatsapp.net', '');
  const phoneNormalized = PhoneNormalizer.canonical(phone);
  const phoneDisplay = PhoneNormalizer.normalize(phone);

  // ─── Hierarquia de Identidade Progressiva ────────────────────────────────
  // Candidatos de nome vindos da Evolution API
  const rawPushName = chat.pushName || chat.lastMessage?.pushName || '';

  // Heurística: rejeitar pushName se for igual ao nome da instância/número.
  // O nome da instância (ex: "Cjota Rasteirinhas") não é o nome do contato —
  // ele aparece em mensagens enviadas PELA instância (fromMe=true).
  // Sinais de que é um nome de instância e não do contato:
  //   1. Idêntico ao campo instanceName da config da Evolution
  //   2. É apenas dígitos (é o próprio número)
  //   3. Vazio
  const instanceName = config.instanceName || '';
  const isInstanceName = (
    !rawPushName ||
    rawPushName.trim() === '' ||
    rawPushName === instanceName ||
    /^\d+$/.test(rawPushName.replace(/\D/g, '')) && rawPushName.replace(/\D/g, '').length >= 8
  );
  const safePushName = isInstanceName ? '' : rawPushName.trim();

  // 1. Verificar se já existe cliente no banco para este telefone
  // Busca colunas básicas que sempre existem + colunas opcionais (migration 011)
  const { data: existingClient } = await supabase
    .from('clients')
    .select('id, name, avatar_url, created_at')
    .eq('tenant_id', tenantId)
    .eq('phone_normalized', phoneNormalized)
    .maybeSingle();

  // 1a. Buscar foto de perfil — só se o cliente ainda não tiver uma (não-bloqueante)
  let avatarUrl: string | null = existingClient?.avatar_url || null;
  console.log(`[SyncChat][${phoneNormalized}] avatar_url no banco: ${avatarUrl ? avatarUrl.substring(0, 60) : 'null'}`);

  if (!avatarUrl) {
    const rawPic = chat.profilePicUrl || await fetchProfilePicUrl(config, jid).catch(() => null);
    console.log(`[SyncChat][${phoneNormalized}] rawPic da Evolution: ${rawPic ? rawPic.substring(0, 60) : 'null'}`);

    if (rawPic) {
      // Usar ID existente ou gerar placeholder para cache
      const clientIdForCache = existingClient?.id || crypto.randomUUID();
      console.log(`[SyncChat][${phoneNormalized}] Iniciando cacheProfilePic para clientId: ${clientIdForCache}`);
      avatarUrl = await cacheProfilePic(supabase, tenantId, clientIdForCache, rawPic);
      console.log(`[SyncChat][${phoneNormalized}] avatarUrl após cache: ${avatarUrl ? avatarUrl.substring(0, 60) : 'null (não salvar no banco)'}`);
    }
  } else {
    console.log(`[SyncChat][${phoneNormalized}] ✅ Cliente já tem avatar permanente — pulando fetch`);
  }

  // 2. Verificar pedidos vinculados ao cliente

  // 2a. Tentar ler name_manual separadamente (existe apenas após migration 011)
  let nameManual: string | null = null;
  if (existingClient?.id) {
    try {
      const { data: ext } = await supabase
        .from('clients')
        .select('name_manual')
        .eq('id', existingClient.id)
        .maybeSingle();
      nameManual = (ext as any)?.name_manual || null;
    } catch {
      // Coluna ainda não existe — ignorar silenciosamente
    }
  }

  // 2b. Verificar se há pedido vinculado — fonte mais confiável de nome
  let nameFromOrder: string | null = null;
  if (existingClient?.id) {
    const { data: order } = await supabase
      .from('orders')
      .select('customer_name')
      .eq('tenant_id', tenantId)
      .eq('client_id', existingClient.id)
      .not('customer_name', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    nameFromOrder = order?.customer_name || null;
  }

  // 3. Aplicar hierarquia: Nome Manual > Nome do Pedido > PushName > Nome Existente > Telefone
  // IMPORTANTE: nunca sobrescrever um nome real já salvo no banco com phoneDisplay.
  // Isso evita que disparos (fromMe=true) apaguem o nome do cliente, pois
  // nesses casos safePushName fica vazio (filtrado como nome da instância).
  const existingName = existingClient?.name || null;
  const existingNameIsReal = existingName ? !/^\d/.test(existingName) : false;

  const resolvedName =
    nameManual ||                                      // 1º — edição manual (nunca sobrescrever)
    nameFromOrder ||                                   // 2º — nome real do pedido (FacilZap)
    safePushName ||                                    // 3º — pushName de mensagem recebida
    (existingNameIsReal ? existingName! : null) ||     // 4º — nome já salvo no banco (protege de disparo)
    phoneDisplay;                                      // 5º — último recurso: número formatado

  // 4. Upsert cliente com nome resolvido
  const upsertData: Record<string, unknown> = {
    tenant_id: tenantId,
    phone: phoneDisplay,
    phone_normalized: phoneNormalized,
    name: resolvedName,
  };
  if (avatarUrl) {
    upsertData.avatar_url = avatarUrl;
    console.log(`[SyncChat][${phoneNormalized}] 📸 Incluindo avatar_url no upsert: ${avatarUrl.substring(0, 60)}`);
  } else {
    console.log(`[SyncChat][${phoneNormalized}] ⏭️ Sem avatar_url para salvar no upsert`);
  }

  // Colunas opcionais — só incluir se a migration 011 foi aplicada
  // (o upsert falharia silenciosamente com colunas inexistentes, então testamos primeiro)
  if (safePushName) {
    // Tentativa segura: se a coluna não existir, o Supabase ignora em upsert com select()
    // mas pode lançar erro — por isso fazemos update separado após o upsert principal
  }
  if (nameManual) {
    upsertData.name_manual = nameManual;
  }

  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .upsert(upsertData, {
      onConflict: 'tenant_id,phone_normalized',
      ignoreDuplicates: false,
    })
    .select('id, created_at')
    .single();

  if (clientErr || !client) {
    console.error(`[SyncChat][${phoneNormalized}] ❌ Erro no upsert: ${clientErr?.message}`);
    throw new Error(`Erro ao upsert cliente ${phone}: ${clientErr?.message}`);
  }

  console.log(`[SyncChat][${phoneNormalized}] ✅ Upsert OK — client.id: ${client.id}`);

  // Detectar se cliente foi criado agora (created_at nos últimos 5 segundos)
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

  // 3. Buscar mensagens da Evolution API (com paginação)
  let allMessages: EvolutionMessage[] = [];
  let page = 1;
  const offset = 100;

  while (allMessages.length < maxMessages) {
    const batch = await fetchMessages(config, jid, page, offset);
    allMessages = allMessages.concat(batch.records);

    if (page >= batch.pages || allMessages.length >= maxMessages) break;
    page++;
  }

  allMessages = allMessages.slice(0, maxMessages);

  if (allMessages.length === 0) {
    return { clientCreated, conversationCreated, messagesInserted: 0 };
  }

  // 4. Buscar external_ids já existentes para dedup
  const externalIds = allMessages.map((m) => m.key.id).filter(Boolean);
  const { data: existingMsgs } = await supabase
    .from('messages')
    .select('external_id')
    .eq('tenant_id', tenantId)
    .eq('conversation_id', conversationId)
    .in('external_id', externalIds);

  const existingSet = new Set((existingMsgs || []).map((m) => m.external_id));

  // 5. Filtrar mensagens novas
  const newMessages = allMessages.filter(
    (m) => m.key.id && !existingSet.has(m.key.id)
  );

  if (newMessages.length === 0) {
    return { clientCreated, conversationCreated, messagesInserted: 0 };
  }

  // 6. Inserir mensagens em batch
  const rows = newMessages.map((m) => {
    // Extrair conteúdo
    const msgContent = m.message || {};
    const text =
      (msgContent.conversation as string) ||
      (msgContent.extendedTextMessage as Record<string, unknown>)?.text ||
      (msgContent.imageMessage as Record<string, unknown>)?.caption ||
      (msgContent.videoMessage as Record<string, unknown>)?.caption ||
      '';

    // Detectar tipo
    let type = 'text';
    if (msgContent.imageMessage) type = 'image';
    else if (msgContent.videoMessage) type = 'video';
    else if (msgContent.audioMessage) type = 'audio';
    else if (msgContent.documentMessage) type = 'document';
    else if (msgContent.stickerMessage) type = 'sticker';

    // Extrair URL de mídia
    let mediaUrl: string | null = null;
    let mimetype: string | null = null;
    const mediaObj = (msgContent.imageMessage ||
      msgContent.videoMessage ||
      msgContent.audioMessage ||
      msgContent.documentMessage) as Record<string, unknown> | undefined;
    if (mediaObj) {
      mediaUrl = (mediaObj.url as string) || null;
      mimetype = (mediaObj.mimetype as string) || null;
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
      media_mime_type: mimetype,
      status: m.key.fromMe ? 'sent' : 'delivered',
      created_at: m.messageTimestamp
        ? new Date(m.messageTimestamp * 1000).toISOString()
        : new Date().toISOString(),
    };
  });

  // Inserir em batches de 50 para evitar payload muito grande
  let messagesInserted = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error: insertErr } = await supabase
      .from('messages')
      .insert(batch);

    if (insertErr) {
      console.error(`[Sync] Erro ao inserir batch ${i}-${i + batch.length}:`, insertErr.message);
    } else {
      messagesInserted += batch.length;
    }
  }

  // 7. Atualizar last_message na conversa (desnormalizado)
  const lastMsg = rows[rows.length - 1]; // rows já estão ordenadas cronologicamente
  if (lastMsg) {
    await supabase
      .from('conversations')
      .update({
        last_message_text: lastMsg.content || `📎 ${lastMsg.type}`,
        last_message_at: lastMsg.created_at,
        last_message_type: lastMsg.type,
        message_count: messagesInserted,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId);
  }

  return { clientCreated, conversationCreated, messagesInserted };
}
