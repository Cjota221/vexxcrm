'use client';

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
 * Carrega 25 por vez para não sobrecarregar com milhares de conversas.
 */
export function useInfiniteChats(filter: ChatFilter = 'all', search?: string) {
  return useInfiniteQuery({
    queryKey: ['chats', filter, search],
    queryFn: async ({ pageParam }) => {
      const params: Record<string, string> = { filter, limit: '25' };
      if (pageParam) params.cursor = pageParam;
      if (search?.trim()) params.search = search.trim();
      
      const response = await api.get<ChatsResponse>('/api/chats', params);
      if (response.error) throw new Error(response.error);
      
      // Handle both old format (data: Chat[]) and new format (data + pagination)
      if (Array.isArray(response.data)) {
        // Old format fallback
        return {
          data: response.data as unknown as Chat[],
          pagination: { total: 0, limit: 25, hasMore: false, nextCursor: null }
        };
      }
      
      return response.data;
    },
    getNextPageParam: (lastPage) => lastPage.pagination?.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    staleTime: 30_000,
  });
}

/**
 * Hook para forçar refresh dos chats
 */
export function useRefreshChats() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['chats'] });
}
