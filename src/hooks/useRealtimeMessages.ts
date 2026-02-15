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
            // Notificação da Anne (ex: boas-vindas ao conectar)
            const payload = data as { message: string; type: string };
            console.log(`[Anne] ${payload.type}: ${payload.message}`);
            // O componente de notificações pode ouvir este event
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
    };

    eventSource.onmessage = handleEvent;

    eventSource.onerror = () => {
      setSSEStatus('disconnected');
      eventSource.close();

      // Reconectar após 5 segundos
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 5000);
    };
  }, [handleEvent, setSSEStatus]);

  useEffect(() => {
    connect();

    return () => {
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
