'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useConnectionStore } from '@/store/connection';
import { useChatsStore } from '@/store/chats';
import type { NewMessageEvent, MessageStatusEvent, TypingIndicatorEvent, ConnectionUpdateEvent } from '@/types';

/**
 * Hook para receber atualizações real-time via SSE.
 *
 * Conecta ao endpoint /api/sse e atualiza React Query cache
 * automaticamente ao receber eventos.
 */
export function useRealtimeMessages() {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isMountedRef = useRef(true);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const { setSSEStatus } = useConnectionStore();
  const { setTyping } = useChatsStore();

  const handleEvent = useCallback(
    (event: MessageEvent) => {
      try {
        const { type, data } = JSON.parse(event.data);

        switch (type) {
          case 'new_message': {
            const payload = data as NewMessageEvent;
            // Invalidar query de mensagens para recarregar
            queryClient.invalidateQueries({
              queryKey: ['messages', payload.client_id],
            });
            // Invalidar lista de chats (reordenar)
            queryClient.invalidateQueries({ queryKey: ['chats'] });
            break;
          }

          case 'message_status': {
            const payload = data as MessageStatusEvent;
            // Atualizar status na cache
            queryClient.invalidateQueries({
              queryKey: ['messages', payload.client_id],
            });
            break;
          }

          case 'typing_indicator': {
            const payload = data as TypingIndicatorEvent;
            setTyping(payload.client_id, payload.is_typing);
            break;
          }

          case 'connection_update': {
            const payload = data as ConnectionUpdateEvent;
            const { setWhatsAppStatus } = useConnectionStore.getState();
            setWhatsAppStatus(
              payload.status === 'open'
                ? 'connected'
                : payload.status === 'connecting'
                  ? 'connecting'
                  : 'disconnected'
            );
            // Invalidar config para refletir novo status
            queryClient.invalidateQueries({ queryKey: ['tenant-config'] });
            queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
            break;
          }

          case 'media_transcription': {
            // IA processou áudio/imagem — recarregar mensagens
            const payload = data as { client_id: string; message_id: string };
            queryClient.invalidateQueries({
              queryKey: ['messages', payload.client_id],
            });
            break;
          }

          case 'anne_notification': {
            // Notificação da Anne (ex: boas-vindas ao conectar, gatilho executado)
            const payload = data as { message: string; type: string; chat_id?: string };
            console.log(`[Anne] ${payload.type}: ${payload.message}`);
            // Propagar para listeners no window (ex: AnneInsightsTab)
            window.dispatchEvent(
              new CustomEvent('sse:anne_notification', { detail: payload })
            );
            break;
          }

          case 'kanban_moved': {
            // Anne moveu um card de pipeline → atualizar KanbanDrawer + BrainSidebar
            const payload = data as {
              client_id: string;
              chat_id: string;
              de_coluna: string | null;
              para_coluna: string;
              motivo: string;
              trigger: string;
              timestamp: string;
            };
            queryClient.invalidateQueries({ queryKey: ['kanban-counts'] });
            queryClient.invalidateQueries({ queryKey: ['kanban-pipeline', payload.client_id] });
            // Propagar como CustomEvent para listeners no window
            window.dispatchEvent(
              new CustomEvent('sse:kanban_moved', { detail: payload })
            );
            break;
          }

          case 'client_updated': {
            // Nome ou dados do cliente foram atualizados automaticamente
            const payload = data as { client_id: string };
            queryClient.invalidateQueries({ queryKey: ['brain-client'] });
            queryClient.invalidateQueries({ queryKey: ['chats'] });
            window.dispatchEvent(
              new CustomEvent('sse:client_updated', { detail: payload })
            );
            break;
          }

          case 'orders_updated': {
            // tracking_code inserido num pedido
            const payload = data as { client_id: string; tracking_code: string };
            queryClient.invalidateQueries({ queryKey: ['brain-client'] });
            window.dispatchEvent(
              new CustomEvent('sse:orders_updated', { detail: payload })
            );
            break;
          }
        }
      } catch {
        // Ignore heartbeats e payloads inválidos
      }
    },
    [queryClient, setTyping]
  );

  const connect = useCallback(async () => {
    // Limpar conexão anterior
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Obter token da sessão para autenticar SSE
    let token = '';
    try {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token || '';
    } catch {
      console.warn('⚠️ SSE: Não foi possível obter token');
    }

    if (!token) {
      console.warn('⚠️ SSE: Sem token, adiando conexão...');
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
      return;
    }

    const eventSource = new EventSource(`/api/sse?token=${encodeURIComponent(token)}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setSSEStatus('connected');
      reconnectAttemptsRef.current = 0; // Reset backoff ao conectar com sucesso
    };

    eventSource.onmessage = handleEvent;

    eventSource.onerror = () => {
      setSSEStatus('disconnected');
      eventSource.close();

      // Backoff exponencial: 1s, 2s, 4s, 8s, 16s, 30s (cap)
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        const baseDelay = Math.min(
          1000 * Math.pow(2, reconnectAttemptsRef.current),
          30_000
        );
        // Jitter ±20% para evitar thundering herd
        const jitter = baseDelay * 0.2 * (Math.random() - 0.5);
        const delay = Math.round(baseDelay + jitter);

        if (process.env.NODE_ENV === 'development') {
          console.debug(`[SSE] retry ${reconnectAttemptsRef.current + 1}/${MAX_RECONNECT_ATTEMPTS} em ${delay}ms`);
        }
        reconnectAttemptsRef.current++;

        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) connect();
        }, delay);
      } else {
        // Esgotou tentativas — aguardar token refresh do Supabase (onAuthStateChange)
        if (process.env.NODE_ENV === 'development') {
          console.debug('[SSE] tentativas esgotadas — aguardando TOKEN_REFRESHED');
        }
        setSSEStatus('disconnected');
      }
    };
  }, [handleEvent, setSSEStatus]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    // Reconectar silenciosamente quando o Supabase renova o JWT
    // Isso evita o loop de 401 → onerror → backoff → 401 → ...
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (!isMountedRef.current) return;
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        reconnectAttemptsRef.current = 0; // reset backoff
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        connect();
      }
    });

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      setSSEStatus('disconnected');
    };
  }, [connect, setSSEStatus]);
}
