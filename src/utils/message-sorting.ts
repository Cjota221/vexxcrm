/**
 * message-sorting.ts
 * Utilitários de ordenação e agrupamento de mensagens por data.
 */

import type { Message } from '@/types';

// ─── Ordenação por timestamp ──────────────────────────────────────────────────

export function sortMessagesByTimestamp(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => {
    const tA = new Date(a.timestamp ?? a.created_at).getTime();
    const tB = new Date(b.timestamp ?? b.created_at).getTime();
    if (tA !== tB) return tA - tB;
    // Mensagens optimistic sempre vão para o final
    if ((a as any)._optimistic && !(b as any)._optimistic) return 1;
    if (!(a as any)._optimistic && (b as any)._optimistic) return -1;
    return a.id.localeCompare(b.id);
  });
}

// ─── Separadores de data ──────────────────────────────────────────────────────

export type MessageListItem =
  | { type: 'date-separator'; date: Date; label: string }
  | { type: 'message'; message: Message };

export function groupMessagesByDate(messages: Message[]): MessageListItem[] {
  const result: MessageListItem[] = [];
  let lastDateKey: string | null = null;

  for (const message of messages) {
    const msgDate = new Date(message.timestamp ?? message.created_at);
    const dateKey = msgDate.toDateString();

    if (dateKey !== lastDateKey) {
      result.push({
        type: 'date-separator',
        date: msgDate,
        label: formatDateSeparator(msgDate),
      });
      lastDateKey = dateKey;
    }

    result.push({ type: 'message', message });
  }

  return result;
}

function formatDateSeparator(date: Date): string {
  const now = new Date();
  const diffMs = now.setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0);
  const diffDays = Math.round(diffMs / 86_400_000);

  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return date.toLocaleDateString('pt-BR', { weekday: 'long' });
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
