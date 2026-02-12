'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { Campaign, PaginatedResponse } from '@/types';

/**
 * Hook para buscar campanhas.
 */
export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Campaign>>('/api/campaigns');
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    staleTime: 60 * 1000,
  });
}

/**
 * Hook para buscar uma campanha específica.
 */
export function useCampaign(campaignId: string | null) {
  return useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: async () => {
      if (!campaignId) return null;
      const response = await api.get<Campaign>(`/api/campaigns/${campaignId}`);
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    enabled: !!campaignId,
  });
}

/**
 * Hook para criar/atualizar/enviar campanhas.
 */
export function useCampaignMutation() {
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: async (data: Partial<Campaign> & { id?: string }) => {
      if (data.id) {
        const response = await api.put<Campaign>(`/api/campaigns/${data.id}`, data);
        if (response.error) throw new Error(response.error);
        return response.data;
      }
      const response = await api.post<Campaign>('/api/campaigns', data);
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  const sendSequence = useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await api.post(`/api/campaigns/send-sequence`, { campaign_id: campaignId });
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  return { save, sendSequence };
}
