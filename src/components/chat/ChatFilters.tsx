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
    <div className="flex gap-1 px-3 py-2 border-b border-[#e0e4ed] bg-white overflow-x-auto scrollbar-none">
      {FILTERS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => setFilter(key)}
          className={cn(
            'px-[10px] py-[3px] text-[11px] font-medium rounded-full whitespace-nowrap transition-all border',
            activeFilter === key
              ? 'bg-[#e8f0fd] text-[#1a5fb4] border-[#b8d0f5]'
              : 'bg-white text-[#4a5168] border-[#e0e4ed] hover:border-[#3584e4] hover:text-[#1a5fb4]'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
