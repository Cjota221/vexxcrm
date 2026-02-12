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

      const response = await api.get(`/products?${searchParams.toString()}`);
      return response.data as ProductsResponse;
    },
  });
}
