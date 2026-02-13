'use client';

import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Crown,
  Heart,
  UserPlus,
  Star,
  AlertTriangle,
  UserX,
  PauseCircle,
} from 'lucide-react';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TIPOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface RFMChartProps {
  distribution: Record<string, number>;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CONFIG
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const SEGMENT_COLORS: Record<string, { bar: string; bg: string; label: string }> = {
  'Champions': { bar: 'bg-yellow-500', bg: 'bg-yellow-50', label: 'Campeões' },
  'Loyal Customers': { bar: 'bg-green-500', bg: 'bg-green-50', label: 'Fiéis' },
  'Potential Loyalist': { bar: 'bg-blue-500', bg: 'bg-blue-50', label: 'Pot. Fiéis' },
  'New Customers': { bar: 'bg-cyan-500', bg: 'bg-cyan-50', label: 'Novos' },
  'Promising': { bar: 'bg-purple-500', bg: 'bg-purple-50', label: 'Promissores' },
  'Need Attention': { bar: 'bg-orange-500', bg: 'bg-orange-50', label: 'Atenção' },
  'About To Sleep': { bar: 'bg-red-400', bg: 'bg-red-50', label: 'Dormindo' },
  'At Risk': { bar: 'bg-red-600', bg: 'bg-red-50', label: 'Em Risco' },
  'Cant Lose Them': { bar: 'bg-red-800', bg: 'bg-red-100', label: 'Não Perder' },
  'Hibernating': { bar: 'bg-gray-400', bg: 'bg-gray-50', label: 'Hibernando' },
  'Lost': { bar: 'bg-gray-300', bg: 'bg-gray-100', label: 'Perdidos' },
};

const ORDER = [
  'Champions', 'Loyal Customers', 'Potential Loyalist', 'New Customers',
  'Promising', 'Need Attention', 'About To Sleep', 'At Risk',
  'Cant Lose Them', 'Hibernating', 'Lost'
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   COMPONENTE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function RFMChart({ distribution }: RFMChartProps) {
  const total = Object.values(distribution).reduce((s, v) => s + v, 0);
  const maxCount = Math.max(...Object.values(distribution), 1);

  // Agrupar em categorias
  const healthy = (distribution['Champions'] || 0) +
    (distribution['Loyal Customers'] || 0) +
    (distribution['Potential Loyalist'] || 0);
  const growing = (distribution['New Customers'] || 0) +
    (distribution['Promising'] || 0);
  const atRisk = (distribution['Need Attention'] || 0) +
    (distribution['About To Sleep'] || 0) +
    (distribution['At Risk'] || 0) +
    (distribution['Cant Lose Them'] || 0);
  const inactive = (distribution['Hibernating'] || 0) +
    (distribution['Lost'] || 0);

  const healthyPct = total > 0 ? ((healthy / total) * 100).toFixed(0) : '0';
  const growingPct = total > 0 ? ((growing / total) * 100).toFixed(0) : '0';
  const atRiskPct = total > 0 ? ((atRisk / total) * 100).toFixed(0) : '0';
  const inactivePct = total > 0 ? ((inactive / total) * 100).toFixed(0) : '0';

  return (
    <div className="bg-white rounded-2xl border border-surface-border shadow-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b border-surface-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
            <BarChart3 size={20} className="text-violet-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-txt-primary">Distribuição RFM</h3>
            <p className="text-xs text-txt-muted">{total} clientes segmentados</p>
          </div>
        </div>
      </div>

      {/* Resumo em categorias */}
      <div className="px-6 py-3 grid grid-cols-4 gap-2 border-b border-surface-border">
        <div className="text-center p-2 rounded-lg bg-green-50">
          <p className="text-lg font-bold text-green-700">{healthyPct}%</p>
          <p className="text-[10px] text-green-600 font-medium">Saudáveis</p>
          <p className="text-[10px] text-txt-muted">{healthy} clientes</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-blue-50">
          <p className="text-lg font-bold text-blue-700">{growingPct}%</p>
          <p className="text-[10px] text-blue-600 font-medium">Crescendo</p>
          <p className="text-[10px] text-txt-muted">{growing} clientes</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-orange-50">
          <p className="text-lg font-bold text-orange-700">{atRiskPct}%</p>
          <p className="text-[10px] text-orange-600 font-medium">Em Risco</p>
          <p className="text-[10px] text-txt-muted">{atRisk} clientes</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-gray-50">
          <p className="text-lg font-bold text-gray-600">{inactivePct}%</p>
          <p className="text-[10px] text-gray-500 font-medium">Inativos</p>
          <p className="text-[10px] text-txt-muted">{inactive} clientes</p>
        </div>
      </div>

      {/* Barras horizontais */}
      <div className="p-4 space-y-2">
        {ORDER.map(segment => {
          const count = distribution[segment] || 0;
          const config = SEGMENT_COLORS[segment];
          if (!config) return null;
          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
          const barWidth = maxCount > 0 ? Math.max((count / maxCount) * 100, count > 0 ? 3 : 0) : 0;

          return (
            <div key={segment} className="flex items-center gap-3">
              <div className="w-24 shrink-0">
                <p className="text-[11px] font-medium text-txt-secondary truncate">{config.label}</p>
              </div>
              <div className="flex-1 h-6 bg-surface-50 rounded-full overflow-hidden">
                <div
                  className={`h-full ${config.bar} rounded-full transition-all duration-700 flex items-center justify-end pr-2`}
                  style={{ width: `${barWidth}%` }}
                >
                  {count > 0 && barWidth > 15 && (
                    <span className="text-[10px] font-bold text-white">{count}</span>
                  )}
                </div>
              </div>
              <div className="w-14 text-right shrink-0">
                <span className="text-xs font-medium text-txt-secondary">{count}</span>
                <span className="text-[10px] text-txt-muted ml-1">({pct}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
