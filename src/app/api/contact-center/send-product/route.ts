import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';
import { ContactCenterService } from '@/lib/services/contact-center.service';
import { sendTextMessage, getTenantEvolutionConfig } from '@/lib/services/evolution.service';
import { PhoneNormalizer } from '@/lib/phone-normalizer';

/**
 * POST /api/contact-center/send-product
 * Gera mensagem formatada de produto e ENVIA via WhatsApp.
 *
 * Body: { conversation_id: string, product_id: string, include_price?: boolean, include_link?: boolean }
 * Nota: conversation_id aqui é na verdade o client_id (selectedChatId do front-end).
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabaseAuth = createAuthenticatedClient(token);
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
    }

    const tenantId = profile.tenant_id;
    const { conversation_id, product_id, include_price, include_link } = await request.json();

    if (!conversation_id || !product_id) {
      return NextResponse.json(
        { error: 'conversation_id e product_id são obrigatórios' },
        { status: 400 }
      );
    }

    // 1. Buscar site_url do tenant para passar como override (garante que o link seja gerado)
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('config')
      .eq('id', tenantId)
      .single();
    const tenantConfig = (tenantData?.config as Record<string, unknown>) || {};
    const facilzapConf = tenantConfig.facilzap as Record<string, string> | undefined;
    const siteUrlOverride = facilzapConf?.site_url || undefined;

    // 2. Gerar texto formatado do produto
    const service = new ContactCenterService(supabase, tenantId);

    // Buscar nome do cliente para personalizar a saudação
    const { data: clientForName } = await supabase
      .from('clients')
      .select('name')
      .eq('id', conversation_id)
      .eq('tenant_id', tenantId)
      .single();

    const messageText = await service.sendProductToChat(conversation_id, product_id, {
      includePrice: include_price,
      includeLink: include_link,
      clientName: clientForName?.name || undefined,
      siteUrl: siteUrlOverride,
    });

    // 3. Resolver o telefone do cliente (conversation_id = client_id)
    const { data: client } = await supabase
      .from('clients')
      .select('id, phone, phone_normalized')
      .eq('id', conversation_id)
      .eq('tenant_id', tenantId)
      .single();

    if (!client?.phone_normalized && !client?.phone) {
      return NextResponse.json(
        { error: 'Cliente não encontrado ou sem telefone' },
        { status: 404 }
      );
    }

    const phone = PhoneNormalizer.canonical(client.phone_normalized || client.phone);
    const config = getTenantEvolutionConfig(tenantId);

    // 4. Enviar APENAS o texto com link — o WhatsApp gera prévia do produto via og:image
    const messageId = await sendTextMessage(config, phone, messageText);

    // 5. Salvar mensagem no banco
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('client_id', client.id)
      .eq('channel', 'whatsapp')
      .single();

    if (conv) {
      await supabase
        .from('messages')
        .insert({
          tenant_id: tenantId,
          conversation_id: conv.id,
          client_id: client.id,
          external_id: messageId,
          direction: 'outbound',
          sender_name: 'Atendente',
          content: messageText,
          type: 'text',
          media_url: null,
          status: 'sent',
          created_at: new Date().toISOString(),
        });
    }

    return NextResponse.json({ data: { message: messageText, messageId, sent: true } });
  } catch (error) {
    console.error('❌ POST /api/contact-center/send-product error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Erro interno' },
      { status: 500 }
    );
  }
}
