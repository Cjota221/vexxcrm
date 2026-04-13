'use client';

import { useState } from 'react';
import { Trophy, Medal, Award, Users, TrendingUp, DollarSign, ChevronDown, ChevronUp, Bot, Download } from 'lucide-react';
import { useTicketSegmentation, type ResumoSegmento, type ClienteSegmentado } from '@/hooks/useIntelligence';
import { cn } from '@/lib/utils';
import type { ClientListItem } from './ClientListDrawer';

interface TicketSegmentationProps {
  onAskAnne?: (clients: ClientListItem[], label: string) => void;
}

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const SEGMENTOS = [
  {
    key: 'grandes' as const,
    label: 'Grandes compradores',
    sublabel: 'Ticket médio > R$700',
    icon: <Trophy size={18} className="text-amber-500" />,
    badgeBg: 'bg-amber-50 border-amber-200',
    barColor: 'bg-amber-400',
    pill: 'bg-amber-100 text-amber-700',
    ring: 'ring-amber-200',
  },
  {
    key: 'medios' as const,
    label: 'Médios compradores',
    sublabel: 'Ticket R$300 – R$700',
    icon: <Medal size={18} className="text-blue-500" />,
    badgeBg: 'bg-blue-50 border-blue-200',
    barColor: 'bg-blue-400',
    pill: 'bg-blue-100 text-blue-700',
    ring: 'ring-blue-200',
  },
  {
    key: 'pequenos' as const,
    label: 'Pequenos compradores',
    sublabel: 'Ticket < R$300',
    icon: <Award size={18} className="text-slate-500" />,
    badgeBg: 'bg-slate-50 border-slate-200',
    barColor: 'bg-slate-400',
    pill: 'bg-slate-100 text-slate-600',
    ring: 'ring-slate-200',
  },
];

function SegmentCard({
  config,
  data,
  total,
  onAskAnne,
}: {
  config: (typeof SEGMENTOS)[number];
  data: ResumoSegmento;
  total: number;
  onAskAnne?: (clients: ClientListItem[], label: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pct = total > 0 ? Math.round((data.total / total) * 100) : 0;

  const toClientListItem = (c: ClienteSegmentado): ClientListItem => ({
    id: c.id,
    name: c.nome,
    phone: c.telefone,
    total_orders: c.total_pedidos,
    total_spent: c.ltv,
  });

  return (
    <div className={cn('rounded-2xl border p-4 flex flex-col gap-3', config.badgeBg)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {config.icon}
          <div>
            <p className="text-sm font-semibold text-txt-primary">{config.label}</p>
            <p className="text-xs text-txt-muted">{config.sublabel}</p>
          </div>
        </div>
        <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', config.pill)}>
          {pct}%
        </span>
      </div>

      {/* Barra de progresso */}
      <div className="w-full h-1.5 bg-white/70 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', config.barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col items-center bg-white/60 rounded-xl p-2">
          <Users size={13} className="text-txt-muted mb-0.5" />
          <span className="text-base font-bold text-txt-primary">{data.total}</span>
          <span className="text-[10px] text-txt-muted">clientes</span>
        </div>
        <div className="flex flex-col items-center bg-white/60 rounded-xl p-2">
          <TrendingUp size={13} className="text-txt-muted mb-0.5" />
          <span className="text-base font-bold text-txt-primary">{fmt(data.ticket_medio_geral)}</span>
          <span className="text-[10px] text-txt-muted">ticket médio</span>
        </div>
        <div className="flex flex-col items-center bg-white/60 rounded-xl p-2">
          <DollarSign size={13} className="text-txt-muted mb-0.5" />
          <span className="text-base font-bold text-txt-primary">{fmt(data.ltv_total)}</span>
          <span className="text-[10px] text-txt-muted">LTV total</span>
        </div>
      </div>

      {/* Ações */}
      {data.total > 0 && (
        <div className="flex gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl border border-white/80 bg-white/50 text-xs text-txt-secondary hover:bg-white/80 transition-colors"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'Ocultar' : 'Ver clientes'}
          </button>
          {onAskAnne && (
            <button
              onClick={() => onAskAnne(data.clientes.map(toClientListItem), config.label)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-crm-primary text-white text-xs font-medium hover:bg-crm-primary/90 transition-colors"
            >
              <Bot size={11} />
              Anne
            </button>
          )}
        </div>
      )}

      {/* Lista expandida */}
      {expanded && data.clientes.length > 0 && (
        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
          {data.clientes.slice(0, 50).map((c) => (
            <div key={c.id} className="flex items-center justify-between bg-white/70 rounded-xl px-3 py-1.5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-txt-primary truncate">{c.nome}</p>
                <p className="text-[10px] text-txt-muted">{c.total_pedidos} pedido{c.total_pedidos !== 1 ? 's' : ''}</p>
              </div>
              <span className="text-xs font-semibold text-txt-primary ml-2 shrink-0">
                {fmt(c.ticket_medio)}
              </span>
            </div>
          ))}
          {data.clientes.length > 50 && (
            <p className="text-center text-[10px] text-txt-muted py-1">
              + {data.clientes.length - 50} clientes
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function cleanPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
}

export function TicketSegmentation({ onAskAnne }: TicketSegmentationProps) {
  const { data, isLoading, error, refetch } = useTicketSegmentation();

  function exportToCSV(): void {
    if (!data) {
      console.warn('[TicketSegmentation] exportToCSV: dados não carregados');
      return;
    }

    const allClients: ClienteSegmentado[] = [
      ...data.grandes.clientes,
      ...data.medios.clientes,
      ...data.pequenos.clientes,
    ];

    if (allClients.length === 0) {
      console.warn('[TicketSegmentation] exportToCSV: lista vazia, nada a exportar');
      return;
    }

    const header = 'nome,telefone,total_pedidos,valor_total';
    const rows = allClients
      .sort((a, b) => b.ltv - a.ltv)
      .map((c) =>
        [
          `"${c.nome.replace(/"/g, '""')}"`,
          cleanPhone(c.telefone),
          c.total_pedidos,
          c.ltv.toFixed(2),
        ].join(',')
      );

    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maiores-compradores-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-surface-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <Trophy size={20} className="text-amber-500" />
          <h3 className="text-sm font-semibold text-txt-primary">Segmentação por Ticket</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 bg-surface-50 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-2xl border border-surface-border p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Trophy size={20} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-txt-primary">Segmentação por Ticket</h3>
          </div>
          <button onClick={() => refetch()} className="text-xs text-crm-primary hover:underline">
            Tentar novamente
          </button>
        </div>
        <p className="text-sm text-txt-muted">Não foi possível carregar a segmentação.</p>
      </div>
    );
  }

  const total = data.total_clientes_com_pedido;

  return (
    <div className="bg-white rounded-2xl border border-surface-border p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-amber-500" />
          <div>
            <h3 className="text-sm font-semibold text-txt-primary">Segmentação por Ticket de Compra</h3>
            <p className="text-xs text-txt-muted">Por ticket médio <strong>por pedido</strong> — {total} clientes com pedidos</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportToCSV}
            className="border border-[#1e3a5f] text-[#1e3a5f] hover:bg-[#1e3a5f] hover:text-white rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <Download size={14} />
            Exportar Contatos
          </button>
          <button
            onClick={() => refetch()}
            className="text-xs text-txt-muted hover:text-txt-primary transition-colors"
            title="Atualizar"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SEGMENTOS.map((seg) => (
          <SegmentCard
            key={seg.key}
            config={seg}
            data={data[seg.key]}
            total={total}
            onAskAnne={onAskAnne}
          />
        ))}
      </div>
    </div>
  );
}
