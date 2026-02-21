import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import {
  getTenantEvolutionConfig,
  fetchMessages,
} from '@/lib/services/evolution.service';

/**
 * POST /api/whatsapp/load-history
 *
 * Lazy loading de histórico: chamado quando o usuário ABRE uma conversa.
 * Busca mensagens antigas da Evolution API para aquele cliente específico
 * e salva no banco (dedup por external_id).
 *
 * SEGURO: Apenas 1 chat por vez, máx 200 mensagens, não bloqueia o chat.
 * IDEMPOTENTE: Se history_loaded=true, retorna 200 imediatamente sem buscar.
 *
 * Body:
 *   - clientId: UUID do cliente
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const body = await request.json();
    const { clientId } = body;

    if (!clientId) {
      return NextResponse.json({ error: 'clientId obrigatório' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // 1. Buscar conversa do cliente
    const { data: conv } = await supabase
      .from('conversations')
      .select('id, history_loaded')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .eq('channel', 'whatsapp')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (!conv) {
      return NextResponse.json({ loaded: false, reason: 'sem_conversa' });
    }

    // 2. Se já carregou o histórico antes, não buscar de novo
    if (conv.history_loaded) {
      return NextResponse.json({ loaded: false, reason: 'ja_carregado' });
    }

    // 3. Buscar telefone do cliente para montar o JID
    const { data: client } = await supabase
      .from('clients')
      .select('phone_normalized')
      .eq('tenant_id', tenantId)
      .eq('id', clientId)
      .maybeSingle();

    if (!client?.phone_normalized) {
      return NextResponse.json({ loaded: false, reason: 'sem_telefone' });
    }

    const phone = client.phone_normalized.replace(/\D/g, '');
    const jid = `${phone}@s.whatsapp.net`;

    // 4. Marcar como "em progresso" imediatamente — evita chamadas paralelas
    await supabase
      .from('conversations')
      .update({ history_loaded: true })
      .eq('id', conv.id)
      .eq('tenant_id', tenantId);

    // 5. Buscar mensagens na Evolution API (paginado, máx 200)
    const config = getTenantEvolutionConfig(tenantId);
    let page = 1;
    let totalInserted = 0;
    const MAX_MESSAGES = 200;
    const PAGE_SIZE = 100;

    while (totalInserted < MAX_MESSAGES) {
      let batch: { total: number; pages: number; records: Awaited<ReturnType<typeof fetchMessages>>['records'] };
      try {
        batch = await fetchMessages(config, jid, page, PAGE_SIZE);
      } catch {
        break; // Evolution API indisponível — ok, histórico parcial
      }

      if (!batch.records || batch.records.length === 0) break;

      // Dedup: verificar quais external_ids já existem no banco
      const extIds = batch.records.map((m) => m.key.id).filter(Boolean);
      const { data: existing } = await supabase
        .from('messages')
        .select('external_id')
        .eq('tenant_id', tenantId)
        .eq('conversation_id', conv.id)
        .in('external_id', extIds);

      const existSet = new Set((existing || []).map((e) => e.external_id));
      const newMsgs = batch.records.filter((m) => m.key.id && !existSet.has(m.key.id));

      if (newMsgs.length > 0) {
        const rows = newMsgs.map((m) => {
          const mc = m.message || {};
          const text =
            (mc.conversation as string) ||
            ((mc.extendedTextMessage as Record<string, unknown>)?.text as string) ||
            ((mc.imageMessage as Record<string, unknown>)?.caption as string) ||
            ((mc.videoMessage as Record<string, unknown>)?.caption as string) ||
            '';

          let type = 'text';
          if (mc.imageMessage) type = 'image';
          else if (mc.videoMessage) type = 'video';
          else if (mc.audioMessage) type = 'audio';
          else if (mc.documentMessage) type = 'document';
          else if (mc.stickerMessage) type = 'sticker';

          return {
            tenant_id: tenantId,
            conversation_id: conv.id,
            client_id: clientId,
            external_id: m.key.id,
            direction: m.key.fromMe ? 'outbound' : 'inbound',
            sender_name: m.key.fromMe ? 'Atendente' : (m.pushName || phone),
            sender_phone: m.key.fromMe ? null : phone,
            content: text,
            type,
            status: m.key.fromMe ? 'sent' : 'delivered',
            created_at: m.messageTimestamp
              ? new Date(m.messageTimestamp * 1000).toISOString()
              : new Date().toISOString(),
          };
        });

        const { error: insErr } = await supabase.from('messages').insert(rows);
        if (!insErr) totalInserted += rows.length;
      }

      if (page >= batch.pages || batch.pages === 0) break;
      page++;
    }

    console.log(`[LoadHistory] clientId=${clientId} → ${totalInserted} mensagens inseridas`);

    return NextResponse.json({
      loaded: true,
      inserted: totalInserted,
    });
  } catch (err) {
    console.error('[LoadHistory] Erro:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
