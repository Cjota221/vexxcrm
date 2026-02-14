/**
 * Resilient Sync Service — Sincronização completa FacilZap → Supabase.
 *
 * Características:
 * - Loop de paginação infinito (sem limite artificial de 50 páginas)
 * - Retry exponencial com backoff (3 tentativas por página)
 * - Checkpoints a cada N páginas (retomada após falha)
 * - Processamento em batches de 100 (upsert atômico)
 * - Resolução de clientes multi-estratégia (phone → facilzap_id → email → nome)
 * - Auto-criação de clientes quando não encontrados
 * - Progresso em tempo real via sync_executions
 * - Integração com SyncLogger para auditoria
 *
 * Reutiliza:
 * - facilzap.service.ts (fetchOrders, fetchAllClients)
 * - mapper.ts (mapClients, mapOrders, buildClientLookup, upsertClients, upsertOrders, updateClientStats, relinkOrphans)
 * - sync-logger.ts (SyncLogger)
 * - phone-normalizer.ts (PhoneNormalizer.canonical)
 *
 * @module services/resilient-sync
 */

import { createServerSupabaseClient } from '@/lib/supabase';
import {
  fetchOrders,
  fetchAllClients,
  type FacilZapConfig,
} from '@/lib/services/facilzap.service';
import {
  mapClients,
  mapOrders,
  buildClientLookup,
  upsertClients,
  upsertOrders,
  updateClientStats,
  relinkOrphans,
  type ClientLookup,
  type UpsertResult,
} from '@/lib/facilzap/mapper';
import { SyncLogger } from '@/lib/facilzap/sync-logger';

type SupabaseAdmin = ReturnType<typeof createServerSupabaseClient>;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TYPES
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export interface SyncConfig {
  startDate?: string;       // YYYY-MM-DD (default: 5 years ago)
  endDate?: string;         // YYYY-MM-DD (default: today)
  pageSize?: number;        // items per page (default: 100)
  maxPages?: number;        // safety limit (default: 500, null = unlimited)
  checkpointInterval?: number; // save checkpoint every N pages (default: 10)
  forceReimport?: boolean;  // re-process existing orders
  skipIntegrityCheck?: boolean;
  triggerSource?: 'manual' | 'scheduled' | 'auto_repair' | 'webhook';
}

export interface SyncStats {
  totalPages: number;
  totalRecordsFetched: number;
  totalRecordsInserted: number;
  totalRecordsUpdated: number;
  totalRecordsSkipped: number;
  totalRecordsFailed: number;
  totalClientsCreated: number;
  totalClientsMatched: number;
  totalClientsUpdated: number;
  errors: Array<{ phase: string; page?: number; error: string; timestamp: string }>;
}

export interface SyncResult {
  execution_id: string;
  status: 'completed' | 'failed' | 'partial';
  stats: SyncStats;
  integrityCheck: IntegrityCheck | null;
  duration_ms: number;
}

export interface IntegrityCheck {
  supabase_total: number;
  orphaned_records: number;
  orphan_percent: number;
  relinked_count: number;
  data_quality_score: number;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SERVICE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export class ResilientSyncService {
  private supabase: SupabaseAdmin;
  private tenantId: string;
  private facilzapConfig: FacilZapConfig;
  private executionId: string | null = null;
  private logger: SyncLogger;
  private clientLookup: ClientLookup | null = null;

  private stats: SyncStats = {
    totalPages: 0,
    totalRecordsFetched: 0,
    totalRecordsInserted: 0,
    totalRecordsUpdated: 0,
    totalRecordsSkipped: 0,
    totalRecordsFailed: 0,
    totalClientsCreated: 0,
    totalClientsMatched: 0,
    totalClientsUpdated: 0,
    errors: [],
  };

  constructor(supabase: SupabaseAdmin, tenantId: string, facilzapConfig: FacilZapConfig) {
    this.supabase = supabase;
    this.tenantId = tenantId;
    this.facilzapConfig = facilzapConfig;
    this.logger = new SyncLogger(supabase, tenantId, 'full', 'manual');
  }

  /* ─── MAIN: Sincronização completa ─── */

  async executeFullSync(config: SyncConfig = {}): Promise<SyncResult> {
    const {
      startDate,
      endDate = new Date().toISOString().split('T')[0],
      pageSize = 100,
      maxPages = 500,
      checkpointInterval = 10,
      forceReimport = false,
      skipIntegrityCheck = false,
      triggerSource = 'manual',
    } = config;

    // Calcular startDate default: 5 anos atrás
    const defaultStart = new Date();
    defaultStart.setFullYear(defaultStart.getFullYear() - 5);
    const effectiveStartDate = startDate || defaultStart.toISOString().split('T')[0];

    const startTime = Date.now();
    console.log(`🚀 [ResilientSync] Iniciando sync completa`);
    console.log(`📅 Período: ${effectiveStartDate} → ${endDate}`);
    console.log(`📦 Page size: ${pageSize} | Max pages: ${maxPages || 'ilimitado'}`);

    try {
      // 1. Criar execução no banco
      this.executionId = await this.createExecution({
        start_date: effectiveStartDate,
        end_date: endDate,
        page_size: pageSize,
        max_pages: maxPages,
        force_reimport: forceReimport,
        trigger_source: triggerSource,
      });

      // Iniciar SyncLogger
      this.logger = new SyncLogger(this.supabase, this.tenantId, 'full', triggerSource === 'scheduled' ? 'cron' : 'manual');
      await this.logger.start({ start_date: effectiveStartDate, end_date: endDate, page_size: pageSize });

      await this.updateExecution({ status: 'running', started_at: new Date().toISOString(), current_phase: 'loading_clients' });

      // 2. Carregar lookup de clientes existentes
      console.log('👥 [ResilientSync] Carregando clientes existentes...');
      await this.loadClientLookup();
      console.log(`👥 [ResilientSync] Lookup carregado: ${this.clientLookup ? 'OK' : 'VAZIO'}`);

      // 3. Sincronizar clientes da FacilZap primeiro
      await this.updateExecution({ current_phase: 'syncing_clients' });
      await this.syncClients();

      // 4. Recarregar lookup (agora com clientes novos)
      await this.loadClientLookup();

      // 5. Loop principal de paginação de pedidos
      await this.updateExecution({ current_phase: 'syncing_orders' });
      await this.syncOrdersLoop({
        startDate: effectiveStartDate,
        endDate,
        pageSize,
        maxPages,
        checkpointInterval,
        forceReimport,
      });

      // 6. Atualizar stats dos clientes
      await this.updateExecution({ current_phase: 'updating_client_stats' });
      await updateClientStats(this.supabase, this.tenantId);

      // 7. Verificação de integridade
      let integrityCheck: IntegrityCheck | null = null;
      if (!skipIntegrityCheck) {
        await this.updateExecution({ current_phase: 'integrity_check' });
        integrityCheck = await this.performIntegrityCheck();
      }

      // 8. Finalizar
      const duration = Date.now() - startTime;
      const status = this.stats.totalRecordsFailed > 0 && this.stats.totalRecordsInserted > 0
        ? 'partial' as const
        : this.stats.totalRecordsFailed > 0
          ? 'failed' as const
          : 'completed' as const;

      await this.finalizeExecution(status, integrityCheck);
      await this.logger.finish(status === 'completed' ? 'success' : status === 'partial' ? 'partial' : 'error');

      console.log(`\n🎉 [ResilientSync] Finalizado em ${(duration / 1000).toFixed(1)}s`);
      console.log(`📊 Páginas: ${this.stats.totalPages} | Buscados: ${this.stats.totalRecordsFetched}`);
      console.log(`✅ Inseridos: ${this.stats.totalRecordsInserted} | 🔄 Atualizados: ${this.stats.totalRecordsUpdated}`);
      console.log(`⏭️ Ignorados: ${this.stats.totalRecordsSkipped} | ❌ Falhas: ${this.stats.totalRecordsFailed}`);
      console.log(`👤 Clientes criados: ${this.stats.totalClientsCreated} | Matched: ${this.stats.totalClientsMatched}`);

      return {
        execution_id: this.executionId!,
        status,
        stats: this.stats,
        integrityCheck,
        duration_ms: duration,
      };

    } catch (error: unknown) {
      const msg = (error as Error).message;
      console.error(`💥 [ResilientSync] Erro fatal: ${msg}`);

      this.stats.errors.push({ phase: 'execution', error: msg, timestamp: new Date().toISOString() });

      if (this.executionId) {
        await this.finalizeExecution('failed', null);
      }
      await this.logger.finish('error');

      throw error;
    }
  }

  /* ─── Sync: Clientes ─── */

  private async syncClients(): Promise<void> {
    console.log('👥 [ResilientSync] Sincronizando clientes...');
    try {
      const apiClients = await fetchAllClients(this.facilzapConfig, 100, 200);
      console.log(`👥 [ResilientSync] ${apiClients.length} clientes da API`);

      if (apiClients.length === 0) return;

      const { valid, rejected } = mapClients(apiClients as unknown[], this.tenantId, 'facilzap');
      console.log(`👥 [ResilientSync] Mapeados: ${valid.length} válidos, ${rejected.length} rejeitados`);

      if (rejected.length > 0) {
        for (const r of rejected.slice(0, 5)) {
          this.logger.addWarning(`Cliente rejeitado: ${r.reason}`);
        }
      }

      if (valid.length > 0) {
        const result = await upsertClients(this.supabase, valid);
        this.stats.totalClientsCreated += result.created;
        this.stats.totalClientsUpdated += result.updated;
        console.log(`👥 [ResilientSync] Upsert: ${result.created} criados/atualizados, ${result.failed} falhas`);
      }
    } catch (error: unknown) {
      const msg = (error as Error).message;
      console.error(`❌ [ResilientSync] Erro ao sync clientes: ${msg}`);
      this.stats.errors.push({ phase: 'sync_clients', error: msg, timestamp: new Date().toISOString() });
      this.logger.addError(`Sync clientes: ${msg}`);
    }
  }

  /* ─── Sync: Loop de paginação de pedidos ─── */

  private async syncOrdersLoop(opts: {
    startDate: string;
    endDate: string;
    pageSize: number;
    maxPages: number | null;
    checkpointInterval: number;
    forceReimport: boolean;
  }): Promise<void> {
    const { startDate, endDate, pageSize, maxPages, checkpointInterval, forceReimport } = opts;

    let currentPage = 1;
    let consecutiveEmptyPages = 0;
    const MAX_EMPTY_PAGES = 3;

    console.log(`📋 [ResilientSync] Iniciando loop de pedidos...`);

    while (true) {
      // Safety check
      if (maxPages && currentPage > maxPages) {
        console.log(`⚠️ [ResilientSync] Limite de segurança atingido (${maxPages} páginas)`);
        break;
      }

      try {
        // Buscar página com retry
        const pageOrders = await this.fetchPageWithRetry(currentPage, pageSize, startDate, endDate);

        if (!pageOrders || pageOrders.length === 0) {
          consecutiveEmptyPages++;
          console.log(`⚠️ [ResilientSync] Página ${currentPage} vazia (${consecutiveEmptyPages}/${MAX_EMPTY_PAGES})`);

          if (consecutiveEmptyPages >= MAX_EMPTY_PAGES) {
            console.log('✅ [ResilientSync] Fim da paginação (3 páginas vazias consecutivas)');
            break;
          }

          currentPage++;
          await this.sleep(300);
          continue;
        }

        consecutiveEmptyPages = 0;

        // Mapear e processar pedidos
        const { valid: mappedOrders, rejected } = mapOrders(
          pageOrders as unknown[],
          this.tenantId,
          this.clientLookup!,
          'facilzap'
        );

        this.stats.totalRecordsFetched += pageOrders.length;

        if (rejected.length > 0) {
          this.stats.totalRecordsFailed += rejected.length;
          for (const r of rejected.slice(0, 3)) {
            this.logger.addWarning(`Pedido rejeitado: ${r.reason}`);
          }
        }

        // Separar novos vs existentes se não forceReimport
        let ordersToUpsert = mappedOrders;
        if (!forceReimport) {
          const externalIds = mappedOrders.map(o => o.external_id);
          const { data: existing } = await this.supabase
            .from('orders')
            .select('external_id')
            .eq('tenant_id', this.tenantId)
            .in('external_id', externalIds);

          const existingSet = new Set((existing || []).map(e => e.external_id));
          const newOrders = mappedOrders.filter(o => !existingSet.has(o.external_id));
          const updateOrders = mappedOrders.filter(o => existingSet.has(o.external_id));

          this.stats.totalRecordsSkipped += updateOrders.length;
          ordersToUpsert = newOrders;

          // Se quiser atualizar existentes também (upsert completo)
          if (updateOrders.length > 0) {
            const updateResult = await upsertOrders(this.supabase, updateOrders);
            this.stats.totalRecordsUpdated += updateResult.created;
          }
        }

        // Upsert novos
        if (ordersToUpsert.length > 0) {
          const result = await upsertOrders(this.supabase, ordersToUpsert);
          this.stats.totalRecordsInserted += result.created;
          this.stats.totalRecordsFailed += result.failed;

          // Contar clientes matched vs orphaned
          const withClient = ordersToUpsert.filter(o => o.client_id !== null).length;
          const withoutClient = ordersToUpsert.filter(o => o.client_id === null).length;
          this.stats.totalClientsMatched += withClient;

          if (withoutClient > 0) {
            this.logger.addWarning(`${withoutClient} pedidos órfãos na página ${currentPage}`);
          }
        }

        this.stats.totalPages++;
        this.logger.addPage();
        this.logger.addRecords(pageOrders.length, 0, ordersToUpsert.length);

        console.log(
          `✅ [ResilientSync] Página ${currentPage}: ${pageOrders.length} buscados | ` +
          `+${ordersToUpsert.length} novos | ${rejected.length} rejeitados`
        );

        // Checkpoint periódico
        if (currentPage % checkpointInterval === 0) {
          await this.saveCheckpoint(currentPage);
          await this.updateExecutionProgress();
          console.log(`💾 [ResilientSync] Checkpoint salvo (página ${currentPage})`);
        }

        // Rate limiting
        await this.sleep(300);
        currentPage++;

      } catch (error: unknown) {
        const msg = (error as Error).message;
        console.error(`❌ [ResilientSync] Erro na página ${currentPage}: ${msg}`);

        this.stats.errors.push({
          phase: 'process_page',
          page: currentPage,
          error: msg,
          timestamp: new Date().toISOString(),
        });
        this.logger.addError(`Página ${currentPage}: ${msg}`);

        // Para erros de rede/timeout, tentar próxima página
        if (msg.includes('timeout') || msg.includes('Timeout') || msg.includes('network') || msg.includes('fetch')) {
          console.log('🔄 [ResilientSync] Erro de rede, tentando próxima página...');
          currentPage++;
          await this.sleep(2000);
        } else {
          // Erro crítico — salvar checkpoint e parar
          await this.saveCheckpoint(currentPage);
          throw error;
        }
      }
    }
  }

  /* ─── Fetch com retry exponencial ─── */

  private async fetchPageWithRetry(
    page: number,
    pageSize: number,
    startDate: string,
    endDate: string,
    maxRetries = 3
  ): Promise<unknown[]> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await fetchOrders(this.facilzapConfig, page, pageSize, {
          data_inicial: startDate,
          data_final: endDate,
        });

        return result.orders as unknown[];

      } catch (error: unknown) {
        lastError = error as Error;
        console.warn(`⚠️ [ResilientSync] Tentativa ${attempt}/${maxRetries} falhou: ${lastError.message}`);

        if (attempt < maxRetries) {
          const delay = 2000 * Math.pow(2, attempt - 1); // 2s, 4s, 8s
          console.log(`⏳ [ResilientSync] Retry em ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`Falha após ${maxRetries} tentativas na página ${page}: ${lastError?.message}`);
  }

  /* ─── Client lookup ─── */

  private async loadClientLookup(): Promise<void> {
    const { data: dbClients } = await this.supabase
      .from('clients')
      .select('id, phone, phone_normalized, name, email, custom_fields')
      .eq('tenant_id', this.tenantId);

    this.clientLookup = buildClientLookup(dbClients || []);
  }

  /* ─── Integrity check ─── */

  private async performIntegrityCheck(): Promise<IntegrityCheck> {
    console.log('🔍 [ResilientSync] Verificando integridade...');

    const { count: totalOrders } = await this.supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', this.tenantId);

    const { count: orphanedCount } = await this.supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', this.tenantId)
      .is('client_id', null);

    const total = totalOrders || 0;
    const orphaned = orphanedCount || 0;
    const orphanPercent = total > 0 ? (orphaned / total) * 100 : 0;

    // Tentar religar órfãos
    let relinked = 0;
    if (orphaned > 0 && this.clientLookup) {
      console.log(`🔗 [ResilientSync] Tentando religar ${orphaned} órfãos...`);
      relinked = await relinkOrphans(this.supabase, this.tenantId, this.clientLookup, 1000);
      console.log(`🔗 [ResilientSync] ${relinked} pedidos religados`);
    }

    const finalOrphaned = orphaned - relinked;
    const finalOrphanPercent = total > 0 ? (finalOrphaned / total) * 100 : 0;
    const qualityScore = Math.max(0, Math.min(100, 100 - finalOrphanPercent * 2));

    console.log(`📊 [ResilientSync] Total: ${total} | Órfãos: ${finalOrphaned} (${finalOrphanPercent.toFixed(1)}%) | Score: ${qualityScore.toFixed(1)}`);

    return {
      supabase_total: total,
      orphaned_records: finalOrphaned,
      orphan_percent: Math.round(finalOrphanPercent * 100) / 100,
      relinked_count: relinked,
      data_quality_score: Math.round(qualityScore * 100) / 100,
    };
  }

  /* ─── Execution management ─── */

  private async createExecution(config: Record<string, unknown>): Promise<string> {
    const { data, error } = await this.supabase
      .from('sync_executions')
      .insert({
        tenant_id: this.tenantId,
        sync_type: 'full',
        trigger_source: config.trigger_source || 'manual',
        config,
        status: 'pending',
      })
      .select('execution_id')
      .single();

    if (error) {
      console.error('[ResilientSync] Erro ao criar execução:', error.message);
      // Não é fatal — continuar sem tracking
      return `local-${Date.now()}`;
    }

    return data.execution_id;
  }

  private async updateExecution(updates: Record<string, unknown>): Promise<void> {
    if (!this.executionId || this.executionId.startsWith('local-')) return;

    await this.supabase
      .from('sync_executions')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('execution_id', this.executionId);
  }

  private async updateExecutionProgress(): Promise<void> {
    await this.updateExecution({
      total_pages_processed: this.stats.totalPages,
      total_records_fetched: this.stats.totalRecordsFetched,
      total_records_inserted: this.stats.totalRecordsInserted,
      total_records_updated: this.stats.totalRecordsUpdated,
      total_records_skipped: this.stats.totalRecordsSkipped,
      total_records_failed: this.stats.totalRecordsFailed,
      total_clients_created: this.stats.totalClientsCreated,
      total_clients_matched: this.stats.totalClientsMatched,
      total_clients_updated: this.stats.totalClientsUpdated,
      errors: this.stats.errors,
    });
  }

  private async saveCheckpoint(page: number): Promise<void> {
    if (!this.executionId || this.executionId.startsWith('local-')) return;

    await this.supabase
      .from('sync_checkpoints')
      .insert({
        execution_id: this.executionId,
        checkpoint_type: 'page_completed',
        last_successful_page: page,
        resume_state: { next_page: page + 1, stats: this.stats },
        records_processed_so_far: this.stats.totalRecordsFetched,
        errors_count_so_far: this.stats.totalRecordsFailed,
      });
  }

  private async finalizeExecution(
    status: 'completed' | 'failed' | 'partial',
    integrityCheck: IntegrityCheck | null,
  ): Promise<void> {
    const recommendations: string[] = [];

    if (integrityCheck) {
      if (integrityCheck.orphaned_records > 0) {
        recommendations.push(
          `⚠️ ${integrityCheck.orphaned_records} pedidos órfãos sem cliente vinculado. Execute reparo de órfãos.`
        );
      }
      if (integrityCheck.data_quality_score < 95) {
        recommendations.push(
          `🔴 Score de qualidade ${integrityCheck.data_quality_score}%. Revisar resolução de identidade.`
        );
      }
      if (integrityCheck.relinked_count > 0) {
        recommendations.push(
          `✅ ${integrityCheck.relinked_count} pedidos re-vinculados automaticamente.`
        );
      }
    }

    if (this.stats.totalRecordsFailed > 0) {
      recommendations.push(
        `❌ ${this.stats.totalRecordsFailed} registros falharam. Verificar erros no log.`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ Sincronização 100% íntegra. Nenhuma ação necessária.');
    }

    await this.updateExecution({
      status,
      completed_at: new Date().toISOString(),
      current_phase: status === 'completed' ? 'completed' : 'finished_with_issues',
      progress_percent: status === 'completed' ? 100 : 99,
      integrity_check: integrityCheck,
      recommended_actions: recommendations,
      total_pages_processed: this.stats.totalPages,
      total_records_fetched: this.stats.totalRecordsFetched,
      total_records_inserted: this.stats.totalRecordsInserted,
      total_records_updated: this.stats.totalRecordsUpdated,
      total_records_skipped: this.stats.totalRecordsSkipped,
      total_records_failed: this.stats.totalRecordsFailed,
      total_clients_created: this.stats.totalClientsCreated,
      total_clients_matched: this.stats.totalClientsMatched,
      total_clients_updated: this.stats.totalClientsUpdated,
      errors: this.stats.errors,
    });
  }

  /* ─── Helpers ─── */

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
