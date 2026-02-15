/**
 * Rate Limiter in-memory para APIs do VEXX CRM.
 *
 * Limita requests por IP ou tenant_id usando janela deslizante.
 * Funciona em ambiente serverless (memória por instância).
 * Para produção com múltiplas instâncias, migrar para Redis/Upstash.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Limpar entries expiradas a cada 60 segundos
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, 60_000);

interface RateLimitConfig {
  /** Número máximo de requests na janela */
  maxRequests: number;
  /** Janela em segundos */
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Verifica e registra uma request no rate limiter.
 *
 * @param key - Chave única (ex: `anne-chat:${tenantId}`, `whatsapp-send:${ip}`)
 * @param config - Configuração de limite
 * @returns Se a request é permitida, quantas restam e quando reseta
 *
 * @example
 * const result = checkRateLimit(`anne-chat:${tenantId}`, { maxRequests: 30, windowSeconds: 60 });
 * if (!result.allowed) {
 *   return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
 * }
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;

  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    // Nova janela
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + windowMs };
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
}

/**
 * Configs pré-definidas para rotas críticas.
 */
export const RATE_LIMITS = {
  /** Anne chat: 30 requests por minuto por tenant */
  ANNE_CHAT: { maxRequests: 30, windowSeconds: 60 },
  /** WhatsApp send: 60 mensagens por minuto por tenant */
  WHATSAPP_SEND: { maxRequests: 60, windowSeconds: 60 },
  /** Auto-sync: 2 requests por minuto por tenant (evita race condition) */
  AUTO_SYNC: { maxRequests: 2, windowSeconds: 60 },
  /** Cron sync: 1 request por 5 minutos */
  CRON_SYNC: { maxRequests: 1, windowSeconds: 300 },
  /** Webhooks: 120 requests por minuto por IP */
  WEBHOOK: { maxRequests: 120, windowSeconds: 60 },
} as const;
