'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface SourceStat {
  source: string;
  count: number;
}

export interface StateStat {
  state: string;
  count: number;
}

export interface ClientStats {
  total: number;
  by_source: SourceStat[];
  by_state: StateStat[];
}

/**
 * Busca contagens agrupadas por source e address_state em uma única roundtrip.
 */
export function useClientStats() {
  return useQuery<ClientStats>({
    queryKey: ['client-stats'],
    queryFn: async () => {
      const response = await api.get<ClientStats>('/api/clients/stats');
      if (response.error) throw new Error(response.error);
      return response.data as ClientStats;
    },
    staleTime: 2 * 60 * 1000, // 2 minutos
  });
}
