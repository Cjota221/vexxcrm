'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import type {
  Queue,
  QuickAction,
  AgentStatus,
  SentinelaAnalysisItem,
  SentinelaStats,
} from '@/types';

const API_BASE = '/api';

function useHeaders() {
  const { accessToken } = useAuthStore();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

/* ━━━━━━━━ Contact Center ━━━━━━━━ */

export function useQueues() {
  const headers = useHeaders();
  return useQuery<Queue[]>({
    queryKey: ['contact-center', 'queues'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/contact-center/queues`, { headers });
      const json = await res.json();
      return json.data || [];
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

export function useAgentStats() {
  const headers = useHeaders();
  return useQuery<AgentStatus>({
    queryKey: ['contact-center', 'stats'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/contact-center/stats`, { headers });
      const json = await res.json();
      return json.data?.agent || {};
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

export function useQuickActions() {
  const headers = useHeaders();
  return useQuery<QuickAction[]>({
    queryKey: ['contact-center', 'quick-actions'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/contact-center/quick-actions`, { headers });
      const json = await res.json();
      return json.data || [];
    },
    staleTime: 60_000,
  });
}

export function usePullConversation() {
  const headers = useHeaders();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/contact-center/pull`, {
        method: 'POST',
        headers,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao puxar conversa');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-center'] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });
}

export function useTransferConversation() {
  const headers = useHeaders();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      conversation_id: string;
      to_profile_id?: string;
      to_queue_id?: string;
      reason?: string;
    }) => {
      const res = await fetch(`${API_BASE}/contact-center/transfer`, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro na transferência');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-center'] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });
}

export function useExecuteQuickAction() {
  const headers = useHeaders();

  return useMutation({
    mutationFn: async (params: {
      conversation_id: string;
      action_slug: string;
    }) => {
      const res = await fetch(`${API_BASE}/contact-center/quick-actions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro na ação');
      return json.data;
    },
  });
}

export function useSendProductToChat() {
  const headers = useHeaders();

  return useMutation({
    mutationFn: async (params: {
      conversation_id: string;
      product_id: string;
      include_price?: boolean;
      include_link?: boolean;
    }) => {
      const res = await fetch(`${API_BASE}/contact-center/send-product`, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao enviar produto');
      return json.data;
    },
  });
}

/* ━━━━━━━━ Sentinela Anne v3 ━━━━━━━━ */

export function useSentinelaAnalyses(filters?: {
  type?: string;
  urgency?: string;
}) {
  const headers = useHeaders();
  return useQuery<{
    analyses: SentinelaAnalysisItem[];
    stats: SentinelaStats;
  }>({
    queryKey: ['sentinela', 'analyses', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.type) params.set('type', filters.type);
      if (filters?.urgency) params.set('urgency', filters.urgency);

      const res = await fetch(
        `${API_BASE}/anne/analyze?${params.toString()}`,
        { headers }
      );
      const json = await res.json();
      return json.data || { analyses: [], stats: {} };
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useRunAnalysis() {
  const headers = useHeaders();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (clientId?: string) => {
      const res = await fetch(`${API_BASE}/anne/analyze`, {
        method: 'POST',
        headers,
        body: JSON.stringify(clientId ? { client_id: clientId } : {}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro na análise');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sentinela'] });
    },
  });
}

export function useApproveAnalysis() {
  const headers = useHeaders();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      analysis_id: string;
      action: 'approve' | 'reject';
      reason?: string;
    }) => {
      const res = await fetch(`${API_BASE}/anne/approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro na aprovação');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sentinela'] });
    },
  });
}

export function useSubmitFeedback() {
  const headers = useHeaders();

  return useMutation({
    mutationFn: async (params: {
      analysis_id: string;
      score: number;
      notes?: string;
    }) => {
      const res = await fetch(`${API_BASE}/anne/feedback`, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro no feedback');
      return json.data;
    },
  });
}
