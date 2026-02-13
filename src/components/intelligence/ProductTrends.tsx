'use client';

import { useState } from 'react';
import {
  Package,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  Link2,
  ChevronDown,
  ChevronUp,
  Zap,
} from 'lucide-react';
import { useProductTrends, useProductAffinity, useCalculateProducts } from '@/hooks/useIntelligence';

type TabType = 'trends' | 'affinity';

export function ProductTrends() {
  const [tab, setTab] = useState<TabType>('trends');
  const [expanded, setExpanded] = useState(false);

  const { data: trendsData, isLoading: trendsLoading } = useProductTrends();
  const { data: affinityData, isLoading: affinityLoading } = useProductAffinity();
  const calculateProducts = useCalculateProducts();

  const isLoading = trendsLoading || affinityLoading;
  const trends = trendsData?.trends;
  const affinity = affinityData?.affinity || [];

  const trendIcon = (dir: string) => {
    if (dir === 'growing') return <TrendingUp size={14} className="text-green-600" />;
    if (dir === 'declining') return <TrendingDown size={14} className="text-red-500" />;
    return <Minus size={14} className="text-gray-400" />;
  };

  return (
    <div className="bg-white rounded-2xl border border-surface-border p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <Package size={20} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-txt-primary">Inteligência de Produto</h3>
            <p className="text-xs text-txt-muted">Tendências, afinidade e cross-sell</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => calculateProducts.mutate()}
            disabled={calculateProducts.isPending}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
          >
            {calculateProducts.isPending ? (
              <span className="flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" />
                Calculando...
              </span>
            ) : (
              '⚡ Calcular'
            )}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg hover:bg-surface-50 transition-colors"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Status messages */}
      {calculateProducts.isSuccess && (
        <div className="mb-3 p-2 rounded-lg bg-green-50 border border-green-200">
          <p className="text-xs text-green-700">✅ Inteligência de produto calculada com sucesso!</p>
        </div>
      )}
      {calculateProducts.isError && (
        <div className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200">
          <p className="text-xs text-red-700">❌ Erro: {calculateProducts.error?.message || 'Falha ao calcular'}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-surface-50 rounded-lg p-0.5">
        <button
          onClick={() => setTab('trends')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
            tab === 'trends'
              ? 'bg-white text-txt-primary shadow-sm'
              : 'text-txt-muted hover:text-txt-secondary'
          }`}
        >
          <TrendingUp size={12} />
          Tendências
        </button>
        <button
          onClick={() => setTab('affinity')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
            tab === 'affinity'
              ? 'bg-white text-txt-primary shadow-sm'
              : 'text-txt-muted hover:text-txt-secondary'
          }`}
        >
          <Link2 size={12} />
          Afinidade
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-blue-500" />
        </div>
      ) : tab === 'trends' ? (
        /* ── TRENDS TAB ── */
        <div className="space-y-3">
          {/* Top Sellers */}
          {trends?.top_sellers && trends.top_sellers.length > 0 ? (
            <div className="space-y-2">
              {trends.top_sellers.slice(0, expanded ? 20 : 5).map((product, idx) => (
                <div
                  key={`${product.product_name}-${idx}`}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-surface-50 hover:bg-blue-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-xs font-bold text-txt-muted w-5 text-right">
                      #{idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-txt-primary truncate">
                        {product.product_name}
                      </p>
                      <p className="text-[10px] text-txt-muted">
                        {product.category || 'Sem categoria'} · {product.unique_buyers} compradores
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-xs font-bold text-txt-primary">
                        R$ {(product.total_revenue / 1000).toFixed(1)}k
                      </p>
                      <p className="text-[10px] text-txt-muted">{product.total_quantity} un</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {trendIcon(product.trend_direction)}
                      {product.qty_growth_pct !== null && (
                        <span className={`text-[10px] font-medium ${
                          product.qty_growth_pct >= 0 ? 'text-green-600' : 'text-red-500'
                        }`}>
                          {product.qty_growth_pct > 0 ? '+' : ''}{product.qty_growth_pct}%
                        </span>
                      )}
                    </div>
                    {/* Velocity bar */}
                    <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-linear-to-r from-blue-400 to-indigo-500"
                        style={{ width: `${Math.min(100, product.velocity_score)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <Package size={28} className="mx-auto text-surface-border mb-2" />
              <p className="text-sm text-txt-muted">Clique em &ldquo;Calcular&rdquo; para gerar tendências</p>
            </div>
          )}
        </div>
      ) : (
        /* ── AFFINITY TAB ── */
        <div className="space-y-2">
          {affinity.length > 0 ? (
            affinity.slice(0, expanded ? 20 : 5).map((pair, idx) => (
              <div
                key={`${pair.product_a_name}-${pair.product_b_name}-${idx}`}
                className="flex items-center justify-between p-2.5 rounded-xl bg-surface-50 hover:bg-indigo-50/50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Link2 size={14} className="text-indigo-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-txt-primary truncate">
                      {pair.product_a_name}
                    </p>
                    <p className="text-[10px] text-indigo-500">
                      + {pair.product_b_name}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-xs font-bold text-txt-primary">{pair.co_purchase_count}x</p>
                    <p className="text-[10px] text-txt-muted">juntos</p>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100">
                    <Zap size={10} className="text-indigo-600" />
                    <span className="text-[10px] font-bold text-indigo-700">
                      {pair.affinity_score.toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-6">
              <Link2 size={28} className="mx-auto text-surface-border mb-2" />
              <p className="text-sm text-txt-muted">Calcule para ver pares de afinidade</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
