'use client';

// 
// FIX: Mensagens do chat individual que somem após envio
//
// PROBLEMA RAIZ:
//   1. useSendMessage.onSuccess recebe data.message = null
//      (acontece quando o upsert no banco faz UPDATE ao invés de INSERT)
//   2. Nesse caso, a mensagem otimista fica com _optimistic: false
//   3. O refetchInterval de 8s roda, busca mensagens do banco
//   4. orphanOptimistics só preserva _optimistic === true  mensagem some
//
// SOLUÇÃO:
//   - onSuccess: se data.message é null, manter _optimistic: true até o
//     Realtime confirmar
//   - useMessages: melhorar o merge para não perder mensagens recentes
//     mesmo que _optimistic seja false
// 

import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useConnectionStore } from '@/store/connection';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { Message } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Converte qualquer forma de timestamp para milissegundos.
 * Evolution API envia epoch em SEGUNDOS — precisamos *1000.
 */
function tsMs(v: string | number | null | undefined): number {
  if (!v) return 0;
  const n = typeof v === 'string' ? Number(v) : v;
  if (isNaN(n)) return new Date(v as string).getTime();
  return n < 1e10 ? n * 1000 : n;
}

/** Ordena por timestamp corrigido */
function sortByTs(a: Message, b: Message): number {
  return tsMs(a.timestamp ?? a.created_at) - tsMs(b.timestamp ?? b.created_at);
}

export function useWhatsAppConnection() {
  const queryClient = useQueryClient();
  const { whatsappStatus, qrCode, setWhatsAppStatus, setQRCode, setInstanceName } = useConnectionStore();

  const statusQuery = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: async () => {
      const response = await api.get<{ status: 'open' | 'close' | 'connecting'; instanceName?: string; message?: string; }>('/api/whatsapp/status');
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (statusQuery.data) {
      const statusMap = { 'open': 'connected' as const, 'close': 'disconnected' as const, 'connecting': 'connecting' as const };
      setWhatsAppStatus(statusMap[statusQuery.data.status] || 'unknown');
      if (statusQuery.data.instanceName) setInstanceName(statusQuery.data.instanceName);
    }
  }, [statusQuery.data, setWhatsAppStatus, setInstanceName]);

  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<{ qrCode?: string; status: string; instanceName?: string; message?: string; }>('/api/whatsapp/connect');
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    onSuccess: (data) => {
      if (data.status === 'connecting' && data.qrCode) { setQRCode(data.qrCode); setWhatsAppStatus('connecting'); }
      else if (data.status === 'open') { setWhatsAppStatus('connected'); setQRCode(null); }
      if (data.instanceName) setInstanceName(data.instanceName);
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await api.delete<{ success: boolean }>('/api/whatsapp/connect');
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    onSuccess: () => {
      setWhatsAppStatus('disconnected'); setQRCode(null); setInstanceName(null);
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
    },
  });

  return {
    status: whatsappStatus, qrCode,
    isConnected: whatsappStatus === 'connected',
    isConnecting: whatsappStatus === 'connecting' || connectMutation.isPending,
    isDisconnected: whatsappStatus === 'disconnected',
    connect: connectMutation.mutate, disconnect: disconnectMutation.mutate,
    refetch: statusQuery.refetch,
    error: connectMutation.error?.message || disconnectMutation.error?.message,
  };
}

export function useMessages(clientId: string | null) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  const query = useQuery({
    queryKey: ['messages', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const response = await api.get<{ data: Message[] } | Message[]>(`/api/messages/${clientId}`);
      if (response.error) throw new Error(response.error);
      const raw = response.data as any;
      const fromServer: Message[] = Array.isArray(raw) ? raw : (raw?.data ?? []);

      const cached = queryClient.getQueryData<Message[]>(['messages', clientId]) ?? [];
      const serverIds = new Set(fromServer.map(m => m.id));
      const RECENCY_WINDOW_MS = 30_000;

      // FIX: preservar otimistas (_optimistic:true) E mensagens recentes
      // (_optimistic:false mas enviadas há < 30s e ainda sem id real no banco)
      const pendingMessages = cached.filter((m) => {
        const isOptimistic = (m as any)._optimistic === true;
        const isRecentUnconfirmed =
          (m as any)._optimistic === false &&
          (m as any)._clientId &&
          !serverIds.has(m.id) &&
          (Date.now() - new Date(m.created_at).getTime()) < RECENCY_WINDOW_MS;
        return isOptimistic || isRecentUnconfirmed;
      });

      const orphans = pendingMessages.filter(opt => !serverIds.has(opt.id));
      const merged = [...fromServer, ...orphans];
      return merged.sort(sortByTs);
    },
    enabled: !!clientId,
    staleTime: 10_000,
    // Supabase Realtime entrega mensagens em < 1s — polling a cada 30s é só
    // fallback de segurança caso o WebSocket caia temporariamente.
    // Antes era 5s, o que gerava ~12 requests/min por chat aberto.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  useEffect(() => {
    if (!clientId) return;
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }

    // Tenta filtro por client_id; se CHANNEL_ERROR, recai em sem filtro (RLS cuida)
    const tryChannel = (useFilter: boolean) => {
      const name = useFilter ? `chat-messages-${clientId}` : `chat-messages-nf-${clientId}`;
      const msgFilter = useFilter ? { event: 'INSERT' as const, schema: 'public', table: 'messages', filter: `client_id=eq.${clientId}` } : { event: 'INSERT' as const, schema: 'public', table: 'messages' };
      const updFilter = useFilter ? { event: 'UPDATE' as const, schema: 'public', table: 'messages', filter: `client_id=eq.${clientId}` } : { event: 'UPDATE' as const, schema: 'public', table: 'messages' };

      const ch = supabase
        .channel(name)
        .on('postgres_changes', msgFilter, (payload) => {
          // Ignorar mensagens de outros clientes quando sem filtro
          if (!useFilter && (payload.new as any).client_id !== clientId) return;

          const raw = payload.new as Record<string, unknown>;
          const incoming: Message = {
            id: raw.id as string, tenant_id: raw.tenant_id as string, client_id: raw.client_id as string,
            remote_jid: raw.sender_phone ? `${raw.sender_phone}@s.whatsapp.net` : '',
            message_id: (raw.external_id as string) || (raw.id as string),
            from_me: raw.direction === 'outbound', content: (raw.content as string) || '',
            type: raw.type as Message['type'], media_url: raw.media_url as string | undefined,
            media_type: raw.media_mime_type as string | undefined, media_size: raw.media_size as number | undefined,
            timestamp: raw.created_at as string, status: raw.status as Message['status'],
            metadata: (raw.metadata as Record<string, unknown>) || {}, created_at: raw.created_at as string,
          };

          queryClient.setQueryData<Message[]>(['messages', clientId], (old = []) => {
            const isOptimisticMatch = (m: Message) =>
              ((m as any)._clientId && (m as any)._clientId === (incoming as any)._clientId) ||
              (
                ((m as any)._optimistic === true || (m as any)._clientId) &&
                m.from_me === incoming.from_me &&
                m.content === incoming.content &&
                Math.abs(new Date(m.created_at).getTime() - new Date(incoming.created_at).getTime()) < 30_000
              );

            const exists = old.some(m => m.id === incoming.id || isOptimisticMatch(m));
            if (exists) {
              return old
                .map(m => (m.id === incoming.id || isOptimisticMatch(m)) ? { ...incoming, _optimistic: false } : m)
                .sort(sortByTs);
            }
            return [...old, incoming].sort(sortByTs);
          });
        })
        .on('postgres_changes', updFilter, (payload) => {
          if (!useFilter && (payload.new as any).client_id !== clientId) return;
          queryClient.setQueryData<Message[]>(['messages', clientId], (old = []) =>
            old.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m)
          );
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' && useFilter) {
            // Filtro rejeitado → fallback sem filtro
            console.warn(`[Realtime] chat-messages-${clientId}: filtro rejeitado, usando fallback`);
            supabase.removeChannel(ch);
            channelRef.current = null;
            setTimeout(() => {
              channelRef.current = tryChannel(false);
              queryClient.invalidateQueries({ queryKey: ['messages', clientId] });
            }, 200);
          } else if (status === 'CHANNEL_ERROR') {
            queryClient.invalidateQueries({ queryKey: ['messages', clientId] });
          }
        });

      return ch;
    };

    channelRef.current = tryChannel(true);
    return () => { if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; } };
  }, [clientId, queryClient]);

  return query;
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      to: string; content: string; type?: string; mediaUrl?: string; caption?: string;
      clientId?: string; _clientId?: string; _queryClientId?: string;
    }) => {
      const { _clientId: _, _queryClientId: __, ...body } = payload;
      const response = await api.post<{ success: boolean; message: Message; messageId: string; }>('/api/whatsapp/send', body);
      if (response.error) throw new Error(response.error);
      return response.data;
    },

    onMutate: async (payload) => {
      const queryClientId = payload._queryClientId || payload.to;
      await queryClient.cancelQueries({ queryKey: ['messages', queryClientId] });
      const previousMessages = queryClient.getQueryData<Message[]>(['messages', queryClientId]);

      const tempId = `opt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const optimistic = {
        id: tempId, tenant_id: '', client_id: queryClientId, remote_jid: '',
        message_id: tempId, from_me: true, content: payload.content,
        type: (payload.type as any) ?? 'text', media_url: payload.mediaUrl,
        timestamp: new Date().toISOString(), status: 'pending' as const,
        created_at: new Date().toISOString(), _optimistic: true, _clientId: tempId,
      } as Message & { _optimistic: boolean; _clientId: string };

      queryClient.setQueryData<Message[]>(['messages', queryClientId], (old = []) => [...old, optimistic]);
      return { previousMessages, tempId, queryClientId };
    },

    onSuccess: (data, _payload, context) => {
      const { tempId, queryClientId } = context ?? {};

      if (data?.message?.id) {
        // Servidor retornou mensagem completa com id real → promover otimista
        queryClient.setQueryData<Message[]>(['messages', queryClientId], (old = []) =>
          old.map(m => {
            if ((m as any)._clientId !== tempId) return m;
            return { ...data.message, _optimistic: false, _clientId: undefined };
          })
        );
        // Forçar refetch imediato para sincronizar com o banco e garantir persistência
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['messages', queryClientId] });
        }, 1_500);
      } else {
        // data.message é null → INSERT falhou ou webhook chegou antes.
        // Marcar como 'sent' mas manter otimista e forçar refetch imediato
        // para tentar pegar do banco (webhook pode ter salvo).
        queryClient.setQueryData<Message[]>(['messages', queryClientId], (old = []) =>
          old.map(m => {
            if ((m as any)._clientId !== tempId) return m;
            return { ...m, status: 'sent' as const, _optimistic: true };
          })
        );
        // Refetch imediato para buscar do banco (o webhook pode ter salvo já)
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['messages', queryClientId] });
        }, 2_000);
      }

      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },

    onError: (_error, _payload, context) => {
      const { previousMessages, queryClientId } = context ?? {};
      if (previousMessages !== undefined) {
        queryClient.setQueryData<Message[]>(['messages', queryClientId], previousMessages);
      }
      queryClient.setQueryData<Message[]>(['messages', queryClientId], (old = []) =>
        old.map(m => (m as any)._clientId === context?.tempId ? { ...m, status: 'failed' as const } : m)
      );
    },
  });
}
