'use client';

import { useEffect } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Chat, ChatFilter } from '@/types';

interface ChatsResponse {
  data: Chat[];
  pagination: {
    total: number;
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
}

/**
 * Hook para carregar chats com infinite scroll.
 * Carrega 50 por página. Sempre faz refetch ao montar para garantir
 * que a Central de Atendimento exiba os dados mais recentes do banco.
 */
export function useInfiniteChats(filter: ChatFilter = 'all', search?: string) {
  return useInfiniteQuery({
    queryKey: ['chats', filter, search],
    queryFn: async ({ pageParam }) => {
      // Aumentado para 50 — evita que a lista apareça "curta" nas primeiras páginas
      const params: Record<string, string> = { filter, limit: '50' };
      if (pageParam) params.cursor = pageParam as string;
      if (search?.trim()) params.search = search.trim();
      
      const response = await api.get<ChatsResponse>('/api/chats', params);
      if (response.error) throw new Error(response.error);

      const payload = response.data;

      // Guard: se vier como array plano (formato legado), normalizar
      if (Array.isArray(payload)) {
        return {
          data: payload as Chat[],
          pagination: { total: (payload as Chat[]).length, limit: 50, hasMore: false, nextCursor: null },
        };
      }

      // Formato esperado: { data: Chat[], pagination: { ... } }
      if (payload && typeof payload === 'object' && 'data' in payload && 'pagination' in payload) {
        return payload as ChatsResponse;
      }

      // Fallback seguro
      console.warn('[useInfiniteChats] Formato de resposta inesperado:', payload);
      return {
        data: [] as Chat[],
        pagination: { total: 0, limit: 50, hasMore: false, nextCursor: null },
      };
    },
    getNextPageParam: (lastPage) => lastPage.pagination?.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    // refetchOnMount: true respeita o staleTime — só busca novamente se os dados tiverem
    // mais de 30s. O Supabase Realtime invalida o cache em tempo real via
    // debouncedInvalidateChats, então 'always' causava refetches redundantes a cada
    // troca de tab/remontagem mesmo com dados frescos.
    refetchOnMount: true,
    staleTime: 30_000,
    // Polling de 120s como fallback apenas se o WebSocket cair.
    // Com Realtime ativo, este polling raramente dispara.
    refetchInterval: 120_000,
    // Manter cache por 5 minutos para não perder posição ao trocar de tab
    gcTime: 5 * 60_000,
  });
}

/**
 * Hook para forçar refresh completo dos chats (invalida todo o cache).
 */
export function useRefreshChats() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['chats'] });
}
