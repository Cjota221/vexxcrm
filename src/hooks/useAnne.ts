'use client';

import { useMutation, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

interface AnneMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnneResponse {
  reply: string;
  actions?: Array<{
    type: string;
    data: unknown;
  }>;
}

/**
 * Hook para interagir com o agente Anne (IA).
 */
export function useAnne() {
  const sendMessage = useMutation({
    mutationFn: async (payload: {
      message: string;
      context?: {
        client_id?: string;
        chat_history?: AnneMessage[];
      };
    }) => {
      const response = await api.post<AnneResponse>('/api/anne/chat', payload);
      if (response.error) throw new Error(response.error);
      return response.data;
    },
  });

  return {
    sendMessage: sendMessage.mutateAsync,
    isLoading: sendMessage.isPending,
    error: sendMessage.error,
  };
}

/**
 * Hook para sugestões de resposta rápida da Anne.
 */
export function useAnneSuggestions(lastMessage: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: ['anne-suggestions', lastMessage],
    queryFn: async () => {
      if (!lastMessage) return [];
      const response = await api.post<string[]>('/api/anne/suggest-replies', {
        message: lastMessage,
      });
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    enabled: enabled && !!lastMessage,
    staleTime: 5 * 60 * 1000,
  });
}
