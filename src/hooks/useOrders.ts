'use client';

import { useQuery, useMutation, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Order } from '@/types';

interface UseOrdersParams {
  search?: string;
  search_type?: 'all' | 'phone' | 'cpf' | 'email';
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
      if (params?.search_type) searchParams.set('search_type', params.search_type);
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

/**
 * Hook para atualizar código de rastreio de um pedido.
 * Sincroniza com a API FacilZap e salva localmente.
 */
export function useUpdateTracking(orderId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (trackingCode: string | null) => {
      const response = await api.patch(`/api/orders/${orderId}/tracking`, {
        tracking_code: trackingCode,
      });
      return response.data as {
        success: boolean;
        tracking_code: string | null;
        facilzap_synced: boolean;
        facilzap_error: string | null;
        message: string;
      };
    },
    onSuccess: () => {
      // Invalidar queries relacionadas ao pedido
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
