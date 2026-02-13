'use client';

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Order } from '@/types';

interface UseOrdersParams {
  search?: string;
  status?: string;
  client_id?: string;
}

interface OrdersResponse {
  data: Order[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export function useOrders(params?: UseOrdersParams): UseQueryResult<OrdersResponse, Error> {
  return useQuery<OrdersResponse, Error>({
    queryKey: ['orders', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.search) searchParams.set('search', params.search);
      if (params?.status) searchParams.set('status', params.status);
      if (params?.client_id) searchParams.set('client_id', params.client_id);

      const response = await api.get(`/api/orders?${searchParams.toString()}`);
      const raw = response.data;
      // API retorna { data, total, page, ... } mas api.ts extrai json.data
      // Se raw é array, significa que api.ts extraiu json.data (o array)
      if (Array.isArray(raw)) {
        return { data: raw, total: raw.length, page: 1, per_page: raw.length, total_pages: 1 };
      }
      return raw as OrdersResponse;
    },
  });
}
