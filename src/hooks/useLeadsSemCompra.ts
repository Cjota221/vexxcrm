'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import type { Client } from '@/types';

export interface LeadsSemCompraResponse {
  data: Client[];
  total: number;
  total_clients: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export type LeadBucket = 'recentes' | 'em_espera' | 'esfriando' | 'frios';

export interface BucketedLeads {
  recentes: Client[];    // 0–7 dias
  em_espera: Client[];   // 7–30 dias
  esfriando: Client[];   // 30–90 dias
  frios: Client[];       // +90 dias
}

function classifyLead(lead: Client): LeadBucket {
  const diffDays = (Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= 7) return 'recentes';
  if (diffDays <= 30) return 'em_espera';
  if (diffDays <= 90) return 'esfriando';
  return 'frios';
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
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `Erro ${res.status}`);
      }
      return res.json() as Promise<LeadsSemCompraResponse>;
    },
  });
}

/** Agrupa uma lista flat de leads nos 4 buckets de tempo */
export function bucketLeads(leads: Client[]): BucketedLeads {
  const result: BucketedLeads = { recentes: [], em_espera: [], esfriando: [], frios: [] };
  for (const lead of leads) {
    result[classifyLead(lead)].push(lead);
  }
  return result;
}
