import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * GET /api/webhooks/instagram
 *
 * Verificação de webhook pela Meta Graph API.
 * Meta envia: hub.mode=subscribe, hub.verify_token, hub.challenge
 * Responder com hub.challenge se o verify_token bater.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'vexxcrm_instagram';

  if (mode === 'subscribe' && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * POST /api/webhooks/instagram
 *
 * Recebe mensagens do Instagram Direct via Meta Graph API.
 * Roteamento por page_id → tenant (via ai_provider_config.meta_page_id).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Ignorar eventos que não sejam de instagram
    if (body.object !== 'instagram' && body.object !== 'page') {
      return NextResponse.json({ status: 'ignored' });
    }

    const supabase = createServerSupabaseClient();

    for (const entry of body.entry ?? []) {
      const pageId = entry.id as string;

      // Buscar tenant pelo meta_instagram_id (Instagram Business Account ID)
      const { data: config } = await supabase
        .from('ai_provider_config')
        .select('tenant_id')
        .eq('meta_instagram_id', pageId)
        .maybeSingle();

      if (!config?.tenant_id) {
        // Fallback: tentar pelo meta_page_id (caso antigo)
        const { data: fallback } = await supabase
          .from('ai_provider_config')
          .select('tenant_id')
          .eq('meta_page_id', pageId)
          .maybeSingle();

        if (!fallback?.tenant_id) {
          // Último fallback: único tenant com token Meta configurado
          const { data: anyTenant } = await supabase
            .from('ai_provider_config')
            .select('tenant_id')
            .not('meta_access_token', 'is', null)
            .limit(1)
            .maybeSingle();

          if (!anyTenant?.tenant_id) {
            console.warn(`[Instagram Webhook] Instagram ID ${pageId} não encontrado em nenhum tenant`);
            continue;
          }

          const tenantId = anyTenant.tenant_id;
          console.warn(`[Instagram Webhook] Usando fallback tenant ${tenantId} para Instagram ID ${pageId}`);
          for (const event of entry.messaging ?? []) {
            await processInstagramMessage(supabase, tenantId, pageId, event);
          }
          continue;
        }

        const tenantId = fallback.tenant_id;
        for (const event of entry.messaging ?? []) {
          await processInstagramMessage(supabase, tenantId, pageId, event);
        }
        continue;
      }

      const tenantId = config.tenant_id;

      for (const event of entry.messaging ?? []) {
        await processInstagramMessage(supabase, tenantId, pageId, event);
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    console.error('[Instagram Webhook] Erro:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/* ─── Processamento de mensagem ──────────────────────────────────────────── */

async function processInstagramMessage(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  pageId: string,
  event: Record<string, unknown>
) {
  // Ignorar mensagens enviadas pela própria página
  const senderId = (event.sender as { id: string })?.id;
  const recipientId = (event.recipient as { id: string })?.id;

  if (!senderId || senderId === pageId || senderId === recipientId) return;

  const message = event.message as Record<string, unknown> | undefined;
  if (!message) return;

  const messageId = message.mid as string;
  const text = (message.text as string) || '';
  const timestamp = (event.timestamp as number) ?? Date.now();

  // Ignorar echo (mensagens enviadas pela página via API)
  if (message.is_echo) return;

  // ── Upsert cliente ──────────────────────────────────────────────────────
  const igUserId = senderId;
  const { data: client } = await supabase
    .from('clients')
    .upsert(
      {
        tenant_id: tenantId,
        phone: `ig:${igUserId}`,
        phone_normalized: `ig:${igUserId}`,
        name: `Instagram ${igUserId.slice(-6)}`,
        source: 'instagram',
      },
      { onConflict: 'tenant_id,phone_normalized', ignoreDuplicates: false }
    )
    .select('id, name')
    .single();

  if (!client) {
    console.error('[Instagram Webhook] Erro ao upsert cliente');
    return;
  }

  // ── Buscar ou criar conversa Instagram ──────────────────────────────────
  const { data: existingConvs } = await supabase
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('client_id', client.id)
    .eq('canal', 'instagram')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1);

  let conversationId: string;
  const existingConv = existingConvs?.[0] ?? null;

  if (existingConv) {
    conversationId = existingConv.id;
  } else {
    const { data: newConv, error: convError } = await supabase
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        client_id: client.id,
        canal: 'instagram',
        channel: 'instagram',
        status: 'open',
      })
      .select('id')
      .single();

    if (convError || !newConv) {
      console.error('[Instagram Webhook] Erro ao criar conversa:', convError);
      return;
    }

    conversationId = newConv.id;
  }

  // ── Verificar se mensagem já existe (deduplicação) ──────────────────────
  const { data: existing } = await supabase
    .from('messages')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('external_id', messageId)
    .maybeSingle();

  if (existing) return; // já processado

  // ── Inserir mensagem ────────────────────────────────────────────────────
  const msgType = message.attachments ? 'image' : 'text';
  const attachments = message.attachments as Array<{ type: string; payload: { url: string } }> | undefined;
  const mediaUrl = attachments?.[0]?.payload?.url;

  const { error: msgError } = await supabase.from('messages').insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    external_id: messageId,
    direction: 'inbound',
    type: msgType,
    content: text || (mediaUrl ? '📷 Mídia' : ''),
    media_url: mediaUrl || null,
    created_at: new Date(timestamp).toISOString(),
    status: 'delivered',
  });

  if (msgError) {
    console.error('[Instagram Webhook] Erro ao inserir mensagem:', msgError.message);
    return;
  }

  // Trigger do Supabase cuida de unread_count e last_message_* automaticamente.
  // Apenas garantir que a conversa esteja aberta.
  await supabase
    .from('conversations')
    .update({ status: 'open' })
    .eq('id', conversationId)
    .eq('status', 'archived'); // só reabre se estava arquivada

  console.log(`[Instagram Webhook] ✅ Mensagem salva | tenant=${tenantId} | from=${igUserId} | conv=${conversationId}`);
}
