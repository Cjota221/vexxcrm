'use client';

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Product } from '@/types';

interface UseProductsParams {
  search?: string;
  category?: string;
  is_active?: boolean;
}

interface ProductsResponse {
  data: Product[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export function useProducts(params?: UseProductsParams): UseQueryResult<ProductsResponse, Error> {
  return useQuery<ProductsResponse, Error>({
    queryKey: ['products', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.search) searchParams.set('search', params.search);
      if (params?.category) searchParams.set('category', params.category);
      if (params?.is_active !== undefined) searchParams.set('is_active', String(params.is_active));

      const response = await api.get(`/api/products?${searchParams.toString()}`);
      const raw = response.data as any;
      // API retorna { data, total, page, ... }. api.ts agora preserva respostas paginadas.
      if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'data' in raw) {
        return raw as ProductsResponse;
      }
      // Fallback: se for array (resposta não-paginada)
      if (Array.isArray(raw)) {
        return { data: raw, total: raw.length, page: 1, per_page: raw.length, total_pages: 1 };
      }
      return { data: [], total: 0, page: 1, per_page: 50, total_pages: 1 };
    },
  });
}
