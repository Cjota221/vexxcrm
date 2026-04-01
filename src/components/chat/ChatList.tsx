'use client';

import { useState, useMemo, useRef, useCallback, useEffect, memo } from 'react';
import { Search, Filter, Loader2, RefreshCw, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime, truncate, getInitials, getAvatarColor } from '@/lib/utils';
import { useChatsStore } from '@/store/chats';
import { useInfiniteChats, useRefreshChats } from '@/hooks/useChats';
import { useDebounce } from '@/hooks/useDebounce';
import { AvatarImage } from '@/components/ui/AvatarImage';
import type { Chat, ChatFilter } from '@/types';

const FILTERS: { label: string; value: ChatFilter }[] = [
  { label: 'Todas', value: 'all' },
  { label: 'Não lidas', value: 'unread' },
  { label: 'Aguardando', value: 'waiting' },
  { label: 'Minhas', value: 'mine' },
  { label: 'Arquivadas', value: 'archived' },
];

/**
 * Lista de conversas com infinite scroll.
 * Carrega 25 por vez para suportar milhares de chats sem travar.
 */
export function ChatList() {
  const { selectedChatId, selectChat, activeFilter, setFilter, searchQuery, setSearchQuery } = useChatsStore();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const refreshChats = useRefreshChats();

  // Debounce de 300ms no search para evitar API calls a cada keystroke
  const debouncedSearch = useDebounce(searchQuery, 300);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteChats(activeFilter, debouncedSearch);

  // Flatten all pages into single array
  const chats = useMemo(() => {
    return data?.pages.flatMap(page => page.data) ?? [];
  }, [data]);

  // Total count
  const totalCount = data?.pages[0]?.pagination?.total || chats.length;

  // ─── Força fetch completo ao montar a Central ───
  // Garante que a lista nunca dependa de cache antigo ao abrir a página.
  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Infinite scroll observer
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  useEffect(() => {
    observerRef.current = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: '100px',
      threshold: 0,
    });

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [handleObserver]);

  return (
    <div className="flex flex-col bg-white h-full">
      {/* Header */}
      <div className="p-4 border-b border-surface-border space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-txt-primary">Conversas</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-txt-muted">
              {totalCount > 0 ? `${totalCount} total` : ''}
            </span>
            <button
              onClick={() => refetch()}
              className="p-1.5 rounded-lg hover:bg-surface-100 text-txt-secondary transition-colors"
              title="Atualizar lista"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
          <input
            type="text"
            placeholder="Buscar conversa..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-9 py-2 text-sm bg-surface-bg w-full"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                activeFilter === f.value
                  ? 'bg-crm-primary text-white'
                  : 'bg-slate-100 text-txt-secondary hover:bg-slate-200'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chat list with infinite scroll */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-3 p-3">
                <div className="skeleton w-11 h-11 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-24" />
                  <div className="skeleton h-3 w-40" />
                </div>
              </div>
            ))}
          </div>
        ) : chats.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-txt-muted">Nenhuma conversa encontrada</p>
            <button
              onClick={() => refetch()}
              className="mt-3 text-xs text-crm-primary hover:underline"
            >
              Recarregar
            </button>
          </div>
        ) : (
          <>
            {chats.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                isSelected={selectedChatId === chat.client.id}
                onSelect={() => selectChat(chat.client.id)}
              />
            ))}

            {/* Infinite scroll trigger */}
            <div ref={loadMoreRef} className="h-8 flex items-center justify-center">
              {isFetchingNextPage && (
                <Loader2 size={16} className="animate-spin text-crm-primary" />
              )}
              {!hasNextPage && chats.length > 0 && (
                <span className="text-xs text-txt-muted py-4">
                  Fim da lista
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Item individual da lista de chat (memoizado para performance).
 * Re-renderiza apenas quando chat, seleção ou callback mudam.
 */
const ChatListItem = memo(function ChatListItem({ chat, isSelected, onSelect }: {
  chat: Chat;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-surface-border/50',
        isSelected ? 'bg-crm-primary/5' : 'hover:bg-slate-50'
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <AvatarImage
          src={chat.client.avatar_url}
          name={chat.client.name}
          size={44}
          rounded="full"
        />
        {chat.is_group && (
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
            <Users size={9} className="text-white" />
          </span>
        )}
        {!chat.is_group && chat.canal === 'instagram' && (
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
            style={{ background: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%,#d6249f 60%,#285AEB 90%)' }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="white">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="none" stroke="white" strokeWidth="2.5"/>
              <circle cx="12" cy="12" r="4.5" fill="none" stroke="white" strokeWidth="2.5"/>
              <circle cx="18" cy="6" r="1.2" fill="white"/>
            </svg>
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className={cn(
            'text-sm truncate',
            chat.unread_count > 0 ? 'font-semibold text-txt-primary' : 'font-medium text-txt-primary'
          )}>
            {chat.client.name}
          </p>
          <span className="text-[11px] text-txt-muted shrink-0 ml-2">
            {chat.last_message?.timestamp
              ? formatRelativeTime(chat.last_message.timestamp)
              : ''}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-txt-secondary truncate">
            {chat.last_message
              ? truncate(chat.last_message.content || '📷 Mídia', 40)
              : 'Sem mensagens'}
          </p>
          {chat.unread_count > 0 && (
            <span className="ml-2 shrink-0 w-5 h-5 bg-crm-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {chat.unread_count > 9 ? '9+' : chat.unread_count}
            </span>
          )}
        </div>
        {/* Badges de etiqueta */}
        {chat.labels && chat.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {chat.labels.slice(0, 3).map(label => (
              <span
                key={label.id}
                className="inline-block text-[10px] px-1.5 py-0 rounded-full text-white font-medium leading-4 max-w-20 truncate"
                style={{ backgroundColor: label.cor_hex || '#ABB8C3' }}
                title={label.name}
              >
                {label.name}
              </span>
            ))}
            {chat.labels.length > 3 && (
              <span className="text-[10px] text-txt-muted">+{chat.labels.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </button>
  );
});
