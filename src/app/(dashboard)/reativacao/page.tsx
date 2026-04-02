'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { UserX, Send, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useLeadsSemCompra } from '@/hooks/useLeadsSemCompra';
import { LeadBlock } from '@/components/reativacao/LeadBlock';
import { DisparoMassaModal } from '@/components/reativacao/DisparoMassaModal';
import type { Client } from '@/types';

/* ─── Configuração dos 4 blocos ─── */
const BLOCK_CONFIG = [
  {
    key: 'recentes' as const,
    label: 'Recentes',
    sublabel: '0–7 dias',
    cor: '#3b82f6',
    badge: { texto: 'Mais quentes', variante: 'blue' as const },
  },
  {
    key: 'em_espera' as const,
    label: 'Em espera',
    sublabel: '7–30 dias',
    cor: '#10b981',
    badge: { texto: 'Ainda aquecidos', variante: 'green' as const },
  },
  {
    key: 'esfriando' as const,
    label: 'Esfriando',
    sublabel: '30–90 dias',
    cor: '#f59e0b',
    badge: { texto: 'Reativar urgente', variante: 'amber' as const },
  },
  {
    key: 'frios' as const,
    label: 'Frios',
    sublabel: '+90 dias',
    cor: '#ef4444',
    badge: { texto: 'Última chance', variante: 'red' as const },
  },
];

export default function ReativacaoPage() {
  const router = useRouter();
  const [disparoLeads, setDisparoLeads] = useState<Client[] | null>(null);

  // Verificar autenticação
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login');
    });
  }, [router]);

  const { data, isLoading, error, refetch } = useLeadsSemCompra(1, 50);

  const buckets = data?.buckets;
  const total = data?.total ?? 0;
  const totalClients = data?.total_clients ?? 0;

  // Todos os leads das primeiras páginas para o disparo em massa
  const allLeads = [
    ...(buckets?.recentes.data ?? []),
    ...(buckets?.em_espera.data ?? []),
    ...(buckets?.esfriando.data ?? []),
    ...(buckets?.frios.data ?? []),
  ];

  const handleDisparar = useCallback((targets: Client[]) => {
    setDisparoLeads(targets);
  }, []);

  const handleDispararTodos = useCallback(() => {
    setDisparoLeads(allLeads);
  }, [allLeads]);

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
            <button
              onClick={() => refetch()}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Atualizar"
            >
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
      </div>

      {/* ─── Conteúdo ─── */}
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 size={32} className="animate-spin text-[#1e3a5f] mb-3" />
            <p className="text-sm text-gray-400">Carregando leads...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
            <AlertCircle size={36} className="text-red-400 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-red-800 mb-1">Erro ao carregar leads</h3>
            <p className="text-xs text-red-600">{error instanceof Error ? error.message : 'Erro desconhecido'}</p>
            <button
              onClick={() => refetch()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
            {/* ─── Cards de resumo ─── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SummaryCard
                label="Total sem compra"
                value={total.toLocaleString('pt-BR')}
                sub={`de ${totalClients.toLocaleString('pt-BR')} contatos`}
                valueColor="text-gray-900"
              />
              <SummaryCard
                label="Recentes (0–7 dias)"
                value={(buckets?.recentes.count ?? 0).toLocaleString('pt-BR')}
                sub="mais quentes"
                valueColor="text-blue-600"
              />
              <SummaryCard
                label="Esfriando (30–90d)"
                value={(buckets?.esfriando.count ?? 0).toLocaleString('pt-BR')}
                sub="urgente reativar"
                valueColor="text-amber-600"
              />
              <SummaryCard
                label="Frios (+90 dias)"
                value={(buckets?.frios.count ?? 0).toLocaleString('pt-BR')}
                sub="última chance"
                valueColor="text-red-500"
              />
            </div>

            {/* ─── Blocos por tempo ─── */}
            {total === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
                <UserX size={40} className="text-gray-300 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Nenhum lead sem compra</h3>
                <p className="text-xs text-gray-400">Todos os seus contatos já realizaram pelo menos um pedido.</p>
              </div>
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
        )}
      </div>

      {/* ─── Modal de disparo ─── */}
      {disparoLeads && (
        <DisparoMassaModal
          leads={disparoLeads}
          onClose={() => setDisparoLeads(null)}
        />
      )}
    </div>
  );
}

/* ─── Card de resumo ─── */
function SummaryCard({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  sub: string;
  valueColor: string;
}) {
  return (
    <div className="bg-white rounded-xl px-4 py-4 border border-gray-100">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
