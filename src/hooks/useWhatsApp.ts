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

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useConnectionStore } from '@/store/connection';
import { api } from '@/lib/api';
import type { Message } from '@/types';

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
    staleTime: 0,         // sempre busca ao montar — garante histórico ao abrir conversa
    gcTime: 5 * 60_000,   // mantém cache 5min após desmontar (navegar entre conversas é rápido)
    refetchInterval: 30_000,
    refetchOnWindowFocus: false, // Realtime cobre isso; refocus causaria flash desnecessário
    refetchOnMount: true,
  });

  // NOTA: Canal Realtime por-clientId REMOVIDO (era duplicado).
  // O canal global em useRealtimeMessages.ts (tenant-messages-{tenantId}) já recebe
  // todos os INSERTs e UPDATEs de messages filtrados por tenant_id e atualiza
  // ['messages', clientId] diretamente. Manter dois canais escrevendo no mesmo
  // cache causava race condition no setQueryData e duplicação de mensagens.

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
