/**
 * FacilZap Sync Logger — Log de sincronização no sync_audit_log.
 *
 * Registra cada operação de sync (cron, webhook, manual) com:
 * - Timing (started_at, finished_at, duration)
 * - Contadores (records_imported, records_updated, records_new, errors)
 * - Status (running, success, error, partial)
 * - Diagnóstico (errors, warnings, integrity)
 *
 * @module facilzap/sync-logger
 */

import { createServerSupabaseClient } from '@/lib/supabase';

type SupabaseAdmin = ReturnType<typeof createServerSupabaseClient>;

export interface SyncLogEntry {
  id?: string;
  tenant_id: string;
  sync_type: 'incremental' | 'deep' | 'full' | 'webhook';
  source: 'facilzap' | 'evolution' | 'manual' | 'cron' | 'webhook';
  status: 'running' | 'success' | 'error' | 'partial';
  started_at: string;
  finished_at?: string;
  duration_secs?: number;
  pages_processed?: number;
  api_total_records?: number;
  records_imported?: number;
  records_updated?: number;
  records_new?: number;
  records_duplicated?: number;
  total_errors?: number;
  integrity_ok?: boolean;
  divergence_found?: boolean;
  coverage_percent?: number;
  date_from?: string;
  date_to?: string;
  page_from?: number;
  page_to?: number;
  errors?: unknown[];
  warnings?: unknown[];
  config_used?: Record<string, unknown>;
  needs_manual?: boolean;
}

/**
 * Classe para gerenciar o ciclo de vida de um log de sincronização.
 *
 * @example
 * const logger = new SyncLogger(supabase, tenantId, 'incremental', 'cron');
 * await logger.start();
 *
 * // ... execução da sync ...
 * logger.addRecords(50, 5, 2);
 * logger.addError('Falha ao processar produto X');
 *
 * await logger.finish('success');
 */
export class SyncLogger {
  private supabase: SupabaseAdmin;
  private tenantId: string;
  private syncType: SyncLogEntry['sync_type'];
  private source: SyncLogEntry['source'];
  private logId: string | null = null;
  private startTime: number = Date.now();
  private errors: string[] = [];
  private warnings: string[] = [];
  private recordsImported = 0;
  private recordsUpdated = 0;
  private recordsNew = 0;
  private recordsDuplicated = 0;
  private pagesProcessed = 0;
  private apiTotalRecords: number | null = null;

  constructor(
    supabase: SupabaseAdmin,
    tenantId: string,
    syncType: SyncLogEntry['sync_type'],
    source: SyncLogEntry['source']
  ) {
    this.supabase = supabase;
    this.tenantId = tenantId;
    this.syncType = syncType;
    this.source = source;
  }

  /**
   * Inicia o log de sincronização (insere no banco com status 'running').
   */
  async start(config?: Record<string, unknown>): Promise<string | null> {
    this.startTime = Date.now();
    try {
      const { data, error } = await this.supabase
        .from('sync_audit_log')
        .insert({
          tenant_id: this.tenantId,
          sync_type: this.syncType,
          source: this.source,
          status: 'running',
          started_at: new Date().toISOString(),
          config_used: config || null,
        })
        .select('id')
        .single();

      if (error) {
        console.error('[SyncLogger] Erro ao criar log:', error.message);
        return null;
      }

      this.logId = data?.id || null;
      console.log(`[SyncLogger] Log iniciado: ${this.logId} (${this.syncType}/${this.source})`);
      return this.logId;
    } catch (err: unknown) {
      console.error('[SyncLogger] Erro ao criar log:', (err as Error).message);
      return null;
    }
  }

  /** Incrementa contadores de registros */
  addRecords(imported: number, updated: number = 0, newRecords: number = 0): void {
    this.recordsImported += imported;
    this.recordsUpdated += updated;
    this.recordsNew += newRecords;
  }

  /** Incrementa duplicados */
  addDuplicated(count: number): void {
    this.recordsDuplicated += count;
  }

  /** Incrementa páginas processadas */
  addPage(): void {
    this.pagesProcessed++;
  }

  /** Define total de registros na API */
  setApiTotal(total: number): void {
    this.apiTotalRecords = total;
  }

  /** Adiciona erro */
  addError(error: string): void {
    this.errors.push(error);
    console.error(`[SyncLogger] Erro: ${error}`);
  }

  /** Adiciona warning */
  addWarning(warning: string): void {
    this.warnings.push(warning);
    console.warn(`[SyncLogger] Warning: ${warning}`);
  }

  /**
   * Finaliza o log de sincronização.
   * Calcula duração, coverage, e atualiza o registro no banco.
   */
  async finish(
    status: 'success' | 'error' | 'partial',
    extra?: Partial<SyncLogEntry>
  ): Promise<void> {
    const durationMs = Date.now() - this.startTime;
    const durationSecs = Math.round(durationMs / 1000);

    // Calcular coverage
    let coveragePercent: number | null = null;
    let integrityOk: boolean | null = null;
    let divergenceFound = false;

    if (this.apiTotalRecords !== null && this.apiTotalRecords > 0) {
      coveragePercent = Math.round(
        (this.recordsImported / this.apiTotalRecords) * 10000
      ) / 100;
      integrityOk = coveragePercent >= 95;
      divergenceFound = coveragePercent < 100;
    }

    const update: Record<string, unknown> = {
      status: this.errors.length > 0 && this.recordsImported > 0 ? 'partial' : status,
      finished_at: new Date().toISOString(),
      duration_secs: durationSecs,
      pages_processed: this.pagesProcessed,
      api_total_records: this.apiTotalRecords,
      records_imported: this.recordsImported,
      records_updated: this.recordsUpdated,
      records_new: this.recordsNew,
      records_duplicated: this.recordsDuplicated,
      total_errors: this.errors.length,
      errors: this.errors.length > 0 ? this.errors : null,
      warnings: this.warnings.length > 0 ? this.warnings : null,
      integrity_ok: integrityOk,
      divergence_found: divergenceFound,
      coverage_percent: coveragePercent,
      ...extra,
    };

    if (!this.logId) {
      console.warn('[SyncLogger] Sem logId, log não será atualizado no banco');
      console.log('[SyncLogger] Resultado:', JSON.stringify(update));
      return;
    }

    try {
      const { error } = await this.supabase
        .from('sync_audit_log')
        .update(update)
        .eq('id', this.logId);

      if (error) {
        console.error('[SyncLogger] Erro ao finalizar log:', error.message);
      } else {
        console.log(
          `[SyncLogger] Log ${this.logId} finalizado: ${update.status} ` +
          `(${this.recordsImported} importados, ${this.errors.length} erros, ${durationSecs}s)`
        );
      }
    } catch (err: unknown) {
      console.error('[SyncLogger] Erro ao finalizar log:', (err as Error).message);
    }
  }

  /** Retorna resumo atual (sem salvar no banco) */
  getSummary(): Record<string, unknown> {
    return {
      logId: this.logId,
      syncType: this.syncType,
      source: this.source,
      durationMs: Date.now() - this.startTime,
      recordsImported: this.recordsImported,
      recordsUpdated: this.recordsUpdated,
      recordsNew: this.recordsNew,
      recordsDuplicated: this.recordsDuplicated,
      pagesProcessed: this.pagesProcessed,
      apiTotalRecords: this.apiTotalRecords,
      errors: this.errors,
      warnings: this.warnings,
    };
  }
}

/**
 * Helper: Busca último log de sync para um tenant.
 */
export async function getLastSyncLog(
  supabase: SupabaseAdmin,
  tenantId: string,
  syncType?: string
): Promise<SyncLogEntry | null> {
  let query = supabase
    .from('sync_audit_log')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('started_at', { ascending: false })
    .limit(1);

  if (syncType) {
    query = query.eq('sync_type', syncType);
  }

  const { data } = await query;
  return data?.[0] || null;
}

/**
 * Helper: Verifica se um sync já está rodando (evita duplicação).
 */
export async function isSyncRunning(
  supabase: SupabaseAdmin,
  tenantId: string,
  syncType?: string
): Promise<boolean> {
  let query = supabase
    .from('sync_audit_log')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'running');

  if (syncType) {
    query = query.eq('sync_type', syncType);
  }

  const { data } = await query;
  return (data?.length || 0) > 0;
}
