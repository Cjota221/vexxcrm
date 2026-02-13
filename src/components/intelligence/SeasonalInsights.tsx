'use client';

import { useState } from 'react';
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  Gift,
  Loader2,
  BarChart3,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useSeasonalInsights, useCalculateSeasonal } from '@/hooks/useIntelligence';

const SEASON_ICONS: Record<string, string> = {
  carnaval: '🎭',
  dia_mulher: '💐',
  pascoa: '🐰',
  dia_maes: '💝',
  dia_namorados: '💑',
  dia_pais: '👔',
  dia_criancas: '🧸',
  black_friday: '🏷️',
  natal: '🎄',
  ano_novo: '🎆',
};

export function SeasonalInsights() {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, error } = useSeasonalInsights();
  const calculateSeasonal = useCalculateSeasonal();

  const insights = data?.insights || [];
  const stats = data?.stats;
  const hasData = insights.length > 0;

  return (
    <div className="bg-white rounded-2xl border border-surface-border p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-linear-to-br from-orange-400 to-pink-500 flex items-center justify-center">
            <Calendar size={20} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-txt-primary">Análise Sazonal</h3>
            <p className="text-xs text-txt-muted">
              {stats ? `${stats.seasonal_buyers} compradores sazonais (${stats.coverage_pct}%)` : 'Datas comerciais e padrões'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => calculateSeasonal.mutate()}
            disabled={calculateSeasonal.isPending}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors disabled:opacity-50"
          >
            {calculateSeasonal.isPending ? (
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
      {calculateSeasonal.isSuccess && (
        <div className="mb-3 p-2 rounded-lg bg-green-50 border border-green-200">
          <p className="text-xs text-green-700">✅ Análise sazonal calculada com sucesso!</p>
        </div>
      )}
      {calculateSeasonal.isError && (
        <div className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200">
          <p className="text-xs text-red-700">❌ Erro: {calculateSeasonal.error?.message || 'Falha ao calcular'}</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-orange-500" />
        </div>
      ) : error ? (
        <div className="text-center py-6">
          <p className="text-sm text-red-500">Erro ao carregar dados sazonais</p>
        </div>
      ) : !hasData ? (
        <div className="text-center py-6">
          <Gift size={32} className="mx-auto text-surface-border mb-2" />
          <p className="text-sm text-txt-muted">
            Clique em &ldquo;Calcular&rdquo; para analisar padrões sazonais
          </p>
        </div>
      ) : (
        <>
          {/* Grid de eventos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {insights.slice(0, expanded ? insights.length : 6).map((insight) => (
              <div
                key={insight.event_slug}
                className="p-3 rounded-xl bg-surface-50 border border-surface-border hover:border-orange-200 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{SEASON_ICONS[insight.event_slug] || '📅'}</span>
                  <span className="text-xs font-semibold text-txt-primary truncate">
                    {insight.event_name}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-txt-muted">Receita</span>
                    <span className="text-xs font-bold text-txt-primary">
                      R$ {(insight.total_revenue / 1000).toFixed(1)}k
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-txt-muted">Pedidos</span>
                    <span className="text-xs font-medium">{insight.total_orders}</span>
                  </div>
                  {insight.yoy_growth !== null && (
                    <div className="flex items-center gap-1">
                      {insight.yoy_growth >= 0 ? (
                        <TrendingUp size={12} className="text-green-600" />
                      ) : (
                        <TrendingDown size={12} className="text-red-500" />
                      )}
                      <span className={`text-xs font-medium ${
                        insight.yoy_growth >= 0 ? 'text-green-600' : 'text-red-500'
                      }`}>
                        {insight.yoy_growth > 0 ? '+' : ''}{insight.yoy_growth}% YoY
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Resumo */}
          {insights.length > 0 && (
            <div className="mt-4 pt-3 border-t border-surface-border">
              <div className="flex items-center gap-4 text-xs text-txt-muted">
                <div className="flex items-center gap-1">
                  <BarChart3 size={12} />
                  <span>
                    Total: R$ {(insights.reduce((s, i) => s + i.total_revenue, 0) / 1000).toFixed(1)}k
                  </span>
                </div>
                <div>
                  {insights.reduce((s, i) => s + i.total_orders, 0)} pedidos sazonais
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
