import { EventEmitter } from 'events';

/**
 * Event Bus multi-tenant para comunicação real-time.
 *
 * Eventos são isolados por tenant_id, garantindo que
 * nenhum tenant receba eventos de outro.
 *
 * @example
 * // Emitir evento
 * eventBus.emitToTenant('new_message', 'tenant-uuid', { message });
 *
 * // Escutar evento
 * eventBus.onTenant('new_message', 'tenant-uuid', (data) => { ... });
 *
 * // Remover listener
 * eventBus.offTenant('new_message', 'tenant-uuid', listener);
 */
class TenantEventBus extends EventEmitter {
  constructor() {
    super();
    // Aumenta o limite de listeners para suportar múltiplas conexões SSE
    this.setMaxListeners(100);
  }

  /**
   * Compõe a chave do evento com o tenant_id para isolamento.
   */
  private key(event: string, tenantId: string): string {
    return `${event}:${tenantId}`;
  }

  /**
   * Emite um evento para um tenant específico.
   */
  emitToTenant(event: string, tenantId: string, data: unknown): boolean {
    return this.emit(this.key(event, tenantId), data);
  }

  /**
   * Registra um listener para um evento de um tenant específico.
   */
  onTenant(
    event: string,
    tenantId: string,
    listener: (data: unknown) => void
  ): this {
    return this.on(this.key(event, tenantId), listener);
  }

  /**
   * Remove um listener de um evento de um tenant específico.
   */
  offTenant(
    event: string,
    tenantId: string,
    listener: (data: unknown) => void
  ): this {
    return this.off(this.key(event, tenantId), listener);
  }

  /**
   * Registra um listener de uso único para um evento de um tenant específico.
   */
  onceTenant(
    event: string,
    tenantId: string,
    listener: (data: unknown) => void
  ): this {
    return this.once(this.key(event, tenantId), listener);
  }
}

/** Singleton do Event Bus — compartilhado por toda a aplicação server-side */
export const eventBus = new TenantEventBus();
