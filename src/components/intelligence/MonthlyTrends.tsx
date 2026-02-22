'use client';

/**
 * MonthlyTrends — Comportamento de compra mensal histórico
 *
 * Analisa pedidos de anos anteriores, agrupados por mês, mostrando:
 * - Ranking dos meses mais fortes
 * - Comparação ano a ano (mesmo mês)
 * - Gráfico de barras com todos os meses
 * - Padrão do dia atual em meses anteriores
 * - Insights automáticos para decisões de campanha
 */

import { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  CalendarDays,
  Minus,
  ChevronDown,
  Lightbulb,
  Trophy,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { useMonthlyTrends } from '@/hooks/useIntelligence';
import { formatCurrency, cn } from '@/lib/utils';

/* ─── helpers ─────────────────────────────────────────────── */

function GrowthBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[10px] text-gray-400">—</span>;
  const positive = value > 0;
  const neutral = value === 0;
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full',
      neutral ? 'bg-gray-100 text-gray-500' :
      positive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
    )}>
      {neutral ? <Minus size={9} /> : positive ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {positive ? '+' : ''}{value}%
    </span>
  );
}

/* ─── Componente principal ────────────────────────────────── */

export function MonthlyTrends() {
  const { data, isLoading } = useMonthlyTrends();
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'ranking' | 'chart' | 'day'>('ranking');

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-surface-border shadow-sm p-6 flex items-center gap-3">
        <BarChart3 size={20} className="text-crm-primary animate-pulse" />
        <span className="text-sm text-txt-muted">Analisando histórico mensal...</span>
      </div>
    );
  }

  if (!data || data.years_analyzed.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-surface-border shadow-sm p-6 text-center">
        <BarChart3 size={32} className="text-gray-200 mx-auto mb-2" />
        <p className="text-sm text-txt-muted">Nenhum histórico encontrado em anos anteriores.</p>
      </div>
    );
  }

  const maxOrders = Math.max(...data.monthly_summary.map(m => m.avg_orders_per_year), 1);
  const { month_comparison, reference_date } = data;

  return (
    <div className="bg-white rounded-2xl border border-surface-border shadow-sm overflow-hidden">

      {/* ── Header clicável ──────────────────────────────────── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-5 py-4 bg-linear-to-r from-indigo-600 to-blue-700 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <BarChart3 size={18} className="text-white" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-bold text-white">Comportamento Mensal</h3>
            <p className="text-[11px] text-white/70">
              {data.years_analyzed.length} ano{data.years_analyzed.length > 1 ? 's' : ''} analisado{data.years_analyzed.length > 1 ? 's' : ''} · {data.total_orders_analyzed.toLocaleString('pt-BR')} pedidos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* KPI rápido: melhor mês */}
          {data.best_months[0] && (
            <div className="text-right hidden sm:block">
              <p className="text-sm font-black text-white">{data.best_months[0].month_name}</p>
              <p className="text-[10px] text-white/60">mês mais forte</p>
            </div>
          )}
          <ChevronDown
            size={18}
            className={cn('text-white/70 transition-transform duration-200', expanded && 'rotate-180')}
          />
        </div>
      </button>

      {expanded && (
        <div className="p-5 space-y-5">

          {/* ── Insights automáticos ─────────────────────────── */}
          {data.insights.length > 0 && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-1.5">
              <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Lightbulb size={11} /> Insights automáticos
              </p>
              {data.insights.map((insight, i) => (
                <p key={i} className="text-xs text-indigo-800">{insight}</p>
              ))}
            </div>
          )}

          {/* ── Comparação: esse mês vs ano anterior ─────────── */}
          {month_comparison && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                <p className="text-[10px] text-gray-500 mb-1">
                  {month_comparison.current_month_name} / {month_comparison.prev_year.year}
                </p>
                <p className="text-base font-black text-gray-800">
                  {month_comparison.prev_year.orders} pedidos
                </p>
                <p className="text-[10px] text-gray-400">
                  {formatCurrency(month_comparison.prev_year.revenue)}
                </p>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                <p className="text-[10px] text-gray-500 mb-1 flex items-center justify-between">
                  {month_comparison.current_month_name} / {month_comparison.two_years_ago.year}
                  <GrowthBadge value={month_comparison.growth_orders_yoy} />
                </p>
                <p className="text-base font-black text-gray-800">
                  {month_comparison.two_years_ago.orders} pedidos
                </p>
                <p className="text-[10px] text-gray-400">
                  {formatCurrency(month_comparison.two_years_ago.revenue)}
                </p>
              </div>
            </div>
          )}

          {/* ── Tabs ─────────────────────────────────────────── */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {(['ranking', 'chart', 'day'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'flex-1 text-[11px] font-semibold py-1.5 rounded-lg transition-all',
                  activeTab === tab
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {tab === 'ranking' ? '🏆 Ranking' : tab === 'chart' ? '📊 Gráfico' : `📅 Dia ${reference_date.day}`}
              </button>
            ))}
          </div>

          {/* ── Tab: Ranking dos meses ───────────────────────── */}
          {activeTab === 'ranking' && (
            <div className="space-y-2">
              {data.best_months.slice(0, 12).map((m) => {
                const pct = maxOrders > 0 ? (m.avg_orders_per_year / maxOrders) * 100 : 0;
                const isTop = m.rank <= 3;
                return (
                  <div key={m.month} className="flex items-center gap-3">
                    {/* Posição */}
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0',
                      m.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                      m.rank === 2 ? 'bg-gray-200 text-gray-600' :
                      m.rank === 3 ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-400'
                    )}>
                      {m.rank === 1 ? '🥇' : m.rank === 2 ? '🥈' : m.rank === 3 ? '🥉' : m.rank}
                    </div>

                    {/* Nome do mês */}
                    <span className={cn('text-xs font-semibold w-8 shrink-0', isTop ? 'text-gray-800' : 'text-gray-500')}>
                      {m.month_name}
                    </span>

                    {/* Barra */}
                    <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          m.rank === 1 ? 'bg-indigo-500' :
                          m.rank <= 3 ? 'bg-indigo-400' : 'bg-indigo-200'
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {/* Valor */}
                    <span className="text-[11px] text-gray-500 w-14 text-right shrink-0">
                      ~{m.avg_orders_per_year}/ano
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Tab: Gráfico por ano ─────────────────────────── */}
          {activeTab === 'chart' && (
            <div className="space-y-4">
              {data.yearly_monthly.slice(0, 3).map(yr => {
                const maxOrd = Math.max(...yr.months.map(m => m.orders), 1);
                return (
                  <div key={yr.year}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-gray-700">{yr.year}</span>
                      <span className="text-[10px] text-gray-400">
                        {yr.total_orders} pedidos · {formatCurrency(yr.total_revenue)}
                      </span>
                    </div>
                    <div className="flex items-end gap-0.5 h-14">
                      {yr.months.map(m => {
                        const pct = (m.orders / maxOrd) * 100;
                        const isCurrent = m.month === reference_date.month;
                        return (
                          <div
                            key={m.month}
                            className="flex-1 flex flex-col items-center gap-0.5"
                            title={`${m.month_name}: ${m.orders} pedidos · ${formatCurrency(m.revenue)}`}
                          >
                            <div
                              className={cn(
                                'w-full rounded-t-sm transition-all',
                                isCurrent ? 'bg-indigo-500' :
                                pct >= 80 ? 'bg-indigo-400' :
                                pct >= 40 ? 'bg-indigo-300' : 'bg-indigo-100'
                              )}
                              style={{ height: `${Math.max(pct * 0.48, m.orders > 0 ? 4 : 1)}px` }}
                            />
                            <span className={cn(
                              'text-[8px] leading-none',
                              isCurrent ? 'text-indigo-600 font-bold' : 'text-gray-400'
                            )}>
                              {m.month_name.slice(0, 1)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Legenda */}
              <p className="text-[10px] text-gray-400 text-center">
                Barra destacada = mês atual ({data.reference_date.month_name})
              </p>
            </div>
          )}

          {/* ── Tab: Padrão do dia em meses anteriores ────────── */}
          {activeTab === 'day' && (
            <div className="space-y-2">
              {data.day_of_month_pattern.length === 0 ? (
                <div className="text-center py-6">
                  <CalendarDays size={28} className="text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">
                    Nenhum pedido no dia {reference_date.day} em meses anteriores.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-[10px] text-gray-400 flex items-center gap-1.5 mb-3">
                    <AlertCircle size={11} />
                    Pedidos registrados no dia <strong>{reference_date.day}</strong> em outros meses
                  </p>
                  {data.day_of_month_pattern.map((entry, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl">
                      <div className="flex items-center gap-2">
                        <CalendarDays size={13} className="text-indigo-400 shrink-0" />
                        <span className="text-xs font-semibold text-gray-800">
                          {reference_date.day}/{String(entry.month).padStart(2, '0')}/{entry.year}
                        </span>
                        <span className="text-[10px] text-gray-400">{entry.month_name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-right">
                        <span className="text-[11px] font-bold text-gray-700">
                          {entry.orders} pedido{entry.orders > 1 ? 's' : ''}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {formatCurrency(entry.revenue)}
                        </span>
                      </div>
                    </div>
                  ))}
                  <p className="text-[10px] text-gray-400 text-center pt-1">
                    {data.day_of_month_pattern.reduce((s, e) => s + e.orders, 0)} pedidos totais no dia {reference_date.day} ao longo do histórico
                  </p>
                </>
              )}
            </div>
          )}

          {/* ── CTA: sugestão de campanha ─────────────────────── */}
          {data.best_months[0] && activeTab === 'ranking' && (
            <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
              <div>
                <p className="text-xs font-semibold text-indigo-800">
                  <Trophy size={11} className="inline mr-1" />
                  Próximo pico previsto
                </p>
                <p className="text-[10px] text-indigo-600">
                  Prepare campanhas para{' '}
                  {data.best_months
                    .filter(m => m.month > reference_date.month)
                    .slice(0, 2)
                    .map(m => m.month_name)
                    .join(' e ') || data.best_months[0].month_name}
                </p>
              </div>
              <ArrowRight size={16} className="text-indigo-400" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
