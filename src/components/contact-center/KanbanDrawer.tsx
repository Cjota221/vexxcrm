'use client';

/**
 * KanbanDrawer — Pipeline de Vendas como painel deslizante no topo
 *
 * Ao abrir, desce suavemente sobre o workspace sem ocultar o chat.
 * Altura fixa de ~220px — o lojista vê o funil E a conversa ao mesmo tempo.
 *
 *  ┌──────────────────────────────────────────────────────┐
 *  │  Pipeline de Vendas          [↑ Fechar]              │
 *  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ...   │
 *  │  │ 1°Cont │ │Negoc.  │ │Ag.Pag. │ │  PAGO  │ ...   │
 *  │  │  12    │ │  8     │ │  3     │ │  47    │ ...   │
 *  └──┴────────┴─┴────────┴─┴────────┴─┴────────┴───────┘
 *  (chat area continua visível abaixo)
 */

import { useEffect, useRef } from 'react';
import {
  X,
  Kanban,
  UserPlus,
  MessageSquare,
  Clock,
  BadgeCheck,
  RefreshCw,
  BanknoteIcon,
  CheckCircle2,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

/* ─── Tipos de coluna ─────────────────────────────────────── */

type KanbanColumn =
  | 'PRIMEIRO_CONTATO'
  | 'EM_NEGOCIACAO'
  | 'AGUARDANDO_PAGAMENTO'
  | 'PAGO'
  | 'REATIVAR'
  | 'CONCLUIDO';

interface KanbanColumnConfig {
  key: KanbanColumn;
  label: string;
  shortLabel: string;
  icon: typeof UserPlus;
  color: string;         // text color
  bg: string;            // bg color do header da coluna
  borderColor: string;
}

const COLUMNS: KanbanColumnConfig[] = [
  {
    key: 'PRIMEIRO_CONTATO',
    label: 'Primeiro Contato',
    shortLabel: '1° Contato',
    icon: UserPlus,
    color: 'text-sky-700',
    bg: 'bg-sky-50',
    borderColor: 'border-sky-200',
  },
  {
    key: 'EM_NEGOCIACAO',
    label: 'Em Negociação',
    shortLabel: 'Negociação',
    icon: MessageSquare,
    color: 'text-violet-700',
    bg: 'bg-violet-50',
    borderColor: 'border-violet-200',
  },
  {
    key: 'AGUARDANDO_PAGAMENTO',
    label: 'Aguardando Pagamento',
    shortLabel: 'Ag. Pagamento',
    icon: Clock,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  {
    key: 'PAGO',
    label: 'Pago',
    shortLabel: 'Pago',
    icon: BanknoteIcon,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
  },
  {
    key: 'REATIVAR',
    label: 'Reativar',
    shortLabel: 'Reativar',
    icon: RefreshCw,
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    borderColor: 'border-orange-200',
  },
  {
    key: 'CONCLUIDO',
    label: 'Concluído',
    shortLabel: 'Concluído',
    icon: CheckCircle2,
    color: 'text-gray-600',
    bg: 'bg-gray-50',
    borderColor: 'border-gray-200',
  },
];

/* ─── Props ─────────────────────────────────────────────────── */

interface KanbanDrawerProps {
  open: boolean;
  onClose: () => void;
}

/* ─── Hook de dados ─────────────────────────────────────────── */

function useKanbanCounts() {
  return useQuery({
    queryKey: ['kanban-counts'],
    queryFn: async () => {
      const res = await api.get<{
        data: Array<{ coluna: KanbanColumn; count: number }>;
      }>('/api/v2/kanban/cards?mode=counts');
      return res.data?.data ?? [];
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   COMPONENTE PRINCIPAL
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function KanbanDrawer({ open, onClose }: KanbanDrawerProps) {
  const { data: counts = [], isLoading, refetch } = useKanbanCounts();
  const queryClient = useQueryClient();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Fechar com Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // ── Realtime: reagir a kanban_moved emitido pela Anne ─────────
  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-counts'] });
    };
    window.addEventListener('sse:kanban_moved', handler);
    return () => window.removeEventListener('sse:kanban_moved', handler);
  }, [queryClient]);

  const getCount = (col: KanbanColumn) =>
    counts.find(c => c.coluna === col)?.count ?? 0;

  const totalAtivos = COLUMNS
    .filter(c => c.key !== 'CONCLUIDO')
    .reduce((s, c) => s + getCount(c.key), 0);

  const totalPago = getCount('PAGO');

  return (
    <>
      {/* Drawer — desliza para baixo */}
      <div
        ref={drawerRef}
        className={cn(
          'shrink-0 overflow-hidden transition-all duration-300 ease-in-out bg-white border-b border-gray-200 shadow-sm',
          open ? 'max-h-55 opacity-100' : 'max-h-0 opacity-0'
        )}
        aria-hidden={!open}
      >
        <div className="flex flex-col h-55">
          {/* Header do drawer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-2">
              <Kanban size={15} className="text-crm-primary" />
              <span className="text-sm font-semibold text-gray-800">Pipeline de Vendas</span>
              <span className="px-2 py-0.5 bg-crm-primary/10 text-crm-primary text-[10px] font-bold rounded-full">
                {totalAtivos} ativo{totalAtivos !== 1 ? 's' : ''}
              </span>
              {totalPago > 0 && (
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full">
                  {totalPago} pago{totalPago !== 1 ? 's' : ''} 💰
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => refetch()}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                title="Atualizar"
              >
                <RefreshCw size={13} />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                title="Fechar (Esc)"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Colunas — scroll horizontal se necessário */}
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex gap-2 px-4 py-3 h-full items-stretch">
              {COLUMNS.map(col => {
                const Icon = col.icon;
                const count = getCount(col.key);
                const isEmpty = count === 0;

                return (
                  <div
                    key={col.key}
                    className={cn(
                      'flex flex-col rounded-xl border transition-all cursor-default min-w-27.5 flex-1',
                      col.borderColor,
                      isEmpty ? 'opacity-40' : 'opacity-100',
                      col.bg
                    )}
                  >
                    {/* Header da coluna */}
                    <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1">
                      <Icon size={12} className={col.color} />
                      <span className={cn('text-[11px] font-semibold truncate', col.color)}>
                        {col.shortLabel}
                      </span>
                    </div>

                    {/* Contador principal */}
                    <div className="flex-1 flex items-center justify-center pb-2">
                      {isLoading ? (
                        <div className="w-8 h-6 bg-white/60 rounded animate-pulse" />
                      ) : (
                        <span className={cn(
                          'text-3xl font-black leading-none',
                          isEmpty ? 'text-gray-300' : col.color
                        )}>
                          {count}
                        </span>
                      )}
                    </div>

                    {/* Label abaixo */}
                    <p className={cn(
                      'text-center text-[9px] font-medium pb-2',
                      isEmpty ? 'text-gray-300' : 'text-gray-400'
                    )}>
                      {count === 1 ? 'conversa' : 'conversas'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
