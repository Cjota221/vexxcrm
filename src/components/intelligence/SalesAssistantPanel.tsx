'use client';

import {
  MessageSquare,
  Star,
  AlertTriangle,
  TrendingUp,
  Clock,
  ShoppingBag,
  Gift,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { useClientInsight } from '@/hooks/useIntelligence';

interface SalesAssistantPanelProps {
  clientId: string | null;
  compact?: boolean;
}

const URGENCY_STYLES = {
  low: 'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
};

const URGENCY_LABELS = {
  low: '🟢 Normal',
  medium: '🟡 Atenção',
  high: '🟠 Alta',
  critical: '🔴 Crítica',
};

export function SalesAssistantPanel({ clientId, compact = false }: SalesAssistantPanelProps) {
  const { data: insight, isLoading, error } = useClientInsight(clientId);

  if (!clientId) {
    return (
      <div className="bg-white rounded-2xl border border-surface-border p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-linear-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
            <MessageSquare size={20} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-txt-primary">Assistente de Vendas</h3>
            <p className="text-xs text-txt-muted">Selecione um cliente para ver insights</p>
          </div>
        </div>
        <div className="text-center py-8">
          <MessageSquare size={32} className="mx-auto text-surface-border mb-2" />
          <p className="text-sm text-txt-muted">
            Insights em tempo real para o atendimento
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-surface-border p-5 shadow-sm">
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-emerald-500" />
          <span className="ml-2 text-sm text-txt-muted">Gerando insights...</span>
        </div>
      </div>
    );
  }

  if (error || !insight) {
    return (
      <div className="bg-white rounded-2xl border border-surface-border p-5 shadow-sm">
        <p className="text-sm text-red-500 text-center py-4">
          {error instanceof Error ? error.message : 'Erro ao carregar insight'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-surface-border p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-linear-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
            <MessageSquare size={20} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-txt-primary">
              {insight.client_name}
              {insight.flags.is_vip && <Star size={14} className="inline ml-1 text-yellow-500" />}
            </h3>
            <p className="text-xs text-txt-muted">{insight.summary}</p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${URGENCY_STYLES[insight.urgency]}`}>
          {URGENCY_LABELS[insight.urgency]}
        </span>
      </div>

      {/* Flags */}
      <div className="flex flex-wrap gap-1.5">
        {insight.flags.is_vip && (
          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-[10px] font-medium">⭐ VIP</span>
        )}
        {insight.flags.is_at_risk && (
          <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-[10px] font-medium">⚠️ Risco</span>
        )}
        {insight.flags.needs_attention && (
          <span className="px-2 py-0.5 bg-orange-100 text-orange-800 rounded-full text-[10px] font-medium">👁 Atenção</span>
        )}
        {insight.flags.upsell_ready && (
          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[10px] font-medium">⬆️ Upsell</span>
        )}
      </div>

      {/* RFM + Purchase quick view */}
      {!compact && (
        <div className="grid grid-cols-2 gap-2">
          {insight.rfm && (
            <>
              <InfoCard
                icon={<TrendingUp size={14} className="text-violet-500" />}
                label="Segmento RFM"
                value={insight.rfm.segment}
              />
              <InfoCard
                icon={<AlertTriangle size={14} className="text-orange-500" />}
                label="Prob. Churn"
                value={`${insight.rfm.churn_probability}%`}
              />
            </>
          )}
          <InfoCard
            icon={<ShoppingBag size={14} className="text-blue-500" />}
            label="Total Pedidos"
            value={String(insight.purchase.total_orders)}
          />
          <InfoCard
            icon={<Clock size={14} className="text-gray-500" />}
            label="Ticket Médio"
            value={`R$ ${insight.purchase.avg_ticket.toFixed(0)}`}
          />
        </div>
      )}

      {/* Script de vendas */}
      <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200">
        <h4 className="text-xs font-bold text-emerald-800 mb-2">📋 Script Sugerido</h4>
        <p className="text-xs text-emerald-700 mb-2 italic">
          &ldquo;{insight.script.greeting}&rdquo;
        </p>
        {insight.script.talking_points.length > 0 && (
          <div className="space-y-1 mb-2">
            {insight.script.talking_points.map((point, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <ChevronRight size={10} className="text-emerald-500 mt-0.5 shrink-0" />
                <span className="text-[11px] text-emerald-700">{point}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ofertas sugeridas */}
      {insight.script.offers.length > 0 && (
        <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
          <h4 className="text-xs font-bold text-blue-800 mb-1.5">💡 Sugestões de Oferta</h4>
          {insight.script.offers.map((offer, i) => (
            <div key={i} className="flex items-start gap-1.5 mb-1">
              <Gift size={10} className="text-blue-500 mt-0.5 shrink-0" />
              <span className="text-[11px] text-blue-700">{offer}</span>
            </div>
          ))}
        </div>
      )}

      {/* Cross-sell */}
      {insight.cross_sell.length > 0 && !compact && (
        <div>
          <h4 className="text-xs font-bold text-txt-primary mb-2">🤝 Cross-Sell</h4>
          <div className="space-y-1">
            {insight.cross_sell.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-surface-50">
                <div>
                  <p className="text-xs font-medium text-txt-primary">{item.product_name}</p>
                  <p className="text-[10px] text-txt-muted">{item.reason}</p>
                </div>
                <span className="text-[10px] font-bold text-indigo-600">
                  {item.confidence.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cautelas */}
      {insight.script.caution.length > 0 && (
        <div className="bg-red-50 rounded-xl p-3 border border-red-200">
          <h4 className="text-xs font-bold text-red-800 mb-1.5">⚠️ Cuidados</h4>
          {insight.script.caution.map((c, i) => (
            <p key={i} className="text-[11px] text-red-700 mb-0.5">{c}</p>
          ))}
        </div>
      )}

      {/* Seasonal */}
      {insight.seasonal?.is_seasonal_buyer && insight.seasonal.upcoming_event && (
        <div className="bg-purple-50 rounded-xl p-3 border border-purple-200">
          <p className="text-[11px] text-purple-700">
            🗓️ <strong>{insight.seasonal.upcoming_event}</strong> em {insight.seasonal.days_until_event} dias
            — cliente sazonal, aproveite!
          </p>
        </div>
      )}
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-xl bg-surface-50 border border-surface-border">
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon}
        <span className="text-[10px] text-txt-muted">{label}</span>
      </div>
      <p className="text-sm font-bold text-txt-primary">{value}</p>
    </div>
  );
}
