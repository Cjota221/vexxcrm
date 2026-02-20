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
    const { to, content, type = 'text', mediaUrl, caption } = body;

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

    // Salvar mensagem no banco de dados
    const supabase = createServerSupabaseClient();

    // Buscar ou CRIAR cliente (upsert para garantir que existe)
    let clientId: string;
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('phone_normalized', PhoneNormalizer.canonical(to))
      .single();

    if (existingClient) {
      clientId = existingClient.id;
    } else {
      // Criar cliente novo automaticamente
      const phoneDisplay = PhoneNormalizer.normalize(to);
      const { data: newClient, error: clientErr } = await supabase
        .from('clients')
        .upsert(
          {
            tenant_id: tenantId,
            phone: phoneDisplay,
            phone_normalized: PhoneNormalizer.canonical(to),
            name: phoneDisplay, // Nome será atualizado quando responder
          },
          { onConflict: 'tenant_id,phone_normalized', ignoreDuplicates: false }
        )
        .select('id')
        .single();

      if (clientErr || !newClient) {
        console.error('[Send] Erro ao criar cliente:', clientErr);
        return NextResponse.json(
          { error: 'Erro ao criar contato' },
          { status: 500 }
        );
      }
      clientId = newClient.id;
    }

    // Buscar ou criar conversa
    let conversationId: string;
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .eq('channel', 'whatsapp')
      .single();

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

    // Salvar mensagem enviada (upsert por external_id para evitar duplicata com webhook)
    // ignoreDuplicates: false → se webhook chegou primeiro, faz UPDATE e retorna a linha
    const { data: savedMessage, error: msgError } = await supabase
      .from('messages')
      .upsert(
        {
          tenant_id: tenantId,
          conversation_id: conversationId,
          client_id: clientId,
          external_id: messageId,   // ← ID da Evolution API = chave de dedup
          direction: 'outbound',
          from_me: true,
          sender_name: 'Atendente',
          sender_phone: null,
          content,
          type,
          media_url: mediaUrl || null,
          status: 'sent',
          created_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,external_id', ignoreDuplicates: false }
      )
      .select()
      .single();

    if (msgError) {
      console.error('[Send] Erro ao salvar mensagem:', msgError);
    }

    // Atualizar last_message na conversa (para reordenação na lista de chats)
    if (savedMessage) {
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
    }

    return NextResponse.json({
      success: true,
      message: savedMessage,
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

