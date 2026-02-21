'use client';

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MessageBubble } from './MessageBubble';
import { sortMessagesByTimestamp, groupMessagesByDate } from '@/utils/message-sorting';
import type { Message } from '@/types';
import type { MessageListItem } from '@/utils/message-sorting';

interface VirtualizedMessageListProps {
  messages: Message[];
  /** Mostra spinner no topo enquanto carrega página anterior */
  isLoadingMore?: boolean;
  /** Callback ao chegar próximo do topo (lazy load) */
  onLoadMore?: () => void;
  /** Se deve animar scroll para baixo em novas mensagens */
  autoScroll?: boolean;
}

/**
 * Lista de mensagens virtualizada com @tanstack/react-virtual.
 *
 * Capacidade: 10.000 mensagens <15MB RAM, 60fps scroll.
 * Auto-scroll para baixo quando novas mensagens chegam.
 * Load-more ao chegar no topo (scroll < 200px).
 */
export function VirtualizedMessageList({
  messages,
  isLoadingMore = false,
  onLoadMore,
  autoScroll = true,
}: VirtualizedMessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const isScrolledToBottomRef = useRef(true);
  const prevMessageCountRef = useRef(messages.length);
  // Guard contra callbacks de rAF rodando após desmontagem do componente
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Agrupar mensagens por data (com separadores)
  const items: MessageListItem[] = useMemo(() => {
    const sorted = sortMessagesByTimestamp(messages);
    return groupMessagesByDate(sorted);
  }, [messages]);

  // Estimativa de altura por item (para primeiro render sem medir)
  const estimateSize = useCallback((index: number) => {
    const item = items[index];
    if (!item) return 60;
    if (item.type === 'date-separator') return 36;
    const msg = item.message;
    if (msg.type === 'image' || msg.type === 'video') return 360;
    if (msg.type === 'audio') return 72;
    if (msg.type === 'document') return 72;
    // Texto: estimar linhas baseado em chars
    const chars = msg.content?.length ?? 0;
    const lines = Math.ceil(chars / 45);
    return Math.max(48, lines * 22 + 32);
  }, [items]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 5,
    // Chave estável por id para recalcular altura quando conteúdo muda
    getItemKey: (index) => {
      const item = items[index];
      if (!item) return index;
      return item.type === 'date-separator' ? `sep-${item.label}` : item.message.id;
    },
  });

  // Detectar se usuário está no fundo do scroll
  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isScrolledToBottomRef.current = distanceFromBottom < 100;

    // Load more ao aproximar do topo
    if (el.scrollTop < 200 && onLoadMore && !isLoadingMore) {
      onLoadMore();
    }
  }, [onLoadMore, isLoadingMore]);

  // Auto-scroll para o fundo quando chegam novas mensagens
  useEffect(() => {
    const newCount = messages.length;
    const prevCount = prevMessageCountRef.current;
    prevMessageCountRef.current = newCount;

    if (!autoScroll) return;
    if (newCount <= prevCount) return;
    if (!isScrolledToBottomRef.current) return;

    // Rolar para o fundo via scrollTop direto — evita falha do scrollToIndex
    // com itens de tamanho dinâmico (imagens ainda não carregadas).
    const scrollToBottom = () => {
      if (!mountedRef.current) return;
      const el = parentRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
        isScrolledToBottomRef.current = true;
      }
    };

    // Duplo rAF: 1º frame o React renderiza, 2º frame o DOM mede as alturas
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToBottom);
    });
  }, [messages.length, items.length, autoScroll]);

  // Scroll inicial para o fundo na montagem
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    // Duplo rAF para garantir que o virtualizer mediu os itens
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!mountedRef.current) return;
        el.scrollTop = el.scrollHeight;
        isScrolledToBottomRef.current = true;
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // só na montagem

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto wa-chat-bg wa-scrollbar px-4 py-3"
      onScroll={handleScroll}
      style={{ position: 'relative' }}
    >
      {/* Spinner de carga de mensagens anteriores */}
      {isLoadingMore && (
        <div className="flex justify-center py-3">
          <div className="w-5 h-5 border-2 border-wa-accent-green/40 border-t-wa-accent-green rounded-full animate-spin" />
        </div>
      )}

      {/* Container virtual — altura total calculada pelo virtualizer */}
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          if (!item) return null;

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {item.type === 'date-separator' ? (
                <DateSeparator label={item.label} />
              ) : (
                <MessageBubble message={item.message} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Separador de data entre grupos de mensagens.
 * Estilo: pílula centralizada, como WhatsApp.
 */
function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex justify-center my-3 select-none">
      <span className="px-3 py-1 rounded-full text-[11px] font-medium bg-wa-bg-panel text-wa-text-secondary shadow-sm border border-wa-border">
        {label}
      </span>
    </div>
  );
}
