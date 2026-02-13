'use client';

import {
  Crown,
  ShieldAlert,
  Bell,
  TrendingUp,
  Activity,
  BarChart3,
  DollarSign,
  Brain,
  Gauge,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TIPOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface KPIs {
  vip_count: number;
  risk_count: number;
  attention_count: number;
  upsell_count: number;
  avg_churn_probability: number;
  avg_purchase_prob_30d: number;
  total_ltv_projected_12m: number;
  avg_sentiment: number;
}

interface RFMOverviewProps {
  kpis: KPIs;
  totalCalculated: number;
  totalClients: number;
  coveragePct: number;
  lastCalculatedAt: string | null;
  events7d: number;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   COMPONENTE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function RFMOverview({ kpis, totalCalculated, totalClients, coveragePct, lastCalculatedAt, events7d }: RFMOverviewProps) {
  const cards = [
    {
      label: 'Clientes VIP',
      value: kpis.vip_count,
      icon: <Crown size={20} />,
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
      border: 'border-yellow-100',
      suffix: '',
      description: 'Campeões + Fiéis',
    },
    {
      label: 'Em Risco',
      value: kpis.risk_count,
      icon: <ShieldAlert size={20} />,
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-100',
      suffix: '',
      description: 'Precisam atenção urgente',
    },
    {
      label: 'Precisam Atenção',
      value: kpis.attention_count,
      icon: <Bell size={20} />,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      border: 'border-orange-100',
      suffix: '',
      description: 'Esfriando — reativar!',
    },
    {
      label: 'Prontos p/ Upsell',
      value: kpis.upsell_count,
      icon: <TrendingUp size={20} />,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-100',
      suffix: '',
      description: 'Oportunidade de upgrade',
    },
    {
      label: 'Prob. Churn Média',
      value: `${kpis.avg_churn_probability}%`,
      icon: <Gauge size={20} />,
      color: kpis.avg_churn_probability > 40 ? 'text-red-600' : kpis.avg_churn_probability > 20 ? 'text-orange-600' : 'text-green-600',
      bg: kpis.avg_churn_probability > 40 ? 'bg-red-50' : kpis.avg_churn_probability > 20 ? 'bg-orange-50' : 'bg-green-50',
      border: kpis.avg_churn_probability > 40 ? 'border-red-100' : kpis.avg_churn_probability > 20 ? 'border-orange-100' : 'border-green-100',
      suffix: '',
      description: kpis.avg_churn_probability > 40 ? 'Alto — agir agora!' : kpis.avg_churn_probability > 20 ? 'Moderado — monitorar' : 'Baixo — saudável',
    },
    {
      label: 'Prob. Compra 30d',
      value: `${kpis.avg_purchase_prob_30d}%`,
      icon: <Activity size={20} />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-100',
      suffix: '',
      description: 'Chance média de compra',
    },
    {
      label: 'LTV Projetado 12m',
      value: formatCurrency(kpis.total_ltv_projected_12m),
      icon: <DollarSign size={20} />,
      color: 'text-crm-primary',
      bg: 'bg-crm-primary/5',
      border: 'border-crm-primary/10',
      suffix: '',
      description: 'Receita esperada em 12 meses',
    },
    {
      label: 'Eventos (7 dias)',
      value: events7d,
      icon: <BarChart3 size={20} />,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      border: 'border-violet-100',
      suffix: '',
      description: 'Interações registradas',
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-surface-border shadow-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b border-surface-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-crm-primary to-crm-secondary flex items-center justify-center">
              <Brain size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-txt-primary">Visão Geral da IA</h3>
              <p className="text-xs text-txt-muted">
                {totalCalculated} de {totalClients} clientes analisados ({coveragePct}%)
                {totalClients - totalCalculated > 0 && (
                  <span className="ml-1 text-orange-500">
                    • {totalClients - totalCalculated} sem pedidos vinculados
                  </span>
                )}
                {lastCalculatedAt && (
                  <span className="ml-2 inline-flex items-center gap-1">
                    <Clock size={10} />
                    Última análise: {new Date(lastCalculatedAt).toLocaleDateString('pt-BR')}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-xl border ${card.border} ${card.bg} p-4 transition-all hover:shadow-sm`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={card.color}>{card.icon}</span>
            </div>
            <p className="text-xl font-bold text-txt-primary">{card.value}</p>
            <p className="text-xs font-medium text-txt-secondary mt-0.5">{card.label}</p>
            <p className="text-[10px] text-txt-muted mt-1">{card.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
