import { create } from 'zustand';

import type { Chat, ChatFilter } from '@/types';

interface ChatsState {
  /** Chat selecionado atualmente */
  selectedChatId: string | null;
  /** Filtro ativo */
  activeFilter: ChatFilter;
  /** Texto de busca */
  searchQuery: string;
  /** IDs de chats com indicador de digitação */
  typingChats: Set<string>;

  /** Selecionar chat */
  selectChat: (chatId: string | null) => void;
  /** Definir filtro */
  setFilter: (filter: ChatFilter) => void;
  /** Definir busca */
  setSearchQuery: (query: string) => void;
  /** Set typing indicator */
  setTyping: (clientId: string, isTyping: boolean) => void;
}

export const useChatsStore = create<ChatsState>()((set) => ({
  selectedChatId: null,
  activeFilter: 'all',
  searchQuery: '',
  typingChats: new Set(),

  selectChat: (chatId) => set({ selectedChatId: chatId }),

  setFilter: (filter) =>
    set({ activeFilter: filter }),

  setSearchQuery: (query) =>
    set({ searchQuery: query }),

  setTyping: (clientId, isTyping) =>
    set((state) => {
      const newSet = new Set(state.typingChats);
      if (isTyping) {
        newSet.add(clientId);
      } else {
        newSet.delete(clientId);
      }
      return { typingChats: newSet };
    }),
}));
