'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { Client, ClientFilters, PaginatedResponse } from '@/types';

/**
 * Hook para buscar lista de clientes com filtros.
 */
export function useClients(filters?: ClientFilters) {
  return useQuery({
    queryKey: ['clients', filters],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters?.search) params.search = filters.search;
      if (filters?.status) params.status = Array.isArray(filters.status) ? filters.status.join(',') : filters.status;
      if (filters?.has_orders !== undefined) params.has_orders = String(filters.has_orders);
      if (filters?.source) params.source = filters.source;
      if (filters?.has_name !== undefined) params.has_name = String(filters.has_name);
      if (filters?.page) params.page = String(filters.page);
      if (filters?.per_page) params.per_page = String(filters.per_page);
      if (filters?.sort_by) params.sort_by = String(filters.sort_by);
      if (filters?.sort_order) params.sort_order = filters.sort_order;

      const response = await api.get<PaginatedResponse<Client>>('/api/clients', params);
      if (response.error) throw new Error(response.error);
      const raw = response.data as any;
      // API retorna { data, total, page, ... }. api.ts agora preserva respostas paginadas.
      if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'data' in raw) {
        return raw;
      }
      // Fallback: se for array (resposta não-paginada)
      if (Array.isArray(raw)) {
        return { data: raw, total: raw.length, page: 1, per_page: raw.length, total_pages: 1 };
      }
      return { data: [], total: 0, page: 1, per_page: 20, total_pages: 1 };
    },
    staleTime: 60 * 1000, // 1 minuto
  });
}

/**
 * Hook para buscar um cliente específico.
 */
export function useClient(clientId: string | null) {
  return useQuery({
    queryKey: ['client', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const response = await api.get<Client>(`/api/clients/${clientId}`);
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    enabled: !!clientId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook para criar/atualizar cliente.
 */
export function useClientMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { id?: string } & Partial<Client>) => {
      if (data.id) {
        const response = await api.put<Client>(`/api/clients/${data.id}`, data);
        if (response.error) throw new Error(response.error);
        return response.data;
      }
      const response = await api.post<Client>('/api/clients', data);
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}
