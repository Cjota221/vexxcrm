'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Brain,
  AlertTriangle,
  TrendingUp,
  Star,
  Calendar,
  ShoppingCart,
  Sparkles,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Gift,
  Megaphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useSentinelaAnalyses,
  useRunAnalysis,
  useApproveAnalysis,
  useSubmitFeedback,
} from '@/hooks/useContactCenter';
import type { SentinelaAnalysisItem, SentinelaUrgency } from '@/types';

const TYPE_CONFIG: Record<string, { icon: typeof Brain; label: string; color: string }> = {
  churn_risk: { icon: AlertTriangle, label: 'Risco de Churn', color: 'text-red-500 bg-red-50' },
  upsell_opportunity: { icon: TrendingUp, label: 'Upsell', color: 'text-blue-600 bg-blue-50' },
  vip_care: { icon: Star, label: 'VIP', color: 'text-amber-500 bg-amber-50' },
  seasonal_opportunity: { icon: Calendar, label: 'Sazonal', color: 'text-purple-500 bg-purple-50' },
  cross_sell: { icon: ShoppingCart, label: 'Cross-sell', color: 'text-indigo-500 bg-indigo-50' },
  win_back: { icon: RefreshCw, label: 'Win-back', color: 'text-orange-500 bg-orange-50' },
  reactivation: { icon: RefreshCw, label: 'Reativação', color: 'text-teal-500 bg-teal-50' },
  new_customer_nurture: { icon: Sparkles, label: 'Novo Cliente', color: 'text-emerald-500 bg-emerald-50' },
};

const URGENCY_CONFIG: Record<SentinelaUrgency, { label: string; color: string; dot: string }> = {
  critical: { label: 'Crítico', color: 'text-red-700 bg-red-100', dot: 'bg-red-500' },
  high: { label: 'Alta', color: 'text-orange-700 bg-orange-100', dot: 'bg-orange-500' },
  medium: { label: 'Média', color: 'text-yellow-700 bg-yellow-100', dot: 'bg-yellow-500' },
  low: { label: 'Baixa', color: 'text-gray-600 bg-gray-100', dot: 'bg-gray-400' },
};

const ACTION_ICONS: Record<string, typeof Brain> = {
  generate_coupon: Gift,
  send_message: MessageSquare,
  create_campaign: Sparkles,
  add_tag: Star,
  schedule_followup: Calendar,
};

const CAMPAIGN_LABELS: Record<string, string> = {
  churn_risk: 'Recuperação de Clientes',
  upsell_opportunity: 'Upsell',
  vip_care: 'Cuidado VIP',
  win_back: 'Win-Back',
  reactivation: 'Reativação',
  new_customer_nurture: 'Nutrir Novo Cliente',
  cross_sell: 'Cross-Sell',
  seasonal_opportunity: 'Campanha Sazonal',
};

/**
 * Painel da Sentinela Anne v3 — exibe análises autônomas pendentes.
 * O atendente pode aprovar, rejeitar e dar feedback.
 */
export function SentinelaAnnePanel() {
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const { data, isLoading, refetch } = useSentinelaAnalyses(
    typeFilter ? { type: typeFilter } : undefined
  );
  const runAnalysis = useRunAnalysis();
  const approveMutation = useApproveAnalysis();
  const feedbackMutation = useSubmitFeedback();

  const analyses = data?.analyses || [];
  const stats = data?.stats;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-200 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-crm-primary" />
            <h3 className="text-sm font-semibold text-txt-primary">
              Sentinela Anne
            </h3>
            {(stats?.pending || 0) > 0 && (
              <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-bold">
                {stats?.pending}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => runAnalysis.mutate(undefined)}
              disabled={runAnalysis.isPending}
              className="p-1.5 rounded-lg text-txt-secondary hover:bg-surface-100 transition-colors"
            >
              {runAnalysis.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
            </button>
          </div>
        </div>

        {/* Stats row */}
        {stats && (
          <div className="flex gap-3 text-[10px]">
            <span className="text-txt-muted">
              Total: <b className="text-txt-primary">{stats.total_analyses}</b>
            </span>
            <span className="text-txt-muted">
              Executadas: <b className="text-emerald-600">{stats.executed}</b>
            </span>
            <span className="text-txt-muted">
              Cupons: <b className="text-purple-600">{stats.coupons_generated}</b>
            </span>
          </div>
        )}

        {/* Type filters */}
        <div className="flex gap-1 mt-2 overflow-x-auto">
          <button
            onClick={() => setTypeFilter(undefined)}
            className={cn(
              'px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap transition-colors',
              !typeFilter
                ? 'bg-crm-primary text-white'
                : 'bg-surface-100 text-txt-secondary hover:bg-surface-200'
            )}
          >
            Todas
          </button>
          {Object.entries(TYPE_CONFIG).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setTypeFilter(typeFilter === key ? undefined : key)}
              className={cn(
                'px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap transition-colors',
                typeFilter === key
                  ? 'bg-crm-primary text-white'
                  : 'bg-surface-100 text-txt-secondary hover:bg-surface-200'
              )}
            >
              {config.label}
            </button>
          ))}
        </div>
      </div>

      {/* Analyses list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-crm-primary" />
          </div>
        ) : analyses.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Brain size={28} className="text-gray-200 mx-auto mb-2" />
            <p className="text-xs text-txt-muted">
              Nenhuma análise pendente
            </p>
            <button
              onClick={() => runAnalysis.mutate(undefined)}
              className="mt-3 text-xs text-crm-primary font-medium hover:underline"
            >
              Executar análise agora
            </button>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {analyses.map((analysis) => (
              <AnalysisCard
                key={analysis.id}
                analysis={analysis}
                onApprove={(id) =>
                  approveMutation.mutate({ analysis_id: id, action: 'approve' })
                }
                onReject={(id, reason) =>
                  approveMutation.mutate({ analysis_id: id, action: 'reject', reason })
                }
                onFeedback={(id, score) =>
                  feedbackMutation.mutate({ analysis_id: id, score })
                }
                isProcessing={approveMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ━━━━━━━━ Card de Análise Individual ━━━━━━━━ */

function AnalysisCard({
  analysis,
  onApprove,
  onReject,
  onFeedback,
  isProcessing,
}: {
  analysis: SentinelaAnalysisItem;
  onApprove: (id: string) => void;
  onReject: (id: string, reason?: string) => void;
  onFeedback: (id: string, score: number) => void;
  isProcessing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const typeConfig = TYPE_CONFIG[analysis.type] || TYPE_CONFIG.churn_risk;
  const urgencyConfig = URGENCY_CONFIG[analysis.urgency];
  const ActionIcon = (ACTION_ICONS as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[analysis.recommended_action] || Sparkles;
  const TypeIcon = typeConfig.icon;

  return (
    <div className="rounded-xl border border-surface-200 overflow-hidden hover:shadow-sm transition-shadow">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-2.5 p-3 text-left"
      >
        {/* Type icon */}
        <div className={cn('p-1.5 rounded-lg shrink-0', typeConfig.color)}>
          <TypeIcon size={14} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                urgencyConfig.dot
              )}
            />
            <span
              className={cn(
                'px-1.5 py-0.5 rounded text-[9px] font-bold uppercase',
                urgencyConfig.color
              )}
            >
              {urgencyConfig.label}
            </span>
            <span className="text-[10px] text-txt-muted">
              {Math.round(analysis.confidence * 100)}%
            </span>
          </div>
          <p className="text-xs font-medium text-txt-primary leading-tight truncate">
            {analysis.title}
          </p>
        </div>

        {expanded ? (
          <ChevronDown size={14} className="text-txt-muted shrink-0 mt-1" />
        ) : (
          <ChevronRight size={14} className="text-txt-muted shrink-0 mt-1" />
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <ExpandedContent
          analysis={analysis}
          onApprove={onApprove}
          onReject={onReject}
          onFeedback={onFeedback}
          isProcessing={isProcessing}
        />
      )}
    </div>
  );
}

/* ━━━━━━━━ Expanded Content (extracted to avoid unknown type issue) ━━━━━━━━ */

function ExpandedContent({
  analysis,
  onApprove,
  onReject,
  onFeedback,
  isProcessing,
}: {
  analysis: SentinelaAnalysisItem;
  onApprove: (id: string) => void;
  onReject: (id: string, reason?: string) => void;
  onFeedback: (id: string, score: number) => void;
  isProcessing: boolean;
}) {
  const router = useRouter();
  const [loadingCampaign, setLoadingCampaign] = useState(false);

  const handleDispararCampanha = async () => {
    setLoadingCampaign(true);
    try {
      const res = await fetch(`/api/v2/sentinela/analysis-clients/${analysis.id}`);
      const data = await res.json();

      const params = new URLSearchParams({
        origem: 'sentinela',
        insight_type: analysis.type,
        insight_label: data.label || analysis.title,
      });

      sessionStorage.setItem(
        'sentinela_campaign_clients',
        JSON.stringify({
          clients: data.clients,
          total: data.total,
          label: data.label,
          insight_type: analysis.type,
          analysis_id: analysis.id,
        })
      );

      router.push(`/campanhas/nova?${params.toString()}`);
    } catch (err) {
      console.error('Erro ao preparar campanha:', err);
    } finally {
      setLoadingCampaign(false);
    }
  };

  const actionLabel =
    analysis.recommended_action === 'generate_coupon'
      ? 'Gerar cupom personalizado'
      : analysis.recommended_action === 'send_message'
        ? 'Enviar mensagem'
        : String(analysis.recommended_action);

  const payloadMessage = analysis.action_payload?.message
    ? String(analysis.action_payload.message)
    : null;

  return (
    <div className="px-3 pb-3 space-y-2.5 border-t border-surface-100 pt-2.5">
      <p className="text-[11px] text-txt-secondary leading-relaxed">
        {analysis.description}
      </p>

      <div className="flex items-center gap-2 px-2.5 py-2 bg-surface-50 rounded-lg">
        <Sparkles size={12} className="text-crm-primary shrink-0" />
        <span className="text-[10px] font-medium text-txt-primary">
          Ação recomendada: {actionLabel}
        </span>
      </div>

      {payloadMessage && (
        <div className="px-2.5 py-2 bg-blue-50 rounded-lg border border-blue-100">
          <p className="text-[10px] text-blue-800 leading-relaxed">
            &ldquo;{payloadMessage.substring(0, 150)}
            {payloadMessage.length > 150 ? '...' : ''}&rdquo;
          </p>
        </div>
      )}

      {analysis.status === 'pending' && (
        <div className="flex gap-2">
          <button
            onClick={() => onApprove(analysis.id)}
            disabled={isProcessing}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
          >
            <Check size={13} />
            Aprovar
          </button>
          <button
            onClick={() => onReject(analysis.id)}
            disabled={isProcessing}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-100 text-txt-secondary text-xs font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            <X size={13} />
            Rejeitar
          </button>
        </div>
      )}

      {(analysis.status === 'pending' || analysis.status === 'approved') && (
        <button
          onClick={handleDispararCampanha}
          disabled={loadingCampaign || isProcessing}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-crm-primary text-white text-xs font-medium hover:bg-crm-primary/90 transition-colors disabled:opacity-50"
        >
          {loadingCampaign
            ? <><Loader2 size={13} className="animate-spin" /> Preparando base...</>
            : <><Megaphone size={13} /> Disparar Campanha ({CAMPAIGN_LABELS[analysis.type] ?? 'Engajamento'})</>
          }
        </button>
      )}

      {(analysis.status === 'executed' || analysis.status === 'approved') &&
        analysis.feedback_score === null && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-txt-muted">Resultado?</span>
            <button
              onClick={() => onFeedback(analysis.id, 5)}
              className="p-1 rounded hover:bg-emerald-50 text-emerald-500"
            >
              <ThumbsUp size={13} />
            </button>
            <button
              onClick={() => onFeedback(analysis.id, 2)}
              className="p-1 rounded hover:bg-red-50 text-red-400"
            >
              <ThumbsDown size={13} />
            </button>
          </div>
        )}
    </div>
  );
}
