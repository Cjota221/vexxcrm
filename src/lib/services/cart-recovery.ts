/**
 * cart-recovery.ts
 *
 * Serviço de recuperação de carrinhos abandonados da Anne.
 *
 * Fluxo:
 *  1. Quando um cliente entra em EM_NEGOCIACAO (via pipeline-triggers),
 *     `scheduleCartRecovery()` é chamado para criar uma entrada na
 *     `anne_recovery_queue` com due_at = now + delay_minutes.
 *
 *  2. O job periódico `processCartRecoveryQueue()` é chamado pelo
 *     endpoint GET /api/v2/anne/recovery-queue/process (chamado via
 *     cron/Netlify Scheduled Functions ou pelo próprio Next.js route).
 *
 *  3. Para cada entrada vencida:
 *     - Se o cliente JÁ está em coluna >= PAGO → marca como 'converted', remove.
 *     - Se send_mode = 'auto'    → dispara mensagem via FacilZap API.
 *     - Se send_mode = 'suggest' → emite SSE 'anne_suggestion' para o front.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { eventBus } from '@/lib/event-bus';

export interface RecoveryQueueItem {
  id: string;
  tenant_id: string;
  client_id: string;
  chat_id: string;
  due_at: string;
  message_preview: string;
  send_mode: 'auto' | 'suggest';
  status: string;
}

/**
 * Interpola variáveis no template de mensagem.
 * Suporta: {{nome}}, {{produto}}, {{loja}}, {{codigo_rastreio}}
 */
export function interpolateTemplate(
  template: string,
  vars: Record<string, string | null | undefined>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return vars[key] ?? vars[key.toLowerCase()] ?? '';
  });
}

/**
 * Agenda uma recuperação de carrinho para um cliente que entrou em EM_NEGOCIACAO.
 * Idempotente — não duplica se já houver uma entrada 'pending' para o cliente.
 */
export async function scheduleCartRecovery(
  supabase: SupabaseClient,
  tenantId: string,
  clientId: string,
  chatId: string,
  clientName: string
): Promise<void> {
  // Buscar configuração da automação 'cart_recovery'
  const { data: automation } = await supabase
    .from('anne_automations')
    .select('id, enabled, delay_minutes, send_mode, message_template')
    .eq('tenant_id', tenantId)
    .eq('rule_key', 'cart_recovery')
    .single();

  if (!automation?.enabled) return; // Automação desativada

  const delayMs = (automation.delay_minutes ?? 120) * 60 * 1000;
  const dueAt = new Date(Date.now() + delayMs).toISOString();

  const messagePreview = interpolateTemplate(
    automation.message_template ?? 'Oi {{nome}}! Suas peças ainda estão no carrinho 🛒',
    { nome: clientName }
  );

  // Upsert — se já existe pending para este cliente, atualizar due_at
  const { error } = await supabase
    .from('anne_recovery_queue')
    .upsert(
      {
        tenant_id: tenantId,
        client_id: clientId,
        chat_id: chatId,
        automation_id: automation.id,
        status: 'pending',
        due_at: dueAt,
        message_preview: messagePreview,
        send_mode: automation.send_mode ?? 'suggest',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,client_id,status' }
    );

  if (error) {
    console.warn('[CartRecovery] Erro ao agendar recuperação:', error.message);
  } else {
    console.log(`[CartRecovery] ⏳ Agendado para ${dueAt} — cliente: ${clientId}`);
  }
}

/**
 * Cancela a recuperação pendente de um cliente (ex: quando ele pagou).
 * Chamado pelo pipeline-triggers ao mover para PAGO/DESPACHADO/CONCLUIDO.
 */
export async function cancelCartRecovery(
  supabase: SupabaseClient,
  tenantId: string,
  clientId: string,
  reason: 'converted' | 'cancelled' = 'converted'
): Promise<void> {
  await supabase
    .from('anne_recovery_queue')
    .update({
      status: reason,
      converted_at: reason === 'converted' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)
    .eq('status', 'pending');
}

/**
 * Processa a fila de recuperação de carrinhos vencidos.
 * Chamado pelo endpoint /api/v2/anne/recovery-queue/process (cron).
 *
 * @returns Quantidade de carrinhos processados
 */
export async function processCartRecoveryQueue(
  supabase: SupabaseClient
): Promise<{ processed: number; suggested: number; sent: number; converted: number }> {
  const stats = { processed: 0, suggested: 0, sent: 0, converted: 0 };
  const now = new Date().toISOString();

  // Buscar todas as entradas vencidas
  const { data: items } = await supabase
    .from('anne_recovery_queue')
    .select(`
      id, tenant_id, client_id, chat_id,
      due_at, message_preview, send_mode, status,
      clients!inner(name)
    `)
    .eq('status', 'pending')
    .lte('due_at', now)
    .limit(50); // Processar em lotes

  if (!items?.length) return stats;

  for (const item of items) {
    stats.processed++;

    // Verificar se o cliente já está em coluna avançada (pagou)
    const { data: card } = await supabase
      .from('kanban_cards')
      .select('coluna')
      .eq('tenant_id', item.tenant_id)
      .eq('client_id', item.client_id)
      .single();

    const ADVANCED = ['PAGO', 'DESPACHADO', 'CONCLUIDO'];
    if (card && ADVANCED.includes(card.coluna)) {
      // Cliente já converteu — marcar como converted
      await supabase
        .from('anne_recovery_queue')
        .update({ status: 'converted', converted_at: now, updated_at: now })
        .eq('id', item.id);
      stats.converted++;
      console.log(`[CartRecovery] ✅ Já converteu — ${item.client_id}`);
      continue;
    }

    if (item.send_mode === 'auto') {
      // TODO: Integrar com FacilZap API para envio real
      // Por ora, emitir SSE e marcar como 'sent'
      eventBus.emitToTenant('anne_recovery_sent', item.tenant_id, {
        client_id: item.client_id,
        chat_id: item.chat_id,
        message: item.message_preview,
        mode: 'auto',
        queue_id: item.id,
      });

      await supabase
        .from('anne_recovery_queue')
        .update({ status: 'sent', sent_at: now, updated_at: now })
        .eq('id', item.id);
      stats.sent++;
    } else {
      // suggest — emitir como sugestão pendente de aprovação humana
      eventBus.emitToTenant('anne_suggestion', item.tenant_id, {
        type: 'cart_recovery',
        client_id: item.client_id,
        chat_id: item.chat_id,
        message: item.message_preview,
        queue_id: item.id,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });

      await supabase
        .from('anne_recovery_queue')
        .update({ status: 'suggested', updated_at: now })
        .eq('id', item.id);
      stats.suggested++;
    }

    console.log(
      `[CartRecovery] ${item.send_mode === 'auto' ? '🚀 Enviado' : '💡 Sugerido'} — cliente: ${item.client_id}`
    );
  }

  return stats;
}
