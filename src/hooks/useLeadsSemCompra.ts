'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import type { Client } from '@/types';

export interface BucketData {
  data: Client[];
  count: number;
}

export interface LeadsSemCompraResponse {
  buckets: {
    recentes:  BucketData;
    em_espera: BucketData;
    esfriando: BucketData;
    frios:     BucketData;
  };
  total: number;
  total_clients: number;
  page: number;
  per_page: number;
}

export function useLeadsSemCompra(page = 1, perPage = 50) {
  const tenantId = useAuthStore(s => s.tenant?.id);
  const accessToken = useAuthStore(s => s.accessToken);

  return useQuery<LeadsSemCompraResponse>({
    queryKey: ['leads-sem-compra', tenantId, page, perPage],
    enabled: !!tenantId && !!accessToken,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(
        `/api/reativacao/leads?page=${page}&per_page=${perPage}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `Erro ${res.status}`);
      }
      return res.json() as Promise<LeadsSemCompraResponse>;
    },
  });
}
