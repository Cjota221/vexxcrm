'use client';

import { useState, useMemo } from 'react';
import { Search, Filter } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { formatRelativeTime, truncate, getInitials, getAvatarColor } from '@/lib/utils';
import { api } from '@/lib/api';
import { useChatsStore } from '@/store/chats';
import type { Chat, ChatFilter } from '@/types';

const FILTERS: { label: string; value: ChatFilter }[] = [
  { label: 'Todas', value: 'all' },
  { label: 'Não lidas', value: 'unread' },
  { label: 'Aguardando', value: 'waiting' },
  { label: 'Minhas', value: 'mine' },
  { label: 'Arquivadas', value: 'archived' },
];

/**
 * Lista de conversas (sidebar esquerda do atendimento).
 */
export function ChatList() {
  const { selectedChatId, selectChat, activeFilter, setFilter, searchQuery, setSearchQuery } = useChatsStore();

  const { data: chats = [], isLoading } = useQuery({
    queryKey: ['chats', activeFilter],
    queryFn: async () => {
      const response = await api.get<Chat[]>('/api/chats', { filter: activeFilter });
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    staleTime: 30_000,
  });

  // Filtrar por busca local
  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats;
    const q = searchQuery.toLowerCase();
    return chats.filter(
      (chat) =>
        chat.client.name.toLowerCase().includes(q) ||
        chat.client.phone.includes(q)
    );
  }, [chats, searchQuery]);

  return (
    <div className="w-80 border-r border-surface-border flex flex-col bg-white h-full">
      {/* Header */}
      <div className="p-4 border-b border-surface-border space-y-3">
        <h2 className="text-lg font-semibold text-txt-primary">Conversas</h2>

        {/* Search */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
          <input
            type="text"
            placeholder="Buscar conversa..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-9 py-2 text-sm bg-surface-bg"
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

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-3 p-3">
                <div className="skeleton w-11 h-11 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-24" />
                  <div className="skeleton h-3 w-40" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-txt-muted">Nenhuma conversa encontrada</p>
          </div>
        ) : (
          filteredChats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => selectChat(chat.client.id)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-surface-border/50',
                selectedChatId === chat.client.id
                  ? 'bg-crm-primary/5'
                  : 'hover:bg-slate-50'
              )}
            >
              {/* Avatar */}
              {chat.client.avatar_url ? (
                <img
                  src={chat.client.avatar_url}
                  alt={chat.client.name}
                  className="w-11 h-11 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-semibold"
                  style={{ backgroundColor: getAvatarColor(chat.client.name) }}
                >
                  {getInitials(chat.client.name)}
                </div>
              )}

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className={cn(
                    'text-sm truncate',
                    chat.unread_count > 0 ? 'font-semibold text-txt-primary' : 'font-medium text-txt-primary'
                  )}>
                    {chat.client.name}
                  </p>
                  <span className="text-[11px] text-txt-muted flex-shrink-0 ml-2">
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
                    <span className="ml-2 flex-shrink-0 w-5 h-5 bg-crm-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {chat.unread_count > 9 ? '9+' : chat.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
