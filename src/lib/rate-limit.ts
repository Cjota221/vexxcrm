/**
 * rate-limit.ts — Rate limiter em memória para rotas sensíveis
 *
 * Estratégia: sliding-window por (tenantId + rota).
 * Não precisa de Redis — funciona em Netlify Functions/Edge.
 * Atenção: cada instância serverless tem memória própria; o limite
 * é por instância, não global. Para produção de alto volume, substituir
 * por Upstash Redis (drop-in: basta trocar o store abaixo).
 */

interface RateLimitEntry {
  count: number;
  resetAt: number; // epoch ms
}

// Map global preservado entre invocações dentro da mesma instância
const store = new Map<string, RateLimitEntry>();

export interface RateLimitOptions {
  /** Máximo de requisições no janela */
  limit?: number;
  /** Duração da janela em milissegundos */
  windowMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Segundos até o reset (presente apenas quando bloqueado) */
  retryAfter?: number;
  /** Requisições restantes nesta janela */
  remaining: number;
}

/**
 * Verifica se a requisição está dentro do limite.
 *
 * @param key  Identificador único: normalmente `${tenantId}:${rota}`
 * @param opts Opções (limit = 60, windowMs = 60_000)
 */
export function checkRateLimit(
  key: string,
  opts: RateLimitOptions = {}
): RateLimitResult {
  const limit = opts.limit ?? 60;
  const windowMs = opts.windowMs ?? 60_000;
  const now = Date.now();

  let entry = store.get(key);

  // Janela expirou ou nunca existiu → reset
  if (!entry || now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + windowMs };
    store.set(key, entry);
    return { allowed: true, remaining: limit - 1 };
  }

  entry.count += 1;

  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter, remaining: 0 };
  }

  return { allowed: true, remaining: limit - entry.count };
}

/**
 * Limpeza periódica de entradas expiradas para evitar crescimento
 * ilimitado do Map em instâncias de longa duração.
 * Chamada automaticamente a cada 5 minutos.
 */
function pruneExpired() {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now >= entry.resetAt) store.delete(key);
  }
}

// Agenda limpeza (não bloqueia nada, é fire-and-forget)
if (typeof setInterval !== 'undefined') {
  setInterval(pruneExpired, 5 * 60_000);
}
