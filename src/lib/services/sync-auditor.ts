/**
 * Sync Auditor Service — Auditoria forense de integridade.
 *
 * Combina checksum (cobertura) + detecção de divergências + auto-reparo.
 * Registra divergências na tabela sync_divergences para rastreabilidade.
 *
 * @module services/sync-auditor
 */

import { createServerSupabaseClient } from '@/lib/supabase';
import {
  runFullChecksum,
  runQuickChecksum,
  type FullChecksumResult,
  type ChecksumResult,
} from '@/lib/facilzap/checksum';
import type { FacilZapConfig } from '@/lib/services/facilzap.service';

type SupabaseAdmin = ReturnType<typeof createServerSupabaseClient>;

export interface AuditResult {
  checksum: FullChecksumResult;
  divergences_registered: number;
  orphan_count: number;
  data_quality_score: number;
  recommendations: string[];
  duration_ms: number;
}

export class SyncAuditorService {
  private supabase: SupabaseAdmin;
  private tenantId: string;
  private facilzapConfig: FacilZapConfig;

  constructor(supabase: SupabaseAdmin, tenantId: string, facilzapConfig: FacilZapConfig) {
    this.supabase = supabase;
    this.tenantId = tenantId;
    this.facilzapConfig = facilzapConfig;
  }

  /**
   * Executa auditoria forense completa.
   */
  async runFullAudit(): Promise<AuditResult> {
    const startTime = Date.now();
    const recommendations: string[] = [];

    console.log('🔍 [Auditor] Iniciando auditoria forense completa...');

    // 1. Checksum completo
    const checksum = await runFullChecksum(this.facilzapConfig, this.supabase, this.tenantId);

    // 2. Registrar divergências
    let divergencesRegistered = 0;

    for (const entity of ['products', 'clients', 'orders'] as const) {
      const result = checksum[entity];
      if (!result.is_ok) {
        divergencesRegistered += await this.registerDivergences(result);
      }
    }

    // 3. Contar órfãos
    const { count: orphanCount } = await this.supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', this.tenantId)
      .is('client_id', null);

    // 4. Calcular score de qualidade
    const totalOrders = checksum.orders.db_count || 1;
    const orphans = orphanCount || 0;
    const orphanRate = orphans / totalOrders;

    const coverageScore =
      (checksum.products.coverage_percent +
        checksum.clients.coverage_percent +
        checksum.orders.coverage_percent) / 3;

    const linkageScore = Math.max(0, 100 - (orphanRate * 100));

    const dataQualityScore = Math.round(
      (coverageScore * 0.6 + linkageScore * 0.4) * 100
    ) / 100;

    // 5. Recomendações
    if (checksum.orders.missing_in_db > 0) {
      recommendations.push(
        `🔄 Execute sync completo: ${checksum.orders.missing_in_db} pedidos faltando no banco`
      );
    }
    if (checksum.clients.missing_in_db > 0) {
      recommendations.push(
        `👤 Sincronize clientes: ${checksum.clients.missing_in_db} clientes faltando`
      );
    }
    if (checksum.products.missing_in_db > 0) {
      recommendations.push(
        `📦 Sincronize produtos: ${checksum.products.missing_in_db} produtos faltando`
      );
    }
    if (orphans > 0) {
      recommendations.push(
        `🔗 Execute reparo de órfãos: ${orphans} pedidos sem vínculo com cliente`
      );
    }
    if (dataQualityScore >= 95) {
      recommendations.push('✅ Qualidade de dados excelente!');
    } else if (dataQualityScore >= 80) {
      recommendations.push('⚠️ Qualidade de dados boa, mas pode melhorar');
    } else {
      recommendations.push('🚨 Qualidade de dados crítica — ações urgentes necessárias');
    }

    const durationMs = Date.now() - startTime;

    console.log(`✅ [Auditor] Auditoria concluída em ${(durationMs / 1000).toFixed(1)}s`);
    console.log(`📊 Score: ${dataQualityScore}% | Cobertura: ${coverageScore.toFixed(1)}% | Órfãos: ${orphans}`);

    return {
      checksum,
      divergences_registered: divergencesRegistered,
      orphan_count: orphans,
      data_quality_score: dataQualityScore,
      recommendations,
      duration_ms: durationMs,
    };
  }

  /**
   * Auditoria rápida — apenas contagens locais, sem chamar API FacilZap.
   */
  async runQuickAudit(): Promise<{
    counts: Awaited<ReturnType<typeof runQuickChecksum>>;
    orphan_count: number;
    data_quality_score: number;
  }> {
    const counts = await runQuickChecksum(this.supabase, this.tenantId);

    const { count: orphanCount } = await this.supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', this.tenantId)
      .is('client_id', null);

    const totalOrders = counts.orders.db_count || 1;
    const orphans = orphanCount || 0;
    const linkageScore = Math.max(0, 100 - ((orphans / totalOrders) * 100));

    return {
      counts,
      orphan_count: orphans,
      data_quality_score: Math.round(linkageScore * 100) / 100,
    };
  }

  /**
   * Buscar histórico de execuções de sync.
   */
  async getExecutionHistory(limit = 20): Promise<unknown[]> {
    const { data } = await this.supabase
      .from('sync_executions')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .order('started_at', { ascending: false })
      .limit(limit);

    return data || [];
  }

  /**
   * Estatísticas gerais do tenant.
   */
  async getStats(): Promise<{
    total_clients: number;
    total_orders: number;
    total_products: number;
    orphan_orders: number;
    last_sync: string | null;
    data_quality_score: number;
  }> {
    const [clients, orders, products, orphans, lastSync] = await Promise.all([
      this.supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', this.tenantId),
      this.supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', this.tenantId),
      this.supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', this.tenantId),
      this.supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', this.tenantId)
        .is('client_id', null),
      this.supabase
        .from('sync_executions')
        .select('finished_at')
        .eq('tenant_id', this.tenantId)
        .eq('status', 'completed')
        .order('finished_at', { ascending: false })
        .limit(1),
    ]);

    const totalOrders = orders.count || 0;
    const orphanCount = orphans.count || 0;
    const linkageScore = totalOrders > 0
      ? Math.round(Math.max(0, 100 - ((orphanCount / totalOrders) * 100)) * 100) / 100
      : 100;

    return {
      total_clients: clients.count || 0,
      total_orders: totalOrders,
      total_products: products.count || 0,
      orphan_orders: orphanCount,
      last_sync: lastSync.data?.[0]?.finished_at || null,
      data_quality_score: linkageScore,
    };
  }

  /**
   * Registrar divergências no banco.
   */
  private async registerDivergences(result: ChecksumResult): Promise<number> {
    const divergences: Array<{
      tenant_id: string;
      entity_type: string;
      external_id: string;
      divergence_type: string;
      details: Record<string, unknown>;
      status: string;
      detected_at: string;
    }> = [];

    const now = new Date().toISOString();

    for (const id of result.missing_ids) {
      divergences.push({
        tenant_id: this.tenantId,
        entity_type: result.entity,
        external_id: id,
        divergence_type: 'missing_in_db',
        details: { api_count: result.api_count, db_count: result.db_count },
        status: 'pending',
        detected_at: now,
      });
    }

    for (const id of result.extra_ids) {
      divergences.push({
        tenant_id: this.tenantId,
        entity_type: result.entity,
        external_id: id,
        divergence_type: 'extra_in_db',
        details: { api_count: result.api_count, db_count: result.db_count },
        status: 'pending',
        detected_at: now,
      });
    }

    if (divergences.length === 0) return 0;

    // Upsert para evitar duplicatas (ON CONFLICT não existe em divergences, usar insert)
    const { error } = await this.supabase
      .from('sync_divergences')
      .insert(divergences);

    if (error) {
      console.error('[Auditor] Erro ao registrar divergências:', error.message);
      return 0;
    }

    return divergences.length;
  }
}
