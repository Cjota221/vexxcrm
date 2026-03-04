// src/hooks/useClientOrdersDebug.ts
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '@/lib/api';

export interface DebugOrdersInfo {
  clientId: string | null;
  isLoading: boolean;
  ordersCount: number | null;
  error: Error | null;
  lastFetch: Date | null;
  apiResponse: any;
}

/**
 * Hook para debug em tempo real de sincronização de pedidos
 * Mostra exatamente o que está acontecendo na query
 */
export function useClientOrdersDebug(clientId: string | null): DebugOrdersInfo {
  const query = useQuery<any, Error, any>({
    queryKey: ['client-orders-debug', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const res = await api.get<any>(`/api/clients/${clientId}`);
      const orders = (res.data?.data?.recent_orders ?? []) as any[];
      return { orders, fullResponse: res.data };
    },
    enabled: !!clientId,
    staleTime: 0,
    refetchInterval: 10_000,
    gcTime: 5 * 60 * 1000,
  });

  // Log em tempo real
  useEffect(() => {
    if (clientId) {
      const orderCount = query.data?.orders?.length ?? null;
      const status = query.isLoading ? '⏳' : query.error ? '❌' : '✅';
      console.log(`[OrdersDebug] ${status} Client: ${clientId}, Orders: ${orderCount}, Refetch: ${query.dataUpdatedAt}`);
    }
  }, [query.data, query.isLoading, query.error, clientId, query.dataUpdatedAt]);

  return {
    clientId,
    isLoading: query.isLoading,
    ordersCount: query.data?.orders?.length ?? null,
    error: query.error as Error | null,
    lastFetch: query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null,
    apiResponse: query.data?.fullResponse,
  };
}
