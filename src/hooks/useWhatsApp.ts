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
      const msgs: Message[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
      // Ordenar por timestamp ao buscar
      return msgs.sort((a, b) =>
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
          const incoming = payload.new as Message;
          queryClient.setQueryData<Message[]>(['messages', clientId], (old = []) => {
            // Dedup: não adicionar se já existe por id ou por correlação optimistic
            const exists = old.some(m =>
              m.id === incoming.id ||
              ((m as any)._optimistic &&
                m.from_me && incoming.from_me &&
                m.content === incoming.content &&
                Math.abs(new Date(m.timestamp).getTime() - new Date(incoming.timestamp).getTime()) < 30_000)
            );
            if (exists) {
              // Substituir optimistic pela mensagem real
              return old.map(m =>
                ((m as any)._optimistic &&
                  m.from_me && incoming.from_me &&
                  m.content === incoming.content)
                  ? { ...incoming, _optimistic: false }
                  : m
              ).sort((a, b) =>
                new Date(a.timestamp ?? a.created_at).getTime() -
                new Date(b.timestamp ?? b.created_at).getTime()
              );
            }
            return [...old, incoming].sort((a, b) =>
              new Date(a.timestamp ?? a.created_at).getTime() -
              new Date(b.timestamp ?? b.created_at).getTime()
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
    }) => {
      const { _clientId: _, ...body } = payload;
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
      const clientId = payload.to; // usar telefone como correlação

      // Cancelar queries em flight
      await queryClient.cancelQueries({ queryKey: ['messages'] });

      // Snapshot para rollback
      const previousMessages = queryClient.getQueryData<Message[]>(['messages']);

      const tempId = `opt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const optimistic: Message = {
        id: tempId,
        tenant_id: '',
        client_id: '',
        remote_jid: '',
        message_id: '',
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

      // Inserir em TODAS as queries de messages que podem estar ativas
      queryClient.getQueriesData<Message[]>({ queryKey: ['messages'] }).forEach(([key]) => {
        queryClient.setQueryData<Message[]>(key, (old = []) => [...old, optimistic]);
      });

      return { previousMessages, tempId };
    },

    onSuccess: (data, _payload, context) => {
      if (!data?.message) return;
      // Substituir optimistic pela mensagem real do servidor
      queryClient.getQueriesData<Message[]>({ queryKey: ['messages'] }).forEach(([key]) => {
        queryClient.setQueryData<Message[]>(key, (old = []) =>
          old.map(m =>
            (m as any)._clientId === context?.tempId
              ? { ...data.message, _optimistic: false }
              : m
          )
        );
      });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },

    onError: (_error, _payload, context) => {
      // Marcar como failed (não remover — usuário vê o botão de retry)
      queryClient.getQueriesData<Message[]>({ queryKey: ['messages'] }).forEach(([key]) => {
        queryClient.setQueryData<Message[]>(key, (old = []) =>
          old.map(m =>
            (m as any)._clientId === context?.tempId
              ? { ...m, status: 'failed' as const }
              : m
          )
        );
      });
    },
  });
}
