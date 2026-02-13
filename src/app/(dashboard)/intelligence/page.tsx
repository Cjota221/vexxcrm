'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Brain,
  Sparkles,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  useIntelligenceOverview,
  useRFMDistribution,
  useCalculateRFM,
} from '@/hooks/useIntelligence';
import { RFMOverview } from '@/components/intelligence/RFMOverview';
import { SegmentGrid } from '@/components/intelligence/SegmentGrid';
import { RFMChart } from '@/components/intelligence/RFMChart';
import { AIAlerts } from '@/components/intelligence/AIAlerts';
import { CalculateRFMButton } from '@/components/intelligence/CalculateRFMButton';
import { SeasonalInsights } from '@/components/intelligence/SeasonalInsights';
import { ProductTrends } from '@/components/intelligence/ProductTrends';

/**
 * Intelligence Dashboard — Painel completo de IA comportamental.
 * RFM Engine, Segmentação, Alertas, Predições.
 */
export default function IntelligencePage() {
  const router = useRouter();
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Verificar autenticação
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
      }
    };
    checkAuth();
  }, [router]);

  // Dados
  const {
    data: overview,
    isLoading: isLoadingOverview,
    error: overviewError,
    refetch: refetchOverview,
  } = useIntelligenceOverview();

  const {
    data: rfmData,
    isLoading: isLoadingRFM,
    refetch: refetchRFM,
  } = useRFMDistribution();

  const calculateRFM = useCalculateRFM();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [lastReport, setLastReport] = useState<any>(null);

  // Handler do cálculo RFM
  const handleCalculateRFM = async () => {
    try {
      setNotification(null);
      const result = await calculateRFM.mutateAsync();
      if (result?.report) {
        setLastReport(result.report);
        setNotification({
          type: 'success',
          message: `✅ RFM calculado! ${result.report.stats.total_processed} clientes processados, ${result.report.stats.segment_changes} mudanças de segmento.`,
        });
      }
      // Refetch dados
      refetchOverview();
      refetchRFM();
    } catch (error) {
      setNotification({
        type: 'error',
        message: `❌ Erro ao calcular RFM: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      });
    }
  };

  // Loading state
  const isLoading = isLoadingOverview || isLoadingRFM;

  // Extract overview data
  const ov = overview?.overview;
  const kpis = ov?.kpis || {
    vip_count: 0,
    risk_count: 0,
    attention_count: 0,
    upsell_count: 0,
    avg_churn_probability: 0,
    avg_purchase_prob_30d: 0,
    total_ltv_projected_12m: 0,
    avg_sentiment: 0,
  };
  const rfmDistribution = ov?.rfm?.distribution || {};
  const totalCalculated = ov?.rfm?.total_calculated || 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalClients = (ov?.rfm as any)?.total_clients || 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coveragePct = (ov?.rfm as any)?.coverage_pct || 0;
  const lastCalculatedAt = ov?.rfm?.last_calculated_at || null;
  const events7d = ov?.events?.total_7d || 0;

  // Distribution com dados detalhados do endpoint /rfm
  const detailedDistribution = rfmData?.distribution || {};

  return (
    <div className="min-h-screen bg-surface-bg">
      {/* ─── HEADER ─── */}
      <div className="bg-white border-b border-surface-border px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
              <Brain size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-txt-primary flex items-center gap-2">
                Inteligência Artificial
                <Sparkles size={18} className="text-yellow-500" />
              </h1>
              <p className="text-sm text-txt-muted">
                Motor RFM, segmentação comportamental e predições de IA
              </p>
            </div>
          </div>

          {/* Botão de refresh */}
          <button
            onClick={() => { refetchOverview(); refetchRFM(); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-surface-border text-sm text-txt-secondary hover:bg-surface-50 transition-colors"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {/* ─── NOTIFICAÇÃO ─── */}
      {notification && (
        <div className={`mx-6 mt-4 p-4 rounded-xl flex items-center gap-3 ${
          notification.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle2 size={18} className="text-green-600 shrink-0" />
          ) : (
            <AlertCircle size={18} className="text-red-600 shrink-0" />
          )}
          <p className="text-sm">{notification.message}</p>
          <button
            onClick={() => setNotification(null)}
            className="ml-auto text-sm font-medium hover:underline"
          >
            Fechar
          </button>
        </div>
      )}

      {/* ─── CONTEÚDO ─── */}
      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={40} className="animate-spin text-crm-primary mb-4" />
            <p className="text-sm text-txt-muted">Carregando inteligência artificial...</p>
          </div>
        ) : overviewError ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
            <AlertCircle size={40} className="text-red-400 mx-auto mb-4" />
            <h3 className="text-base font-semibold text-red-800 mb-2">Erro ao carregar dados</h3>
            <p className="text-sm text-red-600">{overviewError instanceof Error ? overviewError.message : 'Erro desconhecido'}</p>
            <button
              onClick={() => refetchOverview()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
            {/* Linha 1: KPIs + Calcular */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <RFMOverview
                  kpis={kpis}
                  totalCalculated={totalCalculated}
                  totalClients={totalClients}
                  coveragePct={coveragePct}
                  lastCalculatedAt={lastCalculatedAt}
                  events7d={events7d}
                />
              </div>
              <div>
                <CalculateRFMButton
                  onCalculate={handleCalculateRFM}
                  isCalculating={calculateRFM.isPending}
                  lastReport={lastReport}
                />
              </div>
            </div>

            {/* Linha 2: Gráfico de distribuição + Alertas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RFMChart distribution={rfmDistribution} />
              <AIAlerts alerts={[]} kpis={kpis} />
            </div>

            {/* Linha 3: Grid completo de segmentos */}
            <SegmentGrid
              distribution={detailedDistribution}
              totalClients={totalCalculated}
            />

            {/* Linha 4: Inteligência v2 — Sazonalidade + Produto */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SeasonalInsights />
              <ProductTrends />
            </div>

            {/* Linha 5: Nota sobre estado */}
            {totalCalculated === 0 && (
              <div className="bg-violet-50 border border-violet-200 rounded-2xl p-8 text-center">
                <Brain size={48} className="text-violet-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-violet-800 mb-2">
                  Nenhum cálculo RFM realizado
                </h3>
                <p className="text-sm text-violet-600 max-w-md mx-auto mb-4">
                  Clique em &quot;Calcular RFM Agora&quot; para analisar todos os seus clientes
                  e gerar segmentação inteligente, predições de churn e oportunidades de upsell.
                </p>
                <p className="text-xs text-violet-500">
                  O cálculo usa dados de pedidos sincronizados da FacilZap para determinar
                  Recência, Frequência e Valor Monetário de cada cliente.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
