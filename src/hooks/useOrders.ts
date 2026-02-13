'use client';

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Order } from '@/types';

interface UseOrdersParams {
  search?: string;
  status?: string;
  client_id?: string;
  page?: number;
  per_page?: number;
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
      if (params?.page) searchParams.set('page', String(params.page));
      if (params?.per_page) searchParams.set('per_page', String(params.per_page));

      const response = await api.get(`/api/orders?${searchParams.toString()}`);
      const raw = response.data as any;
      // API retorna { data, total, page, ... }. api.ts agora preserva respostas paginadas.
      if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'data' in raw) {
        return raw as OrdersResponse;
      }
      // Fallback: se for array (resposta não-paginada)
      if (Array.isArray(raw)) {
        return { data: raw, total: raw.length, page: 1, per_page: raw.length, total_pages: 1 };
      }
      return { data: [], total: 0, page: 1, per_page: 50, total_pages: 1 };
    },
  });
}
