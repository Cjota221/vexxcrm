import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { sendTextMessage, getTenantEvolutionConfig } from '@/lib/services/evolution.service';
import { PhoneNormalizer } from '@/lib/phone-normalizer';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * POST /api/whatsapp/bulk-send
 *
 * Envia mensagens em massa via WhatsApp com pausas anti-ban:
 * - delay_ms entre cada mensagem (padrão: 15.000ms = 15s)
 * - Pausa de batch_pause_ms a cada batch_size envios (padrão: 60s a cada 10)
 *
 * Body:
 * {
 *   recipients: Array<{ id: string; name: string; phone: string }>;
 *   message: string;          // Template com {nome} e {link}
 *   link?: string;            // URL opcional para substituir {link}
 *   delay_ms?: number;        // Delay entre envios (padrão: 15000ms)
 *   batch_size?: number;      // Qtd de msgs antes da pausa longa (padrão: 10)
 *   batch_pause_ms?: number;  // Pausa entre lotes (padrão: 60000ms = 1 min)
 * }
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    delay_ms = 15000,
    batch_size = 10,
    batch_pause_ms = 60000,
  } = body as {
    recipients: Array<{ id: string; name: string; phone: string }>;
    message: string;
    link?: string;
    delay_ms?: number;
    batch_size?: number;
    batch_pause_ms?: number;
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

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];

    try {
      const personalizedMsg = message
        .replace(/\{nome\}/gi, recipient.name || 'Cliente')
        .replace(/\{link\}/gi, link || '');

      const phoneNormalized = PhoneNormalizer.normalize(recipient.phone);
      const messageId = await sendTextMessage(config, phoneNormalized, personalizedMsg);

      // Registrar no banco
      const phoneCanonical = PhoneNormalizer.canonical(recipient.phone);
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('phone_normalized', phoneCanonical)
        .single();

      if (client) {
        // Buscar conversa existente
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

    const isLastRecipient = i === recipients.length - 1;
    if (!isLastRecipient) {
      const sentSoFar = i + 1;
      // A cada batch_size envios, aplica pausa longa antes de continuar
      if (sentSoFar % batch_size === 0) {
        await sleep(batch_pause_ms);
      } else {
        // Pausa curta anti-spam entre cada mensagem
        await sleep(delay_ms);
      }
    }
  }

  return NextResponse.json({
    success: true,
    results,
    total: recipients.length,
  });
}
