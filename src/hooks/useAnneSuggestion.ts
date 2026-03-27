'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useEffect } from 'react';

export interface AnneSuggestion {
  id: string;
  conversation_id: string;
  agent: string | null;
  intent: string | null;
  confidence: number | null;
  mensagem: string;
  status: 'pending' | 'sent' | 'dismissed';
  created_at: string;
}

/**
 * Retorna a sugestão pendente mais recente da Anne para a conversa ativa.
 * Usa Supabase Realtime para receber novas sugestões em tempo real.
 */
export function useAnneSuggestion(conversationId: string | null) {
  const queryClient = useQueryClient();

  const { data: suggestion } = useQuery<AnneSuggestion | null>({
    queryKey: ['anne-suggestion', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;

      const { data } = await supabase
        .from('anne_suggestions')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return (data as AnneSuggestion | null) ?? null;
    },
    enabled: !!conversationId,
    // Refetch a cada 10s como fallback (caso Realtime falhe)
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  // Supabase Realtime: recebe novas sugestões sem polling
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`anne-suggestions-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'anne_suggestions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['anne-suggestion', conversationId] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  const { mutateAsync: updateStatus } = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'sent' | 'dismissed' }) => {
      await api.patch(`/api/anne/suggestions/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anne-suggestion', conversationId] });
    },
  });

  return { suggestion: suggestion ?? null, updateStatus };
}
