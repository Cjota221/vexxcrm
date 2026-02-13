'use client';

import { useState } from 'react';
import {
  Brain,
  Crown,
  Heart,
  TrendingUp,
  UserPlus,
  Star,
  Bell,
  Moon,
  AlertTriangle,
  AlertOctagon,
  PauseCircle,
  UserX,
  Users,
  Zap,
  Target,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Info,
} from 'lucide-react';
import type { RFMSegmentName } from '@/lib/rfm-segments';
import { RFM_ACTIONS } from '@/lib/rfm-segments';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TIPOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface SegmentData {
  count: number;
  avg_churn: number;
  vip_count: number;
  risk_count: number;
}

interface SegmentGridProps {
  distribution: Record<string, SegmentData>;
  totalClients: number;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CONFIG DOS SEGMENTOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const SEGMENT_CONFIG: Record<string, {
  label: string;
  labelPt: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  priority: number;
}> = {
  'Champions': {
    label: 'Champions',
    labelPt: 'Campeões',
    icon: <Crown size={20} />,
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    priority: 1,
  },
  'Loyal Customers': {
    label: 'Loyal Customers',
    labelPt: 'Clientes Fiéis',
    icon: <Heart size={20} />,
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    priority: 2,
  },
  'Potential Loyalist': {
    label: 'Potential Loyalist',
    labelPt: 'Potencial Fiel',
    icon: <TrendingUp size={20} />,
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    priority: 3,
  },
  'New Customers': {
    label: 'New Customers',
    labelPt: 'Novos Clientes',
    icon: <UserPlus size={20} />,
    color: 'text-cyan-700',
    bgColor: 'bg-cyan-50',
    borderColor: 'border-cyan-200',
    priority: 4,
  },
  'Promising': {
    label: 'Promising',
    labelPt: 'Promissores',
    icon: <Star size={20} />,
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    priority: 5,
  },
  'Need Attention': {
    label: 'Need Attention',
    labelPt: 'Precisa Atenção',
    icon: <Bell size={20} />,
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    priority: 6,
  },
  'About To Sleep': {
    label: 'About To Sleep',
    labelPt: 'Quase Dormindo',
    icon: <Moon size={20} />,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-100',
    priority: 7,
  },
  'At Risk': {
    label: 'At Risk',
    labelPt: 'Em Risco',
    icon: <AlertTriangle size={20} />,
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    priority: 8,
  },
  'Cant Lose Them': {
    label: 'Cant Lose Them',
    labelPt: 'Não Posso Perder',
    icon: <AlertOctagon size={20} />,
    color: 'text-red-800',
    bgColor: 'bg-red-100',
    borderColor: 'border-red-300',
    priority: 9,
  },
  'Hibernating': {
    label: 'Hibernating',
    labelPt: 'Hibernando',
    icon: <PauseCircle size={20} />,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    priority: 10,
  },
  'Lost': {
    label: 'Lost',
    labelPt: 'Perdidos',
    icon: <UserX size={20} />,
    color: 'text-gray-500',
    bgColor: 'bg-gray-100',
    borderColor: 'border-gray-200',
    priority: 11,
  },
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   COMPONENTE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function SegmentGrid({ distribution, totalClients }: SegmentGridProps) {
  const [expandedSegment, setExpandedSegment] = useState<string | null>(null);

  // Ordenar segmentos por prioridade
  const sortedSegments = Object.entries(distribution)
    .sort(([a], [b]) => {
      const pa = SEGMENT_CONFIG[a]?.priority ?? 99;
      const pb = SEGMENT_CONFIG[b]?.priority ?? 99;
      return pa - pb;
    });

  // Todos os segmentos (mesmo vazios)
  const allSegments = Object.keys(SEGMENT_CONFIG).map(name => {
    const data = distribution[name] || { count: 0, avg_churn: 0, vip_count: 0, risk_count: 0 };
    return { name, data };
  });

  return (
    <div className="bg-white rounded-2xl border border-surface-border shadow-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b border-surface-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-crm-primary/10 flex items-center justify-center">
              <Users size={20} className="text-crm-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-txt-primary">Segmentos RFM</h3>
              <p className="text-xs text-txt-muted">Distribuição dos {totalClients} clientes em 11 segmentos</p>
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {allSegments.map(({ name, data }) => {
          const config = SEGMENT_CONFIG[name];
          if (!config) return null;

          const pct = totalClients > 0 ? ((data.count / totalClients) * 100).toFixed(1) : '0';
          const isExpanded = expandedSegment === name;
          const actions = RFM_ACTIONS[name as RFMSegmentName] || [];

          return (
            <div
              key={name}
              className={`
                rounded-xl border ${config.borderColor} ${config.bgColor}
                transition-all duration-200 cursor-pointer
                ${isExpanded ? 'ring-2 ring-crm-primary/30 col-span-1 sm:col-span-2' : 'hover:shadow-md'}
              `}
              onClick={() => setExpandedSegment(isExpanded ? null : name)}
            >
              <div className="p-4">
                {/* Cabeçalho do card */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={config.color}>{config.icon}</span>
                    <div>
                      <p className={`text-sm font-semibold ${config.color}`}>{config.labelPt}</p>
                      <p className="text-[10px] text-txt-muted">{config.label}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-txt-primary">{data.count}</p>
                    <p className="text-[10px] text-txt-muted">{pct}%</p>
                  </div>
                </div>

                {/* Barra de progresso */}
                <div className="w-full h-2 bg-white/50 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      config.priority <= 3 ? 'bg-green-500' :
                      config.priority <= 5 ? 'bg-blue-500' :
                      config.priority <= 7 ? 'bg-orange-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${Math.max(parseFloat(pct), 2)}%` }}
                  />
                </div>

                {/* Métricas rápidas */}
                <div className="flex items-center gap-3 text-[11px] text-txt-muted">
                  {data.vip_count > 0 && (
                    <span className="flex items-center gap-1">
                      <Crown size={12} className="text-yellow-500" />
                      {data.vip_count} VIP
                    </span>
                  )}
                  {data.risk_count > 0 && (
                    <span className="flex items-center gap-1">
                      <ShieldAlert size={12} className="text-red-500" />
                      {data.risk_count} risco
                    </span>
                  )}
                  {data.avg_churn > 0 && (
                    <span className="flex items-center gap-1">
                      {data.avg_churn > 50 ? (
                        <ArrowDownRight size={12} className="text-red-500" />
                      ) : data.avg_churn > 20 ? (
                        <Minus size={12} className="text-orange-500" />
                      ) : (
                        <ArrowUpRight size={12} className="text-green-500" />
                      )}
                      {data.avg_churn}% churn
                    </span>
                  )}
                </div>

                {/* Ações expandidas */}
                {isExpanded && actions.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/50">
                    <p className="text-[11px] font-semibold text-txt-secondary mb-2 flex items-center gap-1">
                      <Zap size={12} /> Ações Recomendadas
                    </p>
                    <ul className="space-y-1">
                      {actions.map((action, i) => (
                        <li key={i} className="text-[11px] text-txt-secondary flex items-start gap-1.5">
                          <Target size={10} className="shrink-0 mt-0.5" />
                          {action}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
