/**
 * message-sorting.ts
 * Utilitários de ordenação e agrupamento de mensagens por data.
 */

import type { Message } from '@/types';

// ─── Ordenação por timestamp ──────────────────────────────────────────────────

/**
 * Converte timestamp de mensagem para milissegundos.
 * A Evolution API envia timestamps como Unix epoch em SEGUNDOS (ex: 1705432800).
 * `new Date(1705432800)` resultaria em 1970 — precisamos multiplicar por 1000.
 */
function toMs(value: string | number | null | undefined): number {
  if (!value) return 0;
  const n = typeof value === 'string' ? Number(value) : value;
  if (isNaN(n)) {
    // String ISO (ex: "2024-01-17T00:00:00Z") — parsear diretamente
    return new Date(value as string).getTime();
  }
  // Heurística: epoch em segundos tem < 10 dígitos (até 2286)
  return n < 1e10 ? n * 1000 : n;
}

export function sortMessagesByTimestamp(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => {
    const tA = toMs(a.timestamp ?? a.created_at);
    const tB = toMs(b.timestamp ?? b.created_at);
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
    const msgDate = new Date(toMs(message.timestamp ?? message.created_at));
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
