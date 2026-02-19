'use client';

/**
 * KanbanModal — Fluxo de Vendas
 *
 * Modal/camada visual com o Pipeline de Vendas completo.
 * Acessível via atalho F4 ou botão no Header.
 *
 * Features:
 * - Colunas: Primeiro Contato / Em Negociação / Aguardando Pagamento / Pago / Despachado
 * - Contagem + total LTV por coluna
 * - Drag & Drop manual entre colunas
 * - Supabase Realtime: cards "saltam" de coluna ao vivo
 * - Animação de brilho quando card muda de coluna automaticamente
 * - Collapse/expand de colunas individuais
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  GitBranch,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  User,
  ArrowRight,
  Bot,
  UserCheck,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import type { KanbanColumn } from '@/types';

/* ─── Config de Colunas ───────────────────────────────────────── */

interface ColumnConfig {
  label: string;
  shortLabel: string;
  icon: string;
  color: string;
  bg: string;
  border: string;
  headerBg: string;
  dot: string;
}

const COLUMNS: KanbanColumn[] = [
  'PRIMEIRO_CONTATO',
  'EM_NEGOCIACAO',
  'AGUARDANDO_PAGAMENTO',
  'PAGO',
  'DESPACHADO',
  'CANCELADO',
];

const COLUMN_CONFIG: Record<KanbanColumn, ColumnConfig> = {
  PRIMEIRO_CONTATO: {
    label: 'Primeiro Contato',
    shortLabel: 'Contato',
    icon: '👋',
    color: 'text-sky-700',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    headerBg: 'bg-sky-100',
    dot: 'bg-sky-400',
  },
  EM_NEGOCIACAO: {
    label: 'Em Negociação',
    shortLabel: 'Negociação',
    icon: '💬',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    headerBg: 'bg-amber-100',
    dot: 'bg-amber-400',
  },
  AGUARDANDO_PAGAMENTO: {
    label: 'Aguardando Pagamento',
    shortLabel: 'Aguard. Pgt.',
    icon: '💳',
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    headerBg: 'bg-orange-100',
    dot: 'bg-orange-400',
  },
  PAGO: {
    label: 'Pago / Confirmado',
    shortLabel: 'Pago',
    icon: '✅',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    headerBg: 'bg-emerald-100',
    dot: 'bg-emerald-400',
  },
  DESPACHADO: {
    label: 'Despachado',
    shortLabel: 'Despachado',
    icon: '🚚',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    headerBg: 'bg-blue-100',
    dot: 'bg-blue-400',
  },
  CANCELADO: {
    label: 'Cancelado',
    shortLabel: 'Cancelado',
    icon: '🙁',
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    headerBg: 'bg-red-100',
    dot: 'bg-red-400',
  },
  REATIVAR: {
    label: 'Reativar',
    shortLabel: 'Reativar',
    icon: '🔄',
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    headerBg: 'bg-orange-100',
    dot: 'bg-orange-400',
  },
  CONCLUIDO: {
    label: 'Concluído',
    shortLabel: 'Concluído',
    icon: '🏁',
    color: 'text-violet-700',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    headerBg: 'bg-violet-100',
    dot: 'bg-violet-400',
  },
};

/* ─── Tipos locais ────────────────────────────────────────────── */

interface KanbanCardData {
  id: string;
  chat_id: string;
  client_id: string;
  client_name: string;
  client_phone: string;
  coluna: KanbanColumn;
  tags: string[];
  score_anne: number | null;
  ultimo_contato: string;
  transitions: Array<{ autor: string; created_at: string }>;
  updated_at: string;
  /** Indica que este card acabou de mudar de coluna via realtime (pisca) */
  _justMoved?: boolean;
}

/* ─── Componente Card ─────────────────────────────────────────── */

function PipelineCard({
  card,
  onMoveLeft,
  onMoveRight,
  canLeft,
  canRight,
  isDragging,
  onDragStart,
  accessToken,
}: {
  card: KanbanCardData;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  canLeft: boolean;
  canRight: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  accessToken?: string;
}) {
  const lastAutor = card.transitions[0]?.autor;
  const isAutoMoved = lastAutor === 'anne' || lastAutor === 'auto';
  const scorePercent = card.score_anne !== null ? Math.round((card.score_anne ?? 0) * 100) : null;

  const handleOpenChat = () => {
    window.dispatchEvent(
      new CustomEvent('vexx:open-chat', {
        detail: { clientId: card.client_id },
      })
    );
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn(
        'relative group bg-white rounded-xl border shadow-sm cursor-grab active:cursor-grabbing',
        'hover:shadow-md hover:-translate-y-0.5 transition-all duration-200',
        isDragging && 'opacity-50 scale-95',
        card._justMoved && 'animate-pulse-glow ring-2 ring-crm-primary/40'
      )}
    >
      {/* Faixa automação */}
      {isAutoMoved && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-linear-to-r from-crm-primary/60 to-violet-400/60 rounded-t-xl" />
      )}

      <div className="p-3">
        {/* Header do card */}
        <div className="flex items-start gap-2 mb-2">
          <div
            className="w-7 h-7 rounded-full bg-crm-primary/10 flex items-center justify-center shrink-0 cursor-pointer hover:bg-crm-primary/20 transition-colors"
            onClick={handleOpenChat}
            title="Abrir chat"
          >
            <User size={13} className="text-crm-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="text-xs font-bold text-gray-800 truncate cursor-pointer hover:text-crm-primary transition-colors leading-tight"
              onClick={handleOpenChat}
            >
              {card.client_name}
            </p>
            <p className="text-[10px] text-gray-400 truncate mt-0.5">{card.client_phone}</p>
          </div>

          {/* Grip handle */}
          <GripVertical size={12} className="text-gray-200 group-hover:text-gray-400 transition-colors shrink-0 mt-0.5" />
        </div>

        {/* Tags */}
        {card.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {card.tags.slice(0, 2).map(tag => (
              <span key={tag} className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                {tag}
              </span>
            ))}
            {card.tags.length > 2 && (
              <span className="text-[9px] text-gray-400">+{card.tags.length - 2}</span>
            )}
          </div>
        )}

        {/* Score Anne */}
        {scorePercent !== null && (
          <div className="flex items-center gap-1.5 mb-2">
            <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-linear-to-r from-crm-primary to-violet-500 rounded-full transition-all"
                style={{ width: `${scorePercent}%` }}
              />
            </div>
            <span className="text-[9px] font-bold text-gray-400">{scorePercent}%</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {isAutoMoved ? (
              <Bot size={9} className="text-crm-primary" />
            ) : (
              <UserCheck size={9} className="text-gray-400" />
            )}
            <span className="text-[9px] text-gray-400">
              {isAutoMoved ? 'Auto' : 'Manual'}
            </span>
          </div>

          {/* Botões de mover */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onMoveLeft}
              disabled={!canLeft}
              className="p-1 rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Mover para etapa anterior"
            >
              <ChevronLeft size={11} className="text-gray-500" />
            </button>
            <button
              onClick={onMoveRight}
              disabled={!canRight}
              className="p-1 rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Mover para próxima etapa"
            >
              <ChevronRight size={11} className="text-gray-500" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Componente Coluna ───────────────────────────────────────── */

function KanbanColumnView({
  column,
  cards,
  summary,
  onMoveCard,
  onDrop,
  onDragOver,
  draggingId,
  onDragStart,
  accessToken,
}: {
  column: KanbanColumn;
  cards: KanbanCardData[];
  summary: { count: number; total_ltv: number } | undefined;
  onMoveCard: (cardId: string, chatId: string, fromCol: KanbanColumn, toCol: KanbanColumn) => void;
  onDrop: (col: KanbanColumn) => void;
  onDragOver: (e: React.DragEvent) => void;
  draggingId: string | null;
  onDragStart: (card: KanbanCardData) => void;
  accessToken?: string;
}) {
  const cfg = COLUMN_CONFIG[column];
  const colIdx = COLUMNS.indexOf(column);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragEnter = () => setIsDragOver(true);
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    onDrop(column);
  };

  return (
    <div
      className={cn(
        'flex flex-col min-w-55 max-w-60 w-full rounded-2xl border transition-all duration-200',
        cfg.bg,
        cfg.border,
        isDragOver && 'ring-2 ring-crm-primary/50 scale-[1.01] shadow-lg'
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e); }}
      onDrop={handleDrop}
    >
      {/* Header da coluna */}
      <div className={cn('px-3 py-2.5 rounded-t-2xl border-b', cfg.headerBg, cfg.border)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-sm leading-none">{cfg.icon}</span>
            <span className={cn('text-xs font-bold', cfg.color)}>{cfg.shortLabel}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className={cn(
              'text-[10px] font-black min-w-5.5 text-center px-1.5 py-0.5 rounded-full text-white',
              cards.length > 0 ? 'bg-gray-700' : 'bg-gray-300'
            )}>
              {cards.length}
            </span>
          </div>
        </div>

        {/* Total LTV */}
        {summary && summary.total_ltv > 0 && (
          <p className="text-[10px] text-gray-500 mt-1 font-medium">
            {formatCurrency(summary.total_ltv)} total
          </p>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-125 min-h-20">
        {cards.length === 0 && (
          <div className={cn(
            'flex flex-col items-center justify-center py-6 rounded-xl border-2 border-dashed transition-all',
            isDragOver ? `${cfg.border} border-opacity-100` : 'border-gray-200/60'
          )}>
            <span className="text-2xl opacity-30">{cfg.icon}</span>
            <p className="text-[10px] text-gray-300 mt-1">Nenhum lead</p>
          </div>
        )}

        {cards.map(card => (
          <PipelineCard
            key={card.id}
            card={card}
            isDragging={draggingId === card.id}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              onDragStart(card);
            }}
            canLeft={colIdx > 0}
            canRight={colIdx < COLUMNS.length - 1}
            onMoveLeft={() => {
              const prevCol = COLUMNS[colIdx - 1];
              if (prevCol) onMoveCard(card.id, card.chat_id, column, prevCol);
            }}
            onMoveRight={() => {
              const nextCol = COLUMNS[colIdx + 1];
              if (nextCol) onMoveCard(card.id, card.chat_id, column, nextCol);
            }}
            accessToken={accessToken}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Modal Principal ─────────────────────────────────────────── */

interface KanbanModalProps {
  open: boolean;
  onClose: () => void;
}

export function KanbanModal({ open, onClose }: KanbanModalProps) {
  const { accessToken, tenant } = useAuthStore();
  const queryClient = useQueryClient();

  const [draggingCard, setDraggingCard] = useState<KanbanCardData | null>(null);
  const [justMovedIds, setJustMovedIds] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(false);

  // ── Query: todos os cards ─────────────────────────────────────
  const { data: cardsData, isLoading, refetch } = useQuery({
    queryKey: ['kanban-all-cards'],
    queryFn: async () => {
      const res = await api.get<{ cards: KanbanCardData[] }>('/api/v2/kanban/cards');
      return res.data ?? res;
    },
    enabled: open && !!accessToken,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  // ── Query: summary por coluna ─────────────────────────────────
  const { data: summaryData } = useQuery({
    queryKey: ['kanban-summary'],
    queryFn: async () => {
      const res = await api.get<{ columns: Record<string, { count: number; total_ltv: number }>; total_cards: number }>('/api/v2/kanban/summary');
      return res.data ?? res;
    },
    enabled: open && !!accessToken,
    staleTime: 15_000,
  });

  // ── Mutation: mover card ──────────────────────────────────────
  const moveMutation = useMutation({
    mutationFn: async ({
      chatId,
      clientId,
      fromCol,
      toCol,
    }: {
      chatId: string;
      clientId: string;
      fromCol: KanbanColumn;
      toCol: KanbanColumn;
    }) => {
      return api.patch('/api/v2/kanban/move', {
        contato_id: clientId,
        chat_id: chatId,
        de_coluna: fromCol,
        para_coluna: toCol,
        motivo: 'Movido manualmente pelo atendente',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-all-cards'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-summary'] });
    },
  });

  // ── Supabase Realtime ─────────────────────────────────────────
  useEffect(() => {
    if (!open || !tenant?.id) return;

    const channel = supabase
      .channel(`kanban-modal-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kanban_cards',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        (payload) => {
          const updatedCard = payload.new as { id?: string } | null;
          if (updatedCard?.id) {
            // Marcar card como "recém movido" para animar
            setJustMovedIds(prev => new Set([...prev, updatedCard.id!]));
            setTimeout(() => {
              setJustMovedIds(prev => {
                const next = new Set(prev);
                next.delete(updatedCard.id!);
                return next;
              });
            }, 3000);
          }
          queryClient.invalidateQueries({ queryKey: ['kanban-all-cards'] });
          queryClient.invalidateQueries({ queryKey: ['kanban-summary'] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [open, tenant?.id, queryClient]);

  // ── Atalho F4 para fechar ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F4') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleMoveCard = useCallback((cardId: string, chatId: string, fromCol: KanbanColumn, toCol: KanbanColumn) => {
    // Optimistic update local
    queryClient.setQueryData(['kanban-all-cards'], (old: { cards: KanbanCardData[] } | undefined) => {
      if (!old?.cards) return old;
      return {
        ...old,
        cards: old.cards.map(c =>
          c.id === cardId ? { ...c, coluna: toCol } : c
        ),
      };
    });

    // Chamar API
    const card = cardsData?.cards?.find(c => c.id === cardId);
    if (card) {
      moveMutation.mutate({
        chatId,
        clientId: card.client_id,
        fromCol,
        toCol,
      });
    }
  }, [cardsData, moveMutation, queryClient]);

  const handleDrop = useCallback((toCol: KanbanColumn) => {
    if (!draggingCard) return;
    if (draggingCard.coluna !== toCol) {
      handleMoveCard(draggingCard.id, draggingCard.chat_id, draggingCard.coluna, toCol);
    }
    setDraggingCard(null);
  }, [draggingCard, handleMoveCard]);

  if (!open) return null;

  // Agrupar cards por coluna com flag _justMoved
  const allCards: KanbanCardData[] = (cardsData?.cards ?? []).map(c => ({
    ...c,
    _justMoved: justMovedIds.has(c.id),
  }));

  const cardsByColumn: Record<KanbanColumn, KanbanCardData[]> = {} as Record<KanbanColumn, KanbanCardData[]>;
  for (const col of COLUMNS) cardsByColumn[col] = [];
  for (const card of allCards) {
    if (COLUMNS.includes(card.coluna)) {
      cardsByColumn[card.coluna].push(card);
    }
  }

  const totalCards = allCards.length;
  const summary = summaryData?.columns ?? {};

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={cn(
        'fixed z-50 bg-white rounded-2xl shadow-2xl flex flex-col',
        'animate-in fade-in slide-in-from-bottom-4 duration-300',
        isExpanded
          ? 'inset-4'
          : 'inset-x-4 bottom-4 top-16 md:inset-x-8 md:top-12 md:bottom-8'
      )}>

        {/* Header do modal */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-crm-primary/10 flex items-center justify-center">
              <GitBranch size={16} className="text-crm-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Fluxo de Vendas</h2>
              <p className="text-[10px] text-gray-400">
                {totalCards} contato{totalCards !== 1 ? 's' : ''} no pipeline
                <span className="ml-2 bg-gray-100 px-1.5 py-0.5 rounded text-[9px] font-bold">F4</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => refetch()}
              className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              title="Atualizar"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => setIsExpanded(v => !v)}
              className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              title={isExpanded ? 'Recolher' : 'Expandir'}
            >
              {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
              title="Fechar (Esc)"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Resumo totais */}
        <div className="flex items-center gap-3 px-5 py-2 border-b border-gray-50 bg-gray-50/50 shrink-0 overflow-x-auto">
          {COLUMNS.map(col => {
            const cfg = COLUMN_CONFIG[col];
            const count = cardsByColumn[col].length;
            if (count === 0) return null;
            return (
              <div key={col} className="flex items-center gap-1.5 shrink-0">
                <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
                <span className="text-[10px] text-gray-600 font-medium">{cfg.shortLabel}:</span>
                <span className="text-[10px] font-black text-gray-800">{count}</span>
                {summary[col]?.total_ltv ? (
                  <span className="text-[10px] text-gray-400">({formatCurrency(summary[col].total_ltv)})</span>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Board */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={28} className="animate-spin text-crm-primary" />
                <p className="text-sm text-gray-400">Carregando pipeline...</p>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 h-full min-w-max">
              {COLUMNS.map(col => (
                <KanbanColumnView
                  key={col}
                  column={col}
                  cards={cardsByColumn[col]}
                  summary={summary[col]}
                  onMoveCard={handleMoveCard}
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  draggingId={draggingCard?.id ?? null}
                  onDragStart={setDraggingCard}
                  accessToken={accessToken ?? undefined}
                />
              ))}
            </div>
          )}
        </div>

        {/* Legenda */}
        <div className="flex items-center gap-4 px-5 py-2 border-t border-gray-100 bg-gray-50/30 shrink-0">
          <div className="flex items-center gap-1.5">
            <Bot size={10} className="text-crm-primary" />
            <span className="text-[10px] text-gray-400">Movido pela Anne (automático)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <UserCheck size={10} className="text-gray-400" />
            <span className="text-[10px] text-gray-400">Movido manualmente</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-400">• Arraste cards entre colunas ou use</span>
            <ChevronLeft size={10} className="text-gray-400" />
            <ChevronRight size={10} className="text-gray-400" />
          </div>
        </div>
      </div>

      {/* Estilos inline para animação glow */}
      <style jsx global>{`
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(30, 58, 95, 0); }
          50% { box-shadow: 0 0 0 6px rgba(30, 58, 95, 0.25); }
        }
        .animate-pulse-glow {
          animation: pulse-glow 1s ease-in-out 3;
        }
      `}</style>
    </>
  );
}
