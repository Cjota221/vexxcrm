import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest, getTenantConfig } from '@/lib/auth-helpers';
import { sendTextMessage, sendMediaMessage } from '@/lib/services/evolution.service';
import { PhoneNormalizer } from '@/lib/phone-normalizer';
import { createServerSupabaseClient } from '@/lib/supabase';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';

/**
 * POST /api/whatsapp/send
 * 
 * Envia mensagem via WhatsApp (Evolution API).
 * Body: { to: string, content: string, type?: 'text' | 'image' | 'video', mediaUrl?: string }
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

    const tenant = await getTenantConfig(tenantId);

    if (!tenant.evolution_instance || !tenant.evolution_api_url || !tenant.evolution_api_key) {
      return NextResponse.json(
        { error: 'WhatsApp não configurado' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { to, content, type = 'text', mediaUrl, caption } = body;

    if (!to || !content) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: to, content' },
        { status: 400 }
      );
    }

    const config = {
      apiUrl: tenant.evolution_api_url,
      apiKey: tenant.evolution_api_key,
      instanceName: tenant.evolution_instance,
    };

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

    // Buscar ou criar cliente
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('phone_normalized', PhoneNormalizer.canonical(to))
      .single();

    if (!client) {
      return NextResponse.json(
        { error: 'Cliente não encontrado' },
        { status: 404 }
      );
    }

    // Buscar ou criar conversa
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

      if (!newConv) {
        throw new Error('Erro ao criar conversa');
      }

      conversationId = newConv.id;
    }

    // Salvar mensagem enviada
    const { data: savedMessage, error: msgError } = await supabase
      .from('messages')
      .insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        client_id: client.id,
        external_id: messageId,
        direction: 'outbound',
        sender_name: 'Atendente',
        sender_phone: null,
        content,
        type,
        media_url: mediaUrl || null,
        status: 'sent',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (msgError) {
      console.error('[Send] Erro ao salvar mensagem:', msgError);
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

