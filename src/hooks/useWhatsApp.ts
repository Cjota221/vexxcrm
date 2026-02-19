'use client';

import { useEffect, useCallback } from 'react';
import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useConnectionStore } from '@/store/connection';
import { api } from '@/lib/api';
import type { Message } from '@/types';

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
 * Hook para buscar mensagens de um chat.
 * Extrai o array de `data` corretamente — API retorna { data: Message[] }.
 *
 * staleTime: 0 → considera sempre stale para que invalidateQueries do SSE
 * dispare refetch imediato, resolvendo o problema de mensagem "fantasma".
 * refetchInterval: 8s → fallback de polling quando SSE cai.
 */
export function useMessages(clientId: string | null) {
  return useQuery({
    queryKey: ['messages', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const response = await api.get<{ data: Message[] } | Message[]>(`/api/messages/${clientId}`);
      if (response.error) throw new Error(response.error);
      // API retorna { data: Message[] } — extrair o array
      const raw = response.data as any;
      if (Array.isArray(raw)) return raw as Message[];
      if (raw?.data && Array.isArray(raw.data)) return raw.data as Message[];
      return [];
    },
    enabled: !!clientId,
    staleTime: 0,            // sempre stale → SSE invalidate dispara refetch imediato
    refetchInterval: 8_000,  // fallback polling 8s caso SSE esteja offline
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
}

/**
 * Hook para enviar mensagens via WhatsApp.
 */
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      to: string;              // Telefone do destinatário
      content: string;          // Conteúdo da mensagem
      type?: string;            // Tipo: text, image, video
      mediaUrl?: string;        // URL da mídia (se type != text)
      caption?: string;         // Legenda para mídia
    }) => {
      const response = await api.post<{ 
        success: boolean; 
        message: Message;
        messageId: string;
      }>('/api/whatsapp/send', payload);
      
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    onSuccess: (data, variables) => {
      // Invalidar lista de chats para reordenar
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      // Invalidar mensagens — refetchType 'all' garante que todas as queries refetch mesmo se inativas
      queryClient.invalidateQueries({ queryKey: ['messages'], refetchType: 'all' });
    },
    onError: (error: Error) => {
      console.error('[useSendMessage] Falha ao enviar mensagem:', error.message);
      // Exibir alert nativo caso não haja toast disponível no contexto
      if (typeof window !== 'undefined') {
        alert(`Erro ao enviar mensagem: ${error.message}`);
      }
    },
  });
}
