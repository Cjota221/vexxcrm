'use client';

/**
 * AutomationLogPanel.tsx
 *
 * Painel de auditoria em tempo real das automações executadas pela Anne.
 * Mostra cada movimento de kanban, extração de tracking e captura de nome.
 */

import { useQuery } from '@tanstack/react-query';
import {
  Bot,
  Package,
  CreditCard,
  Truck,
  Ban,
  RotateCcw,
  ShoppingCart,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Minus,
  Zap,
} from 'lucide-react';

/* ── Helper de tempo relativo ──────────────────────────── */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'agora mesmo';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

/* ── Tipos ─────────────────────────────────────────────── */

interface AutomationLogEntry {
  id: string;
  client_id: string | null;
  chat_id: string | null;
  trigger_type: string;
  source: 'whatsapp' | 'facilzap' | 'manual';
  action_taken: string;
  de_coluna: string | null;
  para_coluna: string | null;
  order_number: string | null;
  tracking_code: string | null;
  success: boolean;
  error_msg: string | null;
  event_data: Record<string, unknown>;
  created_at: string;
  clients: {
    id: string;
    name: string | null;
    phone: string | null;
  } | null;
}

export interface AutomationLogPanelProps {
  clientId?: string;
  limit?: number;
  compact?: boolean;
}

/* ── Constantes de display ──────────────────────────────── */

const TRIGGER_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  pedido_recebido:    { label: 'Pedido Recebido',      icon: <Package size={14} />,       color: 'text-blue-500' },
  pagamento_aprovado: { label: 'Pagamento Aprovado',    icon: <CreditCard size={14} />,    color: 'text-emerald-500' },
  primeiro_contato:   { label: 'Carrinho Abandonado',   icon: <ShoppingCart size={14} />,  color: 'text-amber-500' },
  sinal_rejeicao:     { label: 'Cancelamento/Rejeição', icon: <Ban size={14} />,           color: 'text-red-500' },
  reativacao:         { label: 'Reativação',            icon: <RotateCcw size={14} />,     color: 'text-purple-500' },
};

const COLUMN_LABELS: Record<string, string> = {
  PRIMEIRO_CONTATO:     'Primeiro Contato',
  EM_NEGOCIACAO:        'Em Negociação',
  AGUARDANDO_PAGAMENTO: 'Aguard. Pagamento',
  PAGO:                 'Pago',
  DESPACHADO:           'Despachado',
  CONCLUIDO:            'Concluído',
  REATIVAR:             'Reativar',
  CANCELADO:            'Cancelado',
};

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  whatsapp: { label: 'WhatsApp', cls: 'bg-emerald-100 text-emerald-700' },
  facilzap: { label: 'FacilZap', cls: 'bg-blue-100 text-blue-700' },
  manual:   { label: 'Manual',   cls: 'bg-gray-100 text-gray-600' },
};

function getTriggerMeta(triggerType: string) {
  return TRIGGER_META[triggerType] ?? {
    label: triggerType,
    icon: <Zap size={14} />,
    color: 'text-gray-400',
  };
}

/* ── Componente principal ───────────────────────────────── */

export function AutomationLogPanel({ clientId, limit = 40, compact = false }: AutomationLogPanelProps) {
  const url = clientId
    ? `/api/v2/automation-logs?limit=${limit}&client_id=${clientId}`
    : `/api/v2/automation-logs?limit=${limit}`;

  const { data, isLoading, isError, refetch, isFetching } = useQuery<{ logs: AutomationLogEntry[] }>({
    queryKey: ['automation-logs', clientId ?? 'all', limit],
    queryFn: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Erro ao carregar logs');
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const logs = data?.logs ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-gray-400">
        <RefreshCw size={16} className="animate-spin mr-2" />
        Carregando automações...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-red-400">
        <XCircle size={16} className="mr-2" />
        Erro ao carregar histórico de automações.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Bot size={16} className="text-crm-primary" />
          Automações da Anne
          {logs.length > 0 && (
            <span className="ml-1 rounded-full bg-crm-primary/10 text-crm-primary text-xs px-2 py-0.5">
              {logs.length}
            </span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors"
          title="Atualizar"
        >
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Lista vazia */}
      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-sm text-gray-400">
          <Bot size={32} className="mb-3 text-gray-200" />
          <p className="font-medium">Nenhuma automação registrada</p>
          <p className="text-xs mt-1 text-gray-300">
            A Anne registrará aqui cada ação automática
          </p>
        </div>
      ) : (
        <div className="overflow-y-auto flex-1">
          {logs.map((log) => {
            const meta = getTriggerMeta(log.trigger_type);
            const sourceBadge = SOURCE_BADGE[log.source] ?? SOURCE_BADGE.manual;
            const clientName = log.clients?.name || log.clients?.phone || '—';
            const isNoop = log.action_taken === 'noop';
            const hasMove = log.de_coluna && log.para_coluna && log.de_coluna !== log.para_coluna;

            return (
              <div
                key={log.id}
                className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50/60 transition-colors ${!log.success ? 'opacity-60' : ''}`}
              >
                {/* Ícone de trigger */}
                <div className={`mt-0.5 shrink-0 ${meta.color}`}>
                  {log.success ? (
                    <div className="p-1.5 rounded-full bg-current/10">
                      {meta.icon}
                    </div>
                  ) : (
                    <div className="p-1.5 rounded-full bg-red-100 text-red-500">
                      <XCircle size={14} />
                    </div>
                  )}
                </div>

                {/* Conteúdo */}
                <div className="flex-1 min-w-0">
                  {/* Linha 1: trigger + cliente + badge de origem */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold ${meta.color}`}>
                      {meta.label}
                    </span>
                    {!compact && (
                      <span className="text-xs text-gray-500 truncate max-w-30">
                        {clientName}
                      </span>
                    )}
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${sourceBadge.cls}`}>
                      {sourceBadge.label}
                    </span>
                  </div>

                  {/* Linha 2: movimentação de coluna */}
                  {hasMove ? (
                    <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
                      <span className="text-gray-400">
                        {COLUMN_LABELS[log.de_coluna!] || log.de_coluna}
                      </span>
                      <ArrowRight size={10} className="text-gray-300 shrink-0" />
                      <span className="font-medium text-gray-600">
                        {COLUMN_LABELS[log.para_coluna!] || log.para_coluna}
                      </span>
                    </div>
                  ) : isNoop ? (
                    <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-400">
                      <Minus size={10} />
                      <span>Sem mudança (card já avançado)</span>
                    </div>
                  ) : null}

                  {/* Linha 3: número do pedido + código de rastreio */}
                  {(log.order_number || log.tracking_code) && (
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                      {log.order_number && (
                        <span className="flex items-center gap-1">
                          <Package size={10} />
                          Pedido #{log.order_number}
                        </span>
                      )}
                      {log.tracking_code && (
                        <span className="flex items-center gap-1">
                          <Truck size={10} />
                          {log.tracking_code}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Mensagem de erro */}
                  {log.error_msg && (
                    <p className="text-xs text-red-400 mt-0.5 truncate" title={log.error_msg}>
                      {log.error_msg}
                    </p>
                  )}
                </div>

                {/* Timestamp + status */}
                <div className="shrink-0 text-right">
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">
                    {timeAgo(log.created_at)}
                  </span>
                  <div className="flex justify-end mt-0.5">
                    {log.success
                      ? <CheckCircle2 size={11} className="text-emerald-400" />
                      : <XCircle size={11} className="text-red-400" />
                    }
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
