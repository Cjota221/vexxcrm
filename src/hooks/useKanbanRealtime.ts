'use client';

/**
 * useKanbanRealtime — Supabase Realtime para o Kanban
 *
 * Assina a tabela `kanban_cards` e invalida o cache React Query
 * automaticamente quando um card é INSERT/UPDATE/DELETE.
 *
 * Uso:
 *   useKanbanRealtime(tenantId);
 *
 * Basta chamar este hook no componente KanbanBoard para que
 * qualquer movimentação feita pela Anne ou pelo webhook FacilZap
 * apareça em tempo real sem polling.
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseKanbanRealtimeOptions {
  /** Quando false, não assina o canal (ex: aba escondida) */
  enabled?: boolean;
}

export function useKanbanRealtime(
  tenantId: string | null | undefined,
  options: UseKanbanRealtimeOptions = {}
) {
  const { enabled = true } = options;
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!tenantId || !enabled) return;

    // Evita assinar duas vezes se o tenantId não mudou
    if (channelRef.current) return;

    const channel = supabase
      .channel(`kanban_realtime_${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',           // INSERT | UPDATE | DELETE
          schema: 'public',
          table: 'kanban_cards',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          console.debug('[Kanban Realtime]', payload.eventType, payload.new ?? payload.old);

          // Invalida a lista completa do kanban
          queryClient.invalidateQueries({ queryKey: ['kanban-cards'] });

          // Se tiver o client_id no payload, invalida também o card individual
          const record = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (record && typeof record.contato_id === 'string') {
            queryClient.invalidateQueries({ queryKey: ['kanban-pipeline', record.contato_id] });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info(`[Kanban Realtime] ✅ Conectado — tenant: ${tenantId}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('[Kanban Realtime] ⚠️ Erro no canal — tentando reconectar...');
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        console.info('[Kanban Realtime] 🔌 Canal removido');
      }
    };
  }, [tenantId, enabled, queryClient]);
}
