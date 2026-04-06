'use client';

import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  Users,
  Package,
  CreditCard,
} from 'lucide-react';
import { getMonthlyStats, type MonthlyStat } from '@/lib/queries/dashboard-monthly';
import { formatCurrency } from '@/lib/utils';

// ─── helpers ────────────────────────────────────────────────────────────────

function currentMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function variationPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// ─── skeleton ────────────────────────────────────────────────────────────────

export function MonthlyStatsStripSkeleton() {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-4 min-w-max">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="min-w-[220px] h-[220px] rounded-xl animate-pulse"
            style={{ backgroundColor: '#1c2333', border: '1px solid #2a3550' }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── single card ─────────────────────────────────────────────────────────────

interface MonthCardProps {
  stat: MonthlyStat;
  isCurrentMonth: boolean;
  variation: number | null;
}

function MonthCard({ stat, isCurrentMonth, variation }: MonthCardProps) {
  const cardStyle: React.CSSProperties = isCurrentMonth
    ? {
        backgroundColor: '#161b24',
        border: '1px solid #2a3550',
        borderLeft: '3px solid #1e3a5f',
        borderRadius: '12px',
        padding: '20px',
        minWidth: '220px',
      }
    : {
        backgroundColor: '#161b24',
        border: '1px solid #2a3550',
        borderRadius: '12px',
        padding: '20px',
        minWidth: '220px',
        opacity: 0.85,
      };

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>
          {stat.mes}
        </span>
        {isCurrentMonth && (
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: '#1e3a5f', color: '#93c5fd' }}
          >
            Atual
          </span>
        )}
      </div>

      {/* Faturamento pago — destaque principal */}
      <p className="text-2xl font-bold" style={{ color: '#059669' }}>
        {formatCurrency(stat.faturamento_pago)}
      </p>

      {/* Variação vs mês anterior */}
      {variation !== null && (
        <div className="flex items-center gap-1 mt-1">
          {variation >= 0 ? (
            <TrendingUp size={13} style={{ color: '#059669' }} />
          ) : (
            <TrendingDown size={13} style={{ color: '#ef4444' }} />
          )}
          <span
            className="text-xs font-medium"
            style={{ color: variation >= 0 ? '#059669' : '#ef4444' }}
          >
            {variation >= 0 ? '+' : ''}{variation.toFixed(1)}%
          </span>
          <span className="text-xs" style={{ color: '#64748b' }}>
            vs anterior
          </span>
        </div>
      )}

      {/* Faturamento bruto */}
      <p className="text-xs mt-1" style={{ color: '#64748b' }}>
        Bruto: {formatCurrency(stat.faturamento_bruto)}
      </p>

      {/* Separador */}
      <div className="my-3" style={{ borderTop: '1px solid #2a3550' }} />

      {/* Grid 2×2 */}
      <div className="grid grid-cols-2 gap-2">
        <Metric
          icon={<ShoppingBag size={13} />}
          label="Pedidos Pagos"
          value={stat.pedidos_pagos.toLocaleString('pt-BR')}
        />
        <Metric
          icon={<CreditCard size={13} />}
          label="Ticket Médio"
          value={formatCurrency(stat.ticket_medio)}
        />
        <Metric
          icon={<Package size={13} />}
          label="Peças Vendidas"
          value={stat.pecas_vendidas.toLocaleString('pt-BR')}
        />
        <Metric
          icon={<Users size={13} />}
          label="Novos Clientes"
          value={stat.novos_clientes.toLocaleString('pt-BR')}
        />
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-0.5" style={{ color: '#64748b' }}>
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-sm font-semibold" style={{ color: '#cbd5e1' }}>
        {value}
      </p>
    </div>
  );
}

// ─── strip ───────────────────────────────────────────────────────────────────

export function MonthlyStatsStrip() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-monthly'],
    queryFn: () => getMonthlyStats(4),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <MonthlyStatsStripSkeleton />;
  if (!stats || stats.length === 0) return null;

  const thisMonth = currentMonthKey();

  return (
    <div>
      <h2 className="text-sm font-semibold mb-3" style={{ color: '#94a3b8' }}>
        Faturamento Mensal
      </h2>
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-4 min-w-max">
          {stats.map((stat, index) => {
            const previous = stats[index + 1];
            const variation = previous
              ? variationPct(stat.faturamento_pago, previous.faturamento_pago)
              : null;
            return (
              <MonthCard
                key={stat.mes_key}
                stat={stat}
                isCurrentMonth={stat.mes_key === thisMonth}
                variation={variation}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
