'use client';

import { useChatsStore } from '@/store/chats';
import type { ChatFilter } from '@/types';
import { cn } from '@/lib/utils';

const FILTERS: { key: ChatFilter; label: string; dot?: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'unread', label: 'Não lidas' },
  { key: 'waiting', label: 'Aguardando' },
  { key: 'mine', label: 'Minhas' },
  { key: 'instagram', label: 'Instagram', dot: '#e1306c' },
  { key: 'archived', label: 'Arquivadas' },
];

/**
 * Abas de filtro para a lista de chats.
 */
export function ChatFilters() {
  const { activeFilter, setFilter } = useChatsStore();

  return (
    <div className="flex gap-1 px-3 py-2 border-b border-[#e0e4ed] bg-white overflow-x-auto scrollbar-none">
      {FILTERS.map(({ key, label, dot }) => (
        <button
          key={key}
          onClick={() => setFilter(key)}
          className={cn(
            'flex items-center gap-1 px-[10px] py-[3px] text-[11px] font-medium rounded-full whitespace-nowrap transition-all border',
            activeFilter === key
              ? key === 'instagram'
                ? 'bg-[#fce4ec] text-[#c2185b] border-[#f48fb1]'
                : 'bg-[#e8f0fd] text-[#1a5fb4] border-[#b8d0f5]'
              : 'bg-white text-[#4a5168] border-[#e0e4ed] hover:border-[#3584e4] hover:text-[#1a5fb4]'
          )}
        >
          {dot && (
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: dot }}
            />
          )}
          {label}
        </button>
      ))}
    </div>
  );
}
