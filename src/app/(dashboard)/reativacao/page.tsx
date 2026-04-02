'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserX, Send, RefreshCw, Loader2, AlertCircle, Tag, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useLeadsSemCompra } from '@/hooks/useLeadsSemCompra';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { LeadBlock } from '@/components/reativacao/LeadBlock';
import { DisparoMassaModal } from '@/components/reativacao/DisparoMassaModal';
import type { Client } from '@/types';

/* ─── Blocos por tempo ─── */
const BLOCK_CONFIG = [
  { key: 'recentes'  as const, label: 'Recentes',  sublabel: '0–7 dias',   cor: '#3b82f6', badge: { texto: 'Mais quentes',    variante: 'blue'  as const } },
  { key: 'em_espera' as const, label: 'Em espera', sublabel: '7–30 dias',  cor: '#10b981', badge: { texto: 'Ainda aquecidos', variante: 'green' as const } },
  { key: 'esfriando' as const, label: 'Esfriando', sublabel: '30–90 dias', cor: '#f59e0b', badge: { texto: 'Reativar urgente',variante: 'amber' as const } },
  { key: 'frios'     as const, label: 'Frios',     sublabel: '+90 dias',   cor: '#ef4444', badge: { texto: 'Última chance',   variante: 'red'   as const } },
];

/* ─── Blocos por tag ─── */
const TAG_CONFIG = [
  { key: 'lead_frio'   as const, label: 'Lead Frio',   sublabel: 'Tag automática',  cor: '#ef4444', badge: { texto: 'Frio',   variante: 'red'   as const } },
  { key: 'lead_morno'  as const, label: 'Lead Morno',  sublabel: 'Tag automática',  cor: '#f59e0b', badge: { texto: 'Morno',  variante: 'amber' as const } },
  { key: 'lead_quente' as const, label: 'Lead Quente', sublabel: 'Tag automática',  cor: '#10b981', badge: { texto: 'Quente', variante: 'green' as const } },
];

type Tab = 'tempo' | 'tags';

interface TagGrupo { data: Client[]; count: number; }
interface PorTagsResponse {
  grupos: { lead_frio: TagGrupo; lead_morno: TagGrupo; lead_quente: TagGrupo };
  total: number;
}

function usePorTags() {
  const tenantId = useAuthStore(s => s.tenant?.id);
  const accessToken = useAuthStore(s => s.accessToken);
  return useQuery<PorTagsResponse>({
    queryKey: ['reativacao-por-tags', tenantId],
    enabled: !!tenantId && !!accessToken,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch('/api/reativacao/por-tags?per_page=50', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(await res.text() || `Erro ${res.status}`);
      return res.json();
    },
  });
}

export default function ReativacaoPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('tempo');
  const [disparoLeads, setDisparoLeads] = useState<Client[] | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login');
    });
  }, [router]);

  // ── aba Tempo ──
  const { data: tempoData, isLoading: tempoLoading, error: tempoError, refetch: tempoRefetch } = useLeadsSemCompra(1, 50);
  const buckets = tempoData?.buckets;
  const totalTempo = tempoData?.total ?? 0;
  const totalClients = tempoData?.total_clients ?? 0;

  // ── aba Tags ──
  const { data: tagsData, isLoading: tagsLoading, error: tagsError, refetch: tagsRefetch } = usePorTags();
  const grupos = tagsData?.grupos;
  const totalTags = tagsData?.total ?? 0;

  const isLoading = activeTab === 'tempo' ? tempoLoading : tagsLoading;
  const refetch = activeTab === 'tempo' ? tempoRefetch : tagsRefetch;

  const handleDisparar = useCallback((targets: Client[]) => setDisparoLeads(targets), []);

  const handleDispararTodos = useCallback(() => {
    if (activeTab === 'tempo') {
      setDisparoLeads([
        ...(buckets?.recentes.data ?? []),
        ...(buckets?.em_espera.data ?? []),
        ...(buckets?.esfriando.data ?? []),
        ...(buckets?.frios.data ?? []),
      ]);
    } else {
      setDisparoLeads([
        ...(grupos?.lead_frio.data ?? []),
        ...(grupos?.lead_morno.data ?? []),
        ...(grupos?.lead_quente.data ?? []),
      ]);
    }
  }, [activeTab, buckets, grupos]);

  const total = activeTab === 'tempo' ? totalTempo : totalTags;

  return (
    <div className="min-h-screen bg-[#f4f6f8]">
      {/* ─── Header ─── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1e3a5f] flex items-center justify-center">
              <UserX size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Reativação de leads</h1>
              <p className="text-xs text-gray-400">Contatos que ainda não fizeram nenhum pedido</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Atualizar">
              <RefreshCw size={15} className={cn('text-gray-500', isLoading && 'animate-spin')} />
            </button>
            <button
              onClick={handleDispararTodos}
              disabled={total === 0}
              className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] text-white text-sm font-semibold rounded-xl hover:bg-[#162d4a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={14} />
              Disparar em massa
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          <button
            onClick={() => setActiveTab('tempo')}
            className={cn('flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              activeTab === 'tempo' ? 'bg-[#1e3a5f] text-white' : 'text-gray-500 hover:bg-gray-100')}
          >
            <Clock size={14} />
            Por tempo
          </button>
          <button
            onClick={() => setActiveTab('tags')}
            className={cn('flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              activeTab === 'tags' ? 'bg-[#1e3a5f] text-white' : 'text-gray-500 hover:bg-gray-100')}
          >
            <Tag size={14} />
            Por tag
            {totalTags > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded-full">
                {totalTags.toLocaleString('pt-BR')}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ─── Conteúdo ─── */}
      <div className="p-6 space-y-5 max-w-4xl mx-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 size={32} className="animate-spin text-[#1e3a5f] mb-3" />
            <p className="text-sm text-gray-400">Carregando leads...</p>
          </div>
        ) : (activeTab === 'tempo' ? tempoError : tagsError) ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
            <AlertCircle size={36} className="text-red-400 mx-auto mb-3" />
            <p className="text-sm text-red-700">Erro ao carregar dados.</p>
            <button onClick={() => refetch()} className="mt-3 px-4 py-2 bg-red-600 text-white rounded-xl text-sm">Tentar novamente</button>
          </div>
        ) : activeTab === 'tempo' ? (
          <>
            {/* Cards resumo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SummaryCard label="Total sem compra"    value={totalTempo.toLocaleString('pt-BR')}                          sub={`de ${totalClients.toLocaleString('pt-BR')} contatos`} color="text-gray-900" />
              <SummaryCard label="Recentes (0–7 dias)" value={(buckets?.recentes.count  ?? 0).toLocaleString('pt-BR')}    sub="mais quentes"     color="text-blue-600"  />
              <SummaryCard label="Esfriando (30–90d)"  value={(buckets?.esfriando.count ?? 0).toLocaleString('pt-BR')}    sub="urgente reativar" color="text-amber-600" />
              <SummaryCard label="Frios (+90 dias)"    value={(buckets?.frios.count     ?? 0).toLocaleString('pt-BR')}    sub="última chance"    color="text-red-500"   />
            </div>

            {totalTempo === 0 ? (
              <EmptyState label="Nenhum lead sem compra" sub="Todos os contatos já realizaram pelo menos um pedido." />
            ) : (
              <div className="space-y-3">
                {BLOCK_CONFIG.map(cfg => (
                  <LeadBlock
                    key={cfg.key}
                    label={cfg.label}
                    sublabel={cfg.sublabel}
                    leads={buckets?.[cfg.key].data ?? []}
                    totalCount={buckets?.[cfg.key].count ?? 0}
                    cor={cfg.cor}
                    badge={cfg.badge}
                    onDisparar={handleDisparar}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Cards resumo por tag */}
            <div className="grid grid-cols-3 gap-4">
              <SummaryCard label="Lead Frio"   value={(grupos?.lead_frio.count   ?? 0).toLocaleString('pt-BR')} sub="sem engajamento"  color="text-red-500"   />
              <SummaryCard label="Lead Morno"  value={(grupos?.lead_morno.count  ?? 0).toLocaleString('pt-BR')} sub="engajamento baixo" color="text-amber-600" />
              <SummaryCard label="Lead Quente" value={(grupos?.lead_quente.count ?? 0).toLocaleString('pt-BR')} sub="engajamento alto"  color="text-emerald-600" />
            </div>

            {totalTags === 0 ? (
              <EmptyState label="Nenhum lead com tag de temperatura" sub="As tags lead_frio, lead_morno e lead_quente são atribuídas automaticamente pela Anne conforme o engajamento." />
            ) : (
              <div className="space-y-3">
                {TAG_CONFIG.map(cfg => (
                  <LeadBlock
                    key={cfg.key}
                    label={cfg.label}
                    sublabel={cfg.sublabel}
                    leads={grupos?.[cfg.key].data ?? []}
                    totalCount={grupos?.[cfg.key].count ?? 0}
                    cor={cfg.cor}
                    badge={cfg.badge}
                    onDisparar={handleDisparar}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {disparoLeads && (
        <DisparoMassaModal leads={disparoLeads} onClose={() => setDisparoLeads(null)} />
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-white rounded-xl px-4 py-4 border border-gray-100">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

function EmptyState({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
      <UserX size={40} className="text-gray-300 mx-auto mb-3" />
      <h3 className="text-sm font-semibold text-gray-700 mb-1">{label}</h3>
      <p className="text-xs text-gray-400 max-w-sm mx-auto">{sub}</p>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
