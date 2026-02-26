import { type ClassValue, clsx } from 'clsx';

/**
 * Combina classes CSS condicionalmente.
 * Usa clsx para merge seguro.
 *
 * @example
 * cn('btn', isActive && 'btn-primary', className)
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/**
 * Formata valor monetário em Real (BRL).
 * Guard defensivo: undefined/null/NaN retornam 'R$ 0,00'
 *
 * @example
 * formatCurrency(1234.5) → 'R$ 1.234,50'
 * formatCurrency(undefined) → 'R$ 0,00'
 */
export function formatCurrency(value: number | null | undefined): string {
  const safe = typeof value === 'number' && !isNaN(value) ? value : 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(safe);
}

/**
 * Formata data relativa ("5min atrás", "Ontem", etc.)
 * Guard defensivo: null/undefined retornam ''
 */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return '';
  const now = new Date();
  const then = new Date(date);
  if (isNaN(then.getTime())) return '';
  const diffMs = now.getTime() - then.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'Agora';
  if (diffMinutes < 60) return `${diffMinutes}min`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return `${diffDays}d`;

  return then.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

/**
 * Formata data completa.
 * Guard defensivo: null/undefined retornam ''
 *
 * @example
 * formatDate('2026-01-15T10:30:00') → '15/01/2026'
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
}

/**
 * Formata hora.
 *
 * @example
 * formatTime('2026-01-15T10:30:00') → '10:30'
 */
export function formatTime(date: string | Date | null | undefined): string {
  if (!date) return '--:--';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Trunca texto com reticências.
 *
 * @example
 * truncate('Lorem ipsum dolor sit amet', 20) → 'Lorem ipsum dolor...'
 */
export function truncate(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text || '';
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Gera iniciais do nome para avatar.
 *
 * @example
 * getInitials('João Silva') → 'JS'
 * getInitials('Maria')      → 'MA'
 */
export function getInitials(name: string): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Debounce genérico.
 */
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Gera cor de avatar baseada no nome (consistente).
 */
export function getAvatarColor(name: string): string {
  const colors = [
    '#1e3a5f', '#059669', '#d97706', '#dc2626', '#7c3aed',
    '#0891b2', '#be185d', '#4f46e5', '#ea580c', '#0d9488',
  ];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Delay utility (para uso em sequências de campanha, etc.)
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verifica se estamos no client-side.
 */
export function isClient(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Copia texto para clipboard.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Exibe o número do pedido de forma legível.
 * Se o order_number for um UUID (Supabase PK) ou vazio, usa external_id.
 * FacilZap retorna o `codigo` como "GKFS7p" (alfanumérico curto).
 *
 * @example
 * displayOrderNumber('GKFS7p', '5255125') → 'GKFS7p'
 * displayOrderNumber('a1b2c3d4-...uuid...', '5255125') → '5255125'
 * displayOrderNumber(null, '5255125') → '5255125'
 */
export function displayOrderNumber(orderNumber?: string | null, externalId?: string | null): string {
  // Se order_number parece UUID (36 chars com hífens), usar external_id
  if (orderNumber && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderNumber)) {
    return externalId || orderNumber;
  }
  return orderNumber || externalId || '—';
}
