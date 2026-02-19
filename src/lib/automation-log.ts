/**
 * automation-log.ts
 *
 * Helper para inserir registros de auditoria na tabela automation_logs.
 * Toda automação executada pela Anne (pipeline, tracking, nome) é registrada aqui.
 *
 * Uso:
 *   await logAutomation(supabase, {
 *     tenantId, clientId, chatId,
 *     triggerType: 'pagamento_aprovado',
 *     source: 'whatsapp',
 *     deColuna: 'AGUARDANDO_PAGAMENTO',
 *     paraColuna: 'PAGO',
 *     orderNumber: '5260270',
 *     trackingCode: null,
 *     actionTaken: 'move_kanban',
 *     success: true,
 *     eventData: { text: 'O pagamento foi aprovado...' },
 *   });
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type AutomationSource = 'whatsapp' | 'facilzap' | 'manual';
export type AutomationAction = 'move_kanban' | 'update_tracking' | 'update_name' | 'noop';

export interface LogAutomationParams {
  tenantId: string;
  clientId?: string | null;
  chatId?: string | null;
  triggerType: string;
  source: AutomationSource;
  actionTaken: AutomationAction;
  deColuna?: string | null;
  paraColuna?: string | null;
  orderNumber?: string | null;
  trackingCode?: string | null;
  success: boolean;
  errorMsg?: string | null;
  eventData?: Record<string, unknown>;
}

/**
 * Insere um registro de automação na tabela automation_logs.
 * Fire-and-forget seguro — nunca lança exceção para o caller.
 */
export async function logAutomation(
  supabase: SupabaseClient,
  params: LogAutomationParams
): Promise<void> {
  try {
    const { error } = await supabase.from('automation_logs').insert({
      tenant_id: params.tenantId,
      client_id: params.clientId ?? null,
      chat_id: params.chatId ?? null,
      trigger_type: params.triggerType,
      source: params.source,
      action_taken: params.actionTaken,
      de_coluna: params.deColuna ?? null,
      para_coluna: params.paraColuna ?? null,
      order_number: params.orderNumber ?? null,
      tracking_code: params.trackingCode ?? null,
      success: params.success,
      error_msg: params.errorMsg ?? null,
      event_data: params.eventData ?? {},
      created_at: new Date().toISOString(),
    });

    if (error) {
      // Log silencioso — auditoria não pode derrubar o fluxo principal
      console.warn('[AutomationLog] Erro ao inserir log:', error.message);
    }
  } catch (err) {
    console.warn('[AutomationLog] Exceção ao inserir log:', err);
  }
}
