'use client';

import { useEffect, useCallback } from 'react';

import { useChatsStore } from '@/store/chats';

interface KeyboardShortcutsConfig {
  onSendMessage?: () => void;
  onFocusSearch?: () => void;
  onShowHelp?: () => void;
}

/**
 * Hook para atalhos de teclado globais.
 *
 * - Ctrl/Cmd + K → Focar na busca
 * - Ctrl/Cmd + Enter → Enviar mensagem
 * - Ctrl/Cmd + / → Mostrar ajuda
 * - Ctrl/Cmd + 1-9 → Alternar entre chats
 * - Escape → Fechar painéis
 */
export function useKeyboardShortcuts(config?: KeyboardShortcutsConfig) {
  const { selectChat } = useChatsStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isModifier = e.ctrlKey || e.metaKey;

      // Ctrl/Cmd + K → Focar na busca
      if (isModifier && e.key === 'k') {
        e.preventDefault();
        config?.onFocusSearch?.();
      }

      // Ctrl/Cmd + Enter → Enviar mensagem
      if (isModifier && e.key === 'Enter') {
        e.preventDefault();
        config?.onSendMessage?.();
      }

      // Ctrl/Cmd + / → Mostrar ajuda
      if (isModifier && e.key === '/') {
        e.preventDefault();
        config?.onShowHelp?.();
      }

      // Escape → Deselecionar chat
      if (e.key === 'Escape') {
        selectChat(null);
      }
    },
    [config, selectChat]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
