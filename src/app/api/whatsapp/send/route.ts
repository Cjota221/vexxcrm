import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { sendTextMessage, sendMediaMessage, getTenantEvolutionConfig } from '@/lib/services/evolution.service';
import { PhoneNormalizer } from '@/lib/phone-normalizer';
import { createServerSupabaseClient } from '@/lib/supabase';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';

/**
 * POST /api/whatsapp/send
 * 
 * SaaS Send — Envia mensagem via WhatsApp usando credenciais globais.
 * Isolamento: config montada a partir do tenantId, impossível acessar instância de outro.
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);

    // Rate limiting por tenant
    const rl = checkRateLimit(`whatsapp-send:${tenantId}`, RATE_LIMITS.WHATSAPP_SEND);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Muitas mensagens enviadas. Aguarde um momento.' },
        { status: 429 }
      );
    }

    // Config montada a partir do tenantId (credenciais globais + instanceName isolado)
    const config = getTenantEvolutionConfig(tenantId);

    const body = await request.json();
    const { to, content, type = 'text', mediaUrl, caption, clientId: clientIdFromBody } = body;

    if (!to || !content) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: to, content' },
        { status: 400 }
      );
    }

    // Normalizar telefone (adicionar DDI se necessário)
    const phoneNormalized = PhoneNormalizer.canonical(to);

    let messageId: string;

    // Enviar mensagem (texto ou mídia)
    if (type === 'text') {
      messageId = await sendTextMessage(config, phoneNormalized, content);
    } else {
      if (!mediaUrl) {
        return NextResponse.json(
          { error: 'mediaUrl obrigatório para envio de mídia' },
          { status: 400 }
        );
      }

      messageId = await sendMediaMessage(
        config,
        phoneNormalized,
        mediaUrl,
        caption || content,
        type as 'image' | 'video' | 'audio' | 'document'
      );
    }

    // Guardar: se a Evolution API não retornou ID, gerar um ID local temporário.
    // Sem external_id válido, a deduplicação com o webhook falha e a mensagem fica
    // duplicada no banco. O ID temporário garante que o upsert salva e o webhook
    // atualiza via external_id quando chegar.
    if (!messageId) {
      messageId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      console.warn(`[Send] Evolution API não retornou messageId — usando ID temporário: ${messageId}`);
    }

    // Salvar mensagem no banco de dados
    const supabase = createServerSupabaseClient();

    // Buscar cliente
    // Se o front-end passou clientId (selectedChatId = UUID real), usar direto.
    // Garante que a mensagem fica na mesma conversa que está aberta no chat.
    let clientId: string;

    if (clientIdFromBody) {
      const { data: validClient } = await supabase
        .from('clients').select('id')
        .eq('tenant_id', tenantId).eq('id', clientIdFromBody).single();
      if (validClient) {
        clientId = validClient.id;
        console.log(`[Send] clientId do body: ${clientId}`);
      }
    }

    if (!clientId!) {
      // Fallback: buscar por phone_normalized
      const { data: byPhone } = await supabase
        .from('clients').select('id')
        .eq('tenant_id', tenantId)
        .eq('phone_normalized', PhoneNormalizer.canonical(to))
        .single();

      if (byPhone) {
        clientId = byPhone.id;
        console.log(`[Send] clientId por phone: ${clientId}`);
      } else {
        // Criar cliente novo
        const phoneDisplay = PhoneNormalizer.normalize(to);
        const { data: newClient, error: clientErr } = await supabase
          .from('clients')
          .upsert(
            { tenant_id: tenantId, phone: phoneDisplay, phone_normalized: PhoneNormalizer.canonical(to), name: phoneDisplay },
            { onConflict: 'tenant_id,phone_normalized', ignoreDuplicates: false }
          )
          .select('id').single();
        if (clientErr || !newClient) {
          console.error('[Send] Erro ao criar cliente:', clientErr);
          return NextResponse.json({ error: 'Erro ao criar contato' }, { status: 500 });
        }
        clientId = newClient.id;
        console.log(`[Send] clientId novo: ${clientId}`);
      }
    }

    // Buscar ou criar conversa
    // IMPORTANTE: usar order + limit 1 igual ao GET /api/messages/[clientId]
    // para garantir que salvamos na MESMA conversa que o front-end está exibindo.
    // .single() falha quando há múltiplas conversas (retorna erro 406).
    let conversationId: string;
    const { data: existingConvs } = await supabase
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .eq('channel', 'whatsapp')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1);

    const existingConv = existingConvs?.[0] ?? null;

    if (existingConv) {
      conversationId = existingConv.id;
    } else {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          tenant_id: tenantId,
          client_id: clientId,
          channel: 'whatsapp',
          status: 'open',
        })
        .select('id')
        .single();

      if (!newConv) {
        throw new Error('Erro ao criar conversa');
      }

      conversationId = newConv.id;
    }

    // Salvar mensagem enviada.
    // Estratégia: INSERT direto. Se o webhook chegou antes (erro 23505 = duplicata),
    // buscar a linha existente pelo external_id. Evita dependência de named constraint
    // (o índice parcial WHERE external_id IS NOT NULL não funciona com onConflict no PostgREST).
    const msgPayload = {
      tenant_id: tenantId,
      conversation_id: conversationId,
      client_id: clientId,
      external_id: messageId,   // ← ID da Evolution API = chave de dedup
      direction: 'outbound' as const,
      sender_name: 'Atendente',
      sender_phone: null,
      content,
      type,
      media_url: mediaUrl || null,
      status: 'sent',
      created_at: new Date().toISOString(),
    };

    let { data: savedMessage, error: msgError } = await supabase
      .from('messages')
      .insert(msgPayload)
      .select()
      .single();

    if (msgError) {
      if (msgError.code === '23505') {
        // Duplicata: webhook chegou antes → buscar linha existente
        console.log(`[Send] Duplicata (23505) — buscando por external_id: ${messageId}`);
        const { data: fetched } = await supabase
          .from('messages')
          .select()
          .eq('tenant_id', tenantId)
          .eq('external_id', messageId)
          .single();
        if (fetched) savedMessage = fetched;
      } else {
        // Logar erro completo para diagnóstico
        console.error(`[Send] ERRO INSERT mensagem — code: ${msgError.code} | message: ${msgError.message} | details: ${msgError.details} | hint: ${msgError.hint}`);
        console.error(`[Send] Payload que falhou:`, JSON.stringify(msgPayload));
      }
    }

    // Fallback: INSERT retornou null sem erro (caso raro no Supabase)
    if (!savedMessage && !msgError) {
      const { data: fetched } = await supabase
        .from('messages')
        .select()
        .eq('tenant_id', tenantId)
        .eq('external_id', messageId)
        .single();
      if (fetched) {
        savedMessage = fetched;
        console.log(`[Send] INSERT retornou null — recuperado por external_id: ${messageId}`);
      }
    }

    // Se ainda não tem mensagem salva, a Evolution API enviou mas o banco falhou
    // Retornar erro explícito para o front-end tratar (não sumir silenciosamente)
    if (!savedMessage) {
      console.error(`[Send] Mensagem enviada pela Evolution mas NÃO salva no banco. messageId=${messageId}, tenantId=${tenantId}, conversationId=${conversationId}`);
      return NextResponse.json({
        success: true,        // whatsapp enviou
        message: null,
        messageId,
        warning: 'Mensagem enviada mas não registrada no histórico. Recarregue a conversa.',
      });
    }

    // Atualizar last_message na conversa (para reordenação na lista de chats)
    console.log(`[Send] ✅ Mensagem salva — id: ${savedMessage.id} | external_id: ${savedMessage.external_id} | conv: ${conversationId} | client: ${clientId}`);
    await supabase
      .from('conversations')
      .update({
        last_message_at: savedMessage.created_at,
        last_message_text: content?.substring(0, 120) || '',
        last_message_from_me: true,
        status: 'open',
      })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId);

    // Traduzir para o formato Message do TypeScript — igual ao GET /api/messages/[clientId]
    // Garante que o front-end (onSuccess) recebe from_me, timestamp, message_id corretos
    const translatedMessage = {
      id: savedMessage.id,
      tenant_id: savedMessage.tenant_id,
      client_id: savedMessage.client_id || clientId,
      remote_jid: savedMessage.sender_phone
        ? `${savedMessage.sender_phone}@s.whatsapp.net`
        : '',
      message_id: savedMessage.external_id || savedMessage.id,
      from_me: true,   // sempre outbound no send
      content: savedMessage.content || '',
      type: savedMessage.type,
      media_url: savedMessage.media_url || undefined,
      media_type: savedMessage.media_mime_type || undefined,
      media_size: savedMessage.media_size || undefined,
      timestamp: savedMessage.created_at,
      status: savedMessage.status,
      metadata: savedMessage.metadata || {},
      created_at: savedMessage.created_at,
    };

    return NextResponse.json({
      success: true,
      message: translatedMessage,
      messageId,
    });

  } catch (error: any) {
    console.error('[Send] Erro:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao enviar mensagem' },
      { status: 500 }
    );
  }
}

