'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Bot,
  User,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import { api } from '@/lib/api';
import { KANBAN_COLUMNS_ORDER, KANBAN_COLUMN_CONFIG, MAX_REACTIVATION_ATTEMPTS } from '@/lib/kanban-state-machine';
import type { KanbanCard, KanbanColumn, KanbanTransition } from '@/types';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HOOKS DE DADOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function useKanbanCards() {
  return useQuery({
    queryKey: ['kanban-cards'],
    queryFn: async () => {
      const res = await api.get<{ cards: KanbanCard[] }>('/api/v2/kanban/cards');
      return res.data?.cards ?? [];
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

function useMoveCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      chat_id: string;
      contato_id: string;
      de_coluna: KanbanColumn | null;
      para_coluna: KanbanColumn;
      motivo?: string;
    }) => {
      const res = await api.patch<{ sucesso: boolean; novo_estado: KanbanColumn; erro?: string; codigo_anomalia?: string }>(
        '/api/v2/kanban/move',
        params
      );
      if (res.error || res.data?.codigo_anomalia) {
        throw new Error(res.data?.erro ?? res.error ?? 'Erro desconhecido');
      }
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-cards'] });
    },
  });
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CARD DE KANBAN
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function KanbanCardItem({
  card,
  onMove,
  moving,
}: {
  card: KanbanCard;
  onMove: (card: KanbanCard, para: KanbanColumn) => void;
  moving: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const colConfig = KANBAN_COLUMN_CONFIG[card.coluna];

  // Últimas transições (3 mais recentes)
  const recentTransitions = (card.transitions ?? []).slice(-3).reverse();

  // Score visual
  const scoreColor = card.score_anne != null
    ? card.score_anne >= 0.8 ? 'text-emerald-600' : card.score_anne >= 0.5 ? 'text-amber-600' : 'text-red-500'
    : 'text-txt-muted';

  // Badge de tentativas de reativação
  const showRetryBadge = card.coluna === 'REATIVAR' && card.tentativas_reativacao > 0;
  const retryDanger = card.tentativas_reativacao >= MAX_REACTIVATION_ATTEMPTS - 1;

  return (
    <div className="bg-white border border-surface-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow">
      {/* Cabeçalho do card */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-txt-primary truncate">{card.client_name}</p>
          <p className="text-[11px] text-txt-muted">{card.client_phone}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Score Anne */}
          {card.score_anne != null && (
            <span className={cn('text-[10px] font-bold', scoreColor)}>
              {(card.score_anne * 100).toFixed(0)}%
            </span>
          )}

          {/* Badge tentativas reativação */}
          {showRetryBadge && (
            <span className={cn(
              'flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold',
              retryDanger ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'
            )}>
              <RotateCcw size={9} />
              {card.tentativas_reativacao}/{MAX_REACTIVATION_ATTEMPTS}
            </span>
          )}
        </div>
      </div>

      {/* Tags */}
      {card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {card.tags.slice(0, 3).map(tag => (
            <span key={tag} className="px-1.5 py-0.5 bg-surface-100 text-txt-secondary rounded text-[10px]">
              {tag}
            </span>
          ))}
          {card.tags.length > 3 && (
            <span className="px-1.5 py-0.5 bg-surface-100 text-txt-secondary rounded text-[10px]">
              +{card.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Último contato */}
      <div className="flex items-center gap-1 mt-2">
        <Clock size={9} className="text-txt-muted" />
        <span className="text-[10px] text-txt-muted">
          {formatRelativeTime(card.ultimo_contato)}
        </span>
      </div>

      {/* Histórico de transições (expansível) */}
      {recentTransitions.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[10px] text-txt-muted hover:text-txt-secondary transition-colors"
          >
            {expanded ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
            Histórico ({card.transitions?.length ?? 0})
          </button>

          {expanded && (
            <div className="mt-1.5 space-y-1 border-l-2 border-surface-200 pl-2">
              {recentTransitions.map((t: KanbanTransition) => (
                <div key={t.id} className="text-[10px]">
                  <div className="flex items-center gap-1">
                    {t.autor === 'anne' ? (
                      <Bot size={9} className="text-crm-primary" />
                    ) : (
                      <User size={9} className="text-txt-secondary" />
                    )}
                    <span className="text-txt-secondary font-medium">
                      {t.de_coluna
                        ? `${KANBAN_COLUMN_CONFIG[t.de_coluna].label} → `
                        : 'Criado em '}
                      {KANBAN_COLUMN_CONFIG[t.para_coluna].label}
                    </span>
                  </div>
                  {t.motivo && (
                    <p className="text-txt-muted ml-3 truncate">{t.motivo}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ações de mover */}
      <div className="mt-2.5 pt-2.5 border-t border-surface-100">
        <MoveActions card={card} onMove={onMove} moving={moving} />
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   AÇÕES DE MOVER CARD
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

import { VALID_TRANSITIONS } from '@/lib/kanban-state-machine';

function MoveActions({
  card,
  onMove,
  moving,
}: {
  card: KanbanCard;
  onMove: (card: KanbanCard, para: KanbanColumn) => void;
  moving: boolean;
}) {
  const validDestinations = VALID_TRANSITIONS[card.coluna] ?? [];

  if (validDestinations.length === 0) {
    return (
      <p className="text-[10px] text-txt-muted italic">Estado terminal</p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {validDestinations.map(dest => {
        const config = KANBAN_COLUMN_CONFIG[dest];
        return (
          <button
            key={dest}
            onClick={() => onMove(card, dest)}
            disabled={moving}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border transition-colors hover:opacity-80 disabled:opacity-50"
            style={{ borderColor: 'currentColor' }}
          >
            {moving ? <Loader2 size={9} className="animate-spin" /> : <span>{config.icon}</span>}
            {config.label}
          </button>
        );
      })}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   COLUNA DO KANBAN
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function KanbanColumnPanel({
  column,
  cards,
  onMove,
  movingCardId,
}: {
  column: KanbanColumn;
  cards: KanbanCard[];
  onMove: (card: KanbanCard, para: KanbanColumn) => void;
  movingCardId: string | null;
}) {
  const config = KANBAN_COLUMN_CONFIG[column];

  return (
    <div className={cn('flex flex-col min-w-48 max-w-52 w-52 shrink-0 rounded-xl border p-2', config.bg)}>
      {/* Header da coluna */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{config.icon}</span>
          <span className={cn('text-xs font-semibold', config.color)}>
            {config.label}
          </span>
        </div>
        <span className={cn(
          'px-1.5 py-0.5 rounded-full text-[10px] font-bold',
          config.color,
          'bg-white/70'
        )}>
          {cards.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-280px)] pr-0.5">
        {cards.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-[11px] text-txt-muted opacity-60">Nenhum contato</p>
          </div>
        ) : (
          cards.map(card => (
            <KanbanCardItem
              key={card.id}
              card={card}
              onMove={onMove}
              moving={movingCardId === card.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   COMPONENTE PRINCIPAL — KanbanBoard
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function KanbanBoard() {
  const { data: cards = [], isLoading, refetch } = useKanbanCards();
  const moveMutation = useMoveCard();
  const [movingCardId, setMovingCardId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  // Agrupar cards por coluna
  const cardsByColumn = useCallback(() => {
    const grouped: Record<KanbanColumn, KanbanCard[]> = {} as Record<KanbanColumn, KanbanCard[]>;
    for (const col of KANBAN_COLUMNS_ORDER) {
      grouped[col] = [];
    }
    for (const card of cards) {
      if (grouped[card.coluna]) {
        grouped[card.coluna].push(card);
      }
    }
    return grouped;
  }, [cards]);

  const handleMove = useCallback(async (card: KanbanCard, para: KanbanColumn) => {
    setMoveError(null);
    setMovingCardId(card.id);

    try {
      await moveMutation.mutateAsync({
        chat_id: card.chat_id,
        contato_id: card.client_id,
        de_coluna: card.coluna,
        para_coluna: para,
        motivo: 'Movido pelo atendente via Kanban',
      });
    } catch (err) {
      setMoveError((err as Error).message);
      setTimeout(() => setMoveError(null), 5000);
    } finally {
      setMovingCardId(null);
    }
  }, [moveMutation]);

  const grouped = cardsByColumn();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={20} className="animate-spin text-txt-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header do Kanban */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-surface-200 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-txt-primary">Pipeline</span>
          <span className="text-[11px] text-txt-muted">{cards.length} contatos</span>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1.5 rounded-lg text-txt-muted hover:bg-surface-100 transition-colors"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Erro de transição inválida */}
      {moveError && (
        <div className="mx-3 mt-2 flex items-start gap-1.5 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle size={13} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700">{moveError}</p>
        </div>
      )}

      {/* Board scroll horizontal */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-3 py-3">
        <div className="flex gap-3 h-full">
          {KANBAN_COLUMNS_ORDER.map(col => (
            <KanbanColumnPanel
              key={col}
              column={col}
              cards={grouped[col]}
              onMove={handleMove}
              movingCardId={movingCardId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
