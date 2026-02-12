'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { TenantConfig } from '@/types';

/**
 * Hook para gerenciar configurações do tenant.
 */
export function useTenantConfig() {
  const { tenant, updateTenant } = useAuthStore();
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ['tenant-config'],
    queryFn: async () => {
      const response = await api.get<TenantConfig>('/api/tenants/config');
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutos
    initialData: tenant?.config,
  });

  const updateConfig = useMutation({
    mutationFn: async (config: Partial<TenantConfig>) => {
      const response = await api.put<TenantConfig>('/api/tenants/config', config);
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['tenant-config'], data);
      if (tenant) {
        updateTenant({ config: data as TenantConfig });
      }
    },
  });

  return {
    config: configQuery.data,
    isLoading: configQuery.isLoading,
    updateConfig: updateConfig.mutateAsync,
    isUpdating: updateConfig.isPending,
  };
}
