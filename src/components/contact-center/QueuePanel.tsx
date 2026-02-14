'use client';

import { useState } from 'react';
import {
  Users,
  ArrowDownToLine,
  ChevronDown,
  ChevronRight,
  Circle,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQueues, useAgentStats, usePullConversation } from '@/hooks/useContactCenter';

/**
 * Painel de Filas e Status do Agente.
 * Mostra filas disponíveis com contadores e permite puxar próxima conversa.
 */
export function QueuePanel() {
  const { data: queues = [], isLoading: queuesLoading } = useQueues();
  const { data: agentStats } = useAgentStats();
  const pullMutation = usePullConversation();
  const [expanded, setExpanded] = useState(true);

  const canPull = agentStats
    ? agentStats.accepting_chats && agentStats.active_chats < agentStats.max_chats
    : false;

  const totalWaiting = queues.reduce((sum, q) => sum + (q.total_waiting || 0), 0);

  return (
    <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
      {/* Agent status header */}
      <div className="px-4 py-3 border-b border-surface-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {agentStats?.is_online ? (
            <Wifi size={14} className="text-emerald-500" />
          ) : (
            <WifiOff size={14} className="text-gray-400" />
          )}
          <span className="text-xs font-medium text-txt-primary">
            {agentStats?.active_chats || 0}/{agentStats?.max_chats || 5} chats
          </span>
          <span className="text-xs text-txt-muted">
            · {agentStats?.closed_today || 0} finalizados hoje
          </span>
        </div>

        {/* Pull next button */}
        <button
          onClick={() => pullMutation.mutate()}
          disabled={!canPull || pullMutation.isPending}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
            canPull
              ? 'bg-crm-primary text-white hover:bg-crm-primary/90'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          )}
        >
          <ArrowDownToLine size={13} />
          {pullMutation.isPending ? 'Puxando...' : 'Puxar próxima'}
        </button>
      </div>

      {/* Queues section */}
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Users size={14} className="text-txt-secondary" />
            <span className="text-xs font-semibold text-txt-primary">
              Filas
            </span>
            {totalWaiting > 0 && (
              <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full text-[10px] font-bold">
                {totalWaiting}
              </span>
            )}
          </div>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {expanded && (
          <div className="px-3 pb-3 space-y-1">
            {queuesLoading ? (
              <div className="space-y-2 px-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 bg-gray-50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : queues.length === 0 ? (
              <p className="text-xs text-txt-muted px-1 py-2">
                Nenhuma fila configurada
              </p>
            ) : (
              queues.map((queue) => (
                <div
                  key={queue.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Circle
                      size={8}
                      className={cn(
                        'fill-current',
                        queue.accepting_new ? 'text-emerald-500' : 'text-gray-300'
                      )}
                    />
                    <span className="text-xs text-txt-primary">{queue.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(queue.total_waiting || 0) > 0 && (
                      <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-semibold">
                        {queue.total_waiting}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
