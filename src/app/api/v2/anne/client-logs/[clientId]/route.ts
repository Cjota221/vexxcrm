import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * GET /api/v2/anne/client-logs/:clientId
 *
 * Retorna o histórico completo de automações da Anne para um cliente específico.
 * Inclui movimentos de kanban, triggers detectados e recovery queue.
 *
 * Query params:
 *   limit → máximo de entradas (padrão: 50)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = profile.tenant_id;
    const { clientId } = await params;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50'));

    // ── 1. Automation logs (movimentos de kanban e triggers) ────────────
    const { data: autoLogs } = await supabase
      .from('automation_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(limit);

    // ── 2. Recovery queue (carrinho recuperado / pendente) ──────────────
    const { data: recoveryItems } = await supabase
      .from('anne_recovery_queue')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(10);

    // ── 3. Montar chain-of-thought para cada log ────────────────────────
    const TRIGGER_LABELS: Record<string, string> = {
      primeiro_contato:   'Detectou saudação inicial',
      pedido_recebido:    'Detectou novo pedido',
      pagamento_aprovado: 'Detectou confirmação de pagamento',
      codigo_rastreio:    'Detectou código de rastreio',
      sinal_rejeicao:     'Detectou sinal de rejeição',
      engajamento_alto:   'Detectou alto engajamento',
      ghosting:           'Detectou inatividade (ghosting)',
      carrinho_abandono:  'Detectou abandono de carrinho',
      saudacao:           'Detectou mensagem de saudação',
    };

    const ACTION_LABELS: Record<string, string> = {
      move_kanban:    'Moveu card no Kanban',
      update_tracking:'Atualizou código de rastreio',
      update_name:    'Atualizou nome do cliente',
      noop:           'Nenhuma ação (condição não satisfeita)',
      cart_recovery:  'Agendou recuperação de carrinho',
    };

    interface AutoLog {
      id: string;
      trigger_type: string;
      source: string;
      action_taken: string;
      de_coluna: string | null;
      para_coluna: string | null;
      order_number: string | null;
      tracking_code: string | null;
      success: boolean;
      error_msg: string | null;
      created_at: string;
      event_data?: Record<string, unknown>;
    }

    const logsWithThought = (autoLogs as AutoLog[] ?? []).map((log) => {
      const thought: string[] = [];

      // Passo 1 — Fonte do evento
      const sourceLabel = log.source === 'whatsapp'
        ? '📱 Mensagem recebida via WhatsApp'
        : log.source === 'facilzap'
          ? '🛒 Webhook do FacilZap'
          : '👤 Ação manual do usuário';
      thought.push(sourceLabel);

      // Passo 2 — O que foi detectado
      const triggerLabel = TRIGGER_LABELS[log.trigger_type] ?? `Gatilho: ${log.trigger_type}`;
      thought.push(`🔍 ${triggerLabel}`);

      // Passo 3 — Movimento de pipeline
      if (log.de_coluna && log.para_coluna) {
        thought.push(`📊 Moveu pipeline: ${log.de_coluna} → ${log.para_coluna}`);
      } else if (log.para_coluna) {
        thought.push(`📊 Card posicionado em: ${log.para_coluna}`);
      }

      // Passo 4 — Dados extraídos
      if (log.order_number) {
        thought.push(`🏷️ Extraiu nº do pedido: ${log.order_number}`);
      }
      if (log.tracking_code) {
        thought.push(`📦 Extraiu rastreio: ${log.tracking_code}`);
      }

      // Passo 5 — Ação executada
      const actionLabel = ACTION_LABELS[log.action_taken] ?? log.action_taken;
      thought.push(`⚡ ${actionLabel}`);

      // Passo 6 — Resultado
      if (log.success) {
        thought.push('✅ Executado com sucesso');
      } else {
        thought.push(`❌ Falhou: ${log.error_msg ?? 'erro desconhecido'}`);
      }

      return {
        id: log.id,
        type: 'automation' as const,
        trigger_type: log.trigger_type,
        source: log.source,
        action_taken: log.action_taken,
        de_coluna: log.de_coluna,
        para_coluna: log.para_coluna,
        order_number: log.order_number,
        tracking_code: log.tracking_code,
        success: log.success,
        error_msg: log.error_msg,
        created_at: log.created_at,
        chain_of_thought: thought,
      };
    });

    // ── 4. Formatar recovery items ──────────────────────────────────────
    interface RecoveryItem {
      id: string;
      status: string;
      message_template: string | null;
      due_at: string | null;
      sent_at: string | null;
      created_at: string;
      metadata?: Record<string, unknown>;
    }

    const recoveryFormatted = (recoveryItems as RecoveryItem[] ?? []).map((item) => ({
      id: item.id,
      type: 'recovery' as const,
      status: item.status,
      message_preview: item.message_template?.substring(0, 120),
      due_at: item.due_at,
      sent_at: item.sent_at,
      created_at: item.created_at,
      chain_of_thought: [
        '🛒 Cliente entrou em EM_NEGOCIACAO sem pedido pago',
        '⏱️ Anne agendou mensagem de recuperação de carrinho',
        item.status === 'converted'
          ? '✅ Cliente converteu antes do envio'
          : item.status === 'sent'
            ? '📤 Mensagem de recuperação enviada'
            : item.status === 'cancelled'
              ? '🚫 Recuperação cancelada'
              : `⏳ Aguardando envio (programado para ${item.due_at ? new Date(item.due_at).toLocaleString('pt-BR') : '?'})`,
      ],
    }));

    // ── 5. Mesclar e ordenar por created_at ────────────────────────────
    const allEntries = [
      ...logsWithThought,
      ...recoveryFormatted,
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({
      entries: allEntries,
      total: allEntries.length,
    });
  } catch (err) {
    console.error('[anne/client-logs] Erro:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
