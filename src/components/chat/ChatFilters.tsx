'use client';

import { useChatsStore } from '@/store/chats';
import type { ChatFilter } from '@/types';
import { cn } from '@/lib/utils';

const FILTERS: { key: ChatFilter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'unread', label: 'Não lidas' },
  { key: 'waiting', label: 'Aguardando' },
  { key: 'mine', label: 'Minhas' },
  { key: 'archived', label: 'Arquivadas' },
];

/**
 * Abas de filtro para a lista de chats.
 */
export function ChatFilters() {
  const { activeFilter, setFilter } = useChatsStore();

  return (
    <div className="flex gap-1 px-3 py-2 border-b border-wa-border bg-wa-bg-panel">
      {FILTERS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => setFilter(key)}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
            activeFilter === key
              ? 'bg-wa-accent-green text-white'
              : 'text-wa-text-secondary hover:bg-wa-bg-hover hover:text-wa-text-primary'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
