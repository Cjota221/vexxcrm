'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useConnectionStore } from '@/store/connection';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { Message } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Hook para gerenciar conexão WhatsApp.
 */
export function useWhatsAppConnection() {
  const queryClient = useQueryClient();
  const { 
    whatsappStatus, 
    qrCode, 
    setWhatsAppStatus, 
    setQRCode, 
    setInstanceName 
  } = useConnectionStore();

  // Query: Verificar status da conexão
  const statusQuery = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: async () => {
      const response = await api.get<{
        status: 'open' | 'close' | 'connecting';
        instanceName?: string;
        message?: string;
      }>('/api/whatsapp/status');
      
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    refetchInterval: 10000, // Revalidar a cada 10 segundos
  });

  // Atualizar store quando status mudar
  useEffect(() => {
    if (statusQuery.data) {
      const statusMap = {
        'open': 'connected' as const,
        'close': 'disconnected' as const,
        'connecting': 'connecting' as const,
      };
      setWhatsAppStatus(statusMap[statusQuery.data.status] || 'unknown');
      if (statusQuery.data.instanceName) {
        setInstanceName(statusQuery.data.instanceName);
      }
    }
  }, [statusQuery.data, setWhatsAppStatus, setInstanceName]);

  // Mutation: Conectar WhatsApp (gerar QR Code)
  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<{
        qrCode?: string;
        status: string;
        instanceName?: string;
        message?: string;
      }>('/api/whatsapp/connect');
      
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    onSuccess: (data) => {
      if (data.status === 'connecting' && data.qrCode) {
        setQRCode(data.qrCode);
        setWhatsAppStatus('connecting');
      } else if (data.status === 'open') {
        setWhatsAppStatus('connected');
        setQRCode(null);
      }
      
      if (data.instanceName) {
        setInstanceName(data.instanceName);
      }

      // Revalidar status
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
    },
  });

  // Mutation: Desconectar WhatsApp
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await api.delete<{ success: boolean }>('/api/whatsapp/connect');
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    onSuccess: () => {
      setWhatsAppStatus('disconnected');
      setQRCode(null);
      setInstanceName(null);
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
    },
  });

  return {
    status: whatsappStatus,
    qrCode,
    isConnected: whatsappStatus === 'connected',
    isConnecting: whatsappStatus === 'connecting' || connectMutation.isPending,
    isDisconnected: whatsappStatus === 'disconnected',
    connect: connectMutation.mutate,
    disconnect: disconnectMutation.mutate,
    refetch: statusQuery.refetch,
    error: connectMutation.error?.message || disconnectMutation.error?.message,
  };
}

/**
 * Hook para buscar mensagens com Realtime estabilizado.
 *
 * — 1 subscription por conversa ativa (cleanup rigoroso ao trocar)
 * — Optimistic UI: mensagem aparece <50ms após envio
 * — Ordenação por timestamp garantida
 * — staleTime 0: Realtime mantém fresh sem polling excessivo
 * — fallback polling 8s caso Realtime caia
 */
export function useMessages(clientId: string | null) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ── Fetch de mensagens ────────────────────────────────────────────
  const query = useQuery({
    queryKey: ['messages', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const response = await api.get<{ data: Message[] } | Message[]>(`/api/messages/${clientId}`);
      if (response.error) throw new Error(response.error);
      const raw = response.data as any;
      const fromServer: Message[] = Array.isArray(raw) ? raw : (raw?.data ?? []);

      // Preservar mensagens otimistas pendentes que ainda não chegaram no banco.
      // Isso evita que o refetch de 8s apague mensagens enviadas mas ainda não
      // confirmadas pelo servidor (race condition: envio → banco → refetch).
      const cached = queryClient.getQueryData<Message[]>(['messages', clientId]) ?? [];
      const pendingOptimistics = cached.filter((m) => (m as any)._optimistic === true);

      // Mergear: banco + otimistas que não existem ainda no resultado do banco.
      // Dedup APENAS por id — não por conteúdo (mensagens repetidas são válidas).
      const serverIds = new Set(fromServer.map(m => m.id));
      const orphanOptimistics = pendingOptimistics.filter(
        opt => !serverIds.has(opt.id)
      );

      const merged = [...fromServer, ...orphanOptimistics];
      return merged.sort((a, b) =>
        new Date(a.timestamp ?? a.created_at).getTime() -
        new Date(b.timestamp ?? b.created_at).getTime()
      );
    },
    enabled: !!clientId,
    staleTime: 0,
    refetchInterval: 8_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  // ── Realtime: 1 subscription por conversa, cleanup rigoroso ──────
  useEffect(() => {
    if (!clientId) return;

    // Cancelar subscription anterior ANTES de criar nova
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`chat-messages-${clientId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `client_id=eq.${clientId}` },
        (payload) => {
          const raw = payload.new as Record<string, unknown>;
          // Supabase Realtime entrega o dado cru do banco (direction, external_id, created_at).
          // A API REST traduz para (from_me, message_id, timestamp) — fazemos o mesmo aqui.
          const incoming: Message = {
            id: raw.id as string,
            tenant_id: raw.tenant_id as string,
            client_id: raw.client_id as string,
            remote_jid: raw.sender_phone ? `${raw.sender_phone}@s.whatsapp.net` : '',
            message_id: (raw.external_id as string) || (raw.id as string),
            from_me: raw.direction === 'outbound',
            content: (raw.content as string) || '',
            type: raw.type as Message['type'],
            media_url: raw.media_url as string | undefined,
            media_type: raw.media_mime_type as string | undefined,
            media_size: raw.media_size as number | undefined,
            timestamp: raw.created_at as string,
            status: raw.status as Message['status'],
            metadata: (raw.metadata as Record<string, unknown>) || {},
            created_at: raw.created_at as string,
          };

          queryClient.setQueryData<Message[]>(['messages', clientId], (old = []) => {
            // Dedup: não adicionar se já existe por id ou por correlação optimistic
            const isOptimisticMatch = (m: Message) =>
              (m as any)._optimistic === true &&
              m.from_me === incoming.from_me &&
              m.content === incoming.content &&
              Math.abs(
                new Date(m.created_at).getTime() -
                new Date(incoming.created_at).getTime()
              ) < 30_000;

            const exists = old.some(m => m.id === incoming.id || isOptimisticMatch(m));
            if (exists) {
              // Substituir optimistic pela mensagem real confirmada
              return old
                .map(m => isOptimisticMatch(m) ? { ...incoming, _optimistic: false } : m)
                .sort((a, b) =>
                  new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                );
            }
            return [...old, incoming].sort((a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });
          // Invalidar lista de chats para reordenar
          queryClient.invalidateQueries({ queryKey: ['chats'] });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `client_id=eq.${clientId}` },
        (payload) => {
          // Atualizar status (sent → delivered → read) e media_url
          queryClient.setQueryData<Message[]>(['messages', clientId], (old = []) =>
            old.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m)
          );
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          // Realtime caiu — re-fetch para garantir consistência
          queryClient.invalidateQueries({ queryKey: ['messages', clientId] });
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [clientId, queryClient]);

  return query;
}

/**
 * Hook para enviar mensagens com Optimistic UI completo.
 * — Mensagem aparece na tela <50ms após o clique
 * — Em caso de erro: rollback + marca como 'failed'
 */
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      to: string;
      content: string;
      type?: string;
      mediaUrl?: string;
      caption?: string;
      _clientId?: string;  // correlação optimistic (interno)
      _queryClientId?: string; // UUID do cliente — chave real da query cache
    }) => {
      const { _clientId: _, _queryClientId: __, ...body } = payload;
      const response = await api.post<{
        success: boolean;
        message: Message;
        messageId: string;
      }>('/api/whatsapp/send', body);
      if (response.error) throw new Error(response.error);
      return response.data;
    },

    // OPTIMISTIC: mensagem aparece IMEDIATAMENTE na UI
    onMutate: async (payload) => {
      // _queryClientId é o UUID real do cliente (chave do cache React Query).
      // Se não vier, tenta usar payload.to como fallback (comportamento anterior).
      const queryClientId = payload._queryClientId || payload.to;

      // Cancelar apenas a query desta conversa para não afetar outras
      await queryClient.cancelQueries({ queryKey: ['messages', queryClientId] });

      // Snapshot para rollback preciso
      const previousMessages = queryClient.getQueryData<Message[]>(['messages', queryClientId]);

      const tempId = `opt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const optimistic: Message = {
        id: tempId,
        tenant_id: '',
        client_id: queryClientId,
        remote_jid: '',
        message_id: tempId,
        from_me: true,
        content: payload.content,
        type: (payload.type as any) ?? 'text',
        media_url: payload.mediaUrl,
        timestamp: new Date().toISOString(),
        status: 'pending',
        created_at: new Date().toISOString(),
        _optimistic: true,
        _clientId: tempId,
      } as Message & { _optimistic: boolean; _clientId: string };

      // Inserir apenas na query correta (pela chave real do cliente)
      queryClient.setQueryData<Message[]>(['messages', queryClientId], (old = []) =>
        [...old, optimistic]
      );

      return { previousMessages, tempId, queryClientId };
    },

    onSuccess: (data, _payload, context) => {
      const { tempId, queryClientId } = context ?? {};

      // Promover optimistic → mensagem real.
      // CRÍTICO: substituir o id temporário (opt_xxx) pelo id real do banco.
      // Sem isso, o refetch de 8s retorna a mensagem com id real e o filtro de
      // orphanOptimistics não detecta a duplicata → mensagem some ou duplica.
      queryClient.setQueryData<Message[]>(['messages', queryClientId], (old = []) =>
        old.map(m => {
          if ((m as any)._clientId !== tempId) return m;
          // Se o servidor retornou a mensagem completa, usar ela (com id real do banco)
          if (data?.message?.id) return { ...data.message, _optimistic: false };
          // Fallback: manter otimista mas marcar como 'sent' e limpar flag
          return { ...m, status: 'sent' as const, _optimistic: false };
        })
      );

      // Atualizar lista de chats (reordenar por última mensagem)
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },

    onError: (_error, _payload, context) => {
      const { previousMessages, queryClientId } = context ?? {};

      // Rollback exato para o estado antes do envio
      if (previousMessages !== undefined) {
        queryClient.setQueryData<Message[]>(['messages', queryClientId], previousMessages);
      }

      // Marcar como failed para mostrar botão de retry
      queryClient.setQueryData<Message[]>(['messages', queryClientId], (old = []) =>
        old.map(m =>
          (m as any)._clientId === context?.tempId
            ? { ...m, status: 'failed' as const }
            : m
        )
      );
    },
  });
}
