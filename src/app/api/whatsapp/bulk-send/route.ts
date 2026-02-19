import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { sendTextMessage, getTenantEvolutionConfig } from '@/lib/services/evolution.service';
import { PhoneNormalizer } from '@/lib/phone-normalizer';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * POST /api/whatsapp/bulk-send
 *
 * Envia mensagens em massa via WhatsApp de forma interna, sem abrir links externos.
 * Suporta template com variáveis {nome} e {link}.
 *
 * Body:
 * {
 *   recipients: Array<{ id: string; name: string; phone: string }>;
 *   message: string;   // Template com {nome} e {link}
 *   link?: string;     // URL opcional para substituir {link}
 *   delay_ms?: number; // Delay entre envios (padrão: 1500ms)
 * }
 */
export async function POST(request: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(request);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const body = await request.json();
  const {
    recipients,
    message,
    link = '',
    delay_ms = 1500,
  } = body as {
    recipients: Array<{ id: string; name: string; phone: string }>;
    message: string;
    link?: string;
    delay_ms?: number;
  };

  if (!recipients?.length || !message) {
    return NextResponse.json(
      { error: 'Campos obrigatórios: recipients, message' },
      { status: 400 }
    );
  }

  if (recipients.length > 500) {
    return NextResponse.json(
      { error: 'Máximo de 500 destinatários por disparo' },
      { status: 400 }
    );
  }

  const config = getTenantEvolutionConfig(tenantId);
  const supabase = createServerSupabaseClient();

  const results = {
    sent: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const recipient of recipients) {
    try {
      const personalizedMsg = message
        .replace(/\{nome\}/gi, recipient.name || 'Cliente')
        .replace(/\{link\}/gi, link || '');

      const phoneNormalized = PhoneNormalizer.canonical(recipient.phone);
      const messageId = await sendTextMessage(config, phoneNormalized, personalizedMsg);

      // Registrar no banco
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('phone_normalized', phoneNormalized)
        .single();

      if (client) {
        // Buscar ou criar conversa
        const { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('client_id', client.id)
          .eq('channel', 'whatsapp')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        const convId = conv?.id;
        if (convId) {
          await supabase.from('messages').insert({
            tenant_id: tenantId,
            conversation_id: convId,
            client_id: client.id,
            external_id: messageId,
            direction: 'outbound',
            sender_name: 'Campanha',
            content: personalizedMsg,
            type: 'text',
            status: 'sent',
            created_at: new Date().toISOString(),
          });
        }
      }

      results.sent++;
    } catch (err) {
      results.failed++;
      results.errors.push(
        `${recipient.name} (${recipient.phone}): ${err instanceof Error ? err.message : 'Erro'}`
      );
    }

    // Delay anti-spam entre envios
    if (delay_ms > 0) {
      await new Promise((r) => setTimeout(r, delay_ms));
    }
  }

  return NextResponse.json({
    success: true,
    results,
    total: recipients.length,
  });
}
