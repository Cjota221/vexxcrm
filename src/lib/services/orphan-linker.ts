/**
 * Orphan Linker Service — Re-vinculação avançada de pedidos órfãos.
 *
 * Estratégia multi-camada:
 * 1. Usar relinkOrphans do mapper (phone → facilzap_id → email → nome)
 * 2. Auto-criar clientes quando dados suficientes (nome + telefone)
 * 3. Registrar falhas na tabela orphaned_orders para retry posterior
 *
 * @module services/orphan-linker
 */

import { createServerSupabaseClient } from '@/lib/supabase';
import {
  buildClientLookup,
  relinkOrphans,
  mapClients,
  upsertClients,
} from '@/lib/facilzap/mapper';
import { PhoneNormalizer } from '@/lib/phone-normalizer';

type SupabaseAdmin = ReturnType<typeof createServerSupabaseClient>;

export interface OrphanRepairResult {
  total_orphans: number;
  relinked_by_lookup: number;
  clients_auto_created: number;
  relinked_after_creation: number;
  still_orphaned: number;
  failed: number;
  errors: Array<{ order_id: string; error: string }>;
  duration_ms: number;
}

export class OrphanLinkerService {
  private supabase: SupabaseAdmin;
  private tenantId: string;

  constructor(supabase: SupabaseAdmin, tenantId: string) {
    this.supabase = supabase;
    this.tenantId = tenantId;
  }

  /**
   * Repara todos os pedidos órfãos em múltiplas passadas.
   */
  async repairAll(options: { createMissingClients?: boolean; batchSize?: number } = {}): Promise<OrphanRepairResult> {
    const { createMissingClients = true, batchSize = 500 } = options;
    const startTime = Date.now();

    const result: OrphanRepairResult = {
      total_orphans: 0,
      relinked_by_lookup: 0,
      clients_auto_created: 0,
      relinked_after_creation: 0,
      still_orphaned: 0,
      failed: 0,
      errors: [],
      duration_ms: 0,
    };

    try {
      // Contar órfãos atuais
      const { count: orphanCount } = await this.supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', this.tenantId)
        .is('client_id', null);

      result.total_orphans = orphanCount || 0;
      console.log(`🔧 [OrphanLinker] ${result.total_orphans} pedidos órfãos encontrados`);

      if (result.total_orphans === 0) {
        console.log('✅ [OrphanLinker] Nenhum órfão para reparar!');
        result.duration_ms = Date.now() - startTime;
        return result;
      }

      // PASSADA 1: Religar com lookup existente
      console.log('🔗 [OrphanLinker] Passada 1: Religar via lookup...');
      const { data: dbClients } = await this.supabase
        .from('clients')
        .select('id, phone, phone_normalized, name, email, custom_fields')
        .eq('tenant_id', this.tenantId);

      const lookup = buildClientLookup(dbClients || []);
      const relinked1 = await relinkOrphans(this.supabase, this.tenantId, lookup, batchSize);
      result.relinked_by_lookup = relinked1;
      console.log(`🔗 [OrphanLinker] Passada 1: ${relinked1} religados`);

      // PASSADA 2: Auto-criar clientes e religar
      if (createMissingClients) {
        console.log('👤 [OrphanLinker] Passada 2: Auto-criação de clientes...');

        const { data: remainingOrphans } = await this.supabase
          .from('orders')
          .select('id, external_id, metadata')
          .eq('tenant_id', this.tenantId)
          .is('client_id', null)
          .order('created_at', { ascending: false })
          .limit(batchSize);

        if (remainingOrphans && remainingOrphans.length > 0) {
          const autoResult = await this.autoCreateAndLink(remainingOrphans);
          result.clients_auto_created = autoResult.created;
          result.relinked_after_creation = autoResult.linked;
          result.failed = autoResult.failed;
          result.errors = autoResult.errors;
        }
      }

      // PASSADA 3: Religar novamente com lookup atualizado (pega clientes recém criados)
      if (result.clients_auto_created > 0) {
        console.log('🔗 [OrphanLinker] Passada 3: Religar com novos clientes...');
        const { data: updatedClients } = await this.supabase
          .from('clients')
          .select('id, phone, phone_normalized, name, email, custom_fields')
          .eq('tenant_id', this.tenantId);

        const updatedLookup = buildClientLookup(updatedClients || []);
        const relinked3 = await relinkOrphans(this.supabase, this.tenantId, updatedLookup, batchSize);
        result.relinked_after_creation += relinked3;
        console.log(`🔗 [OrphanLinker] Passada 3: ${relinked3} religados adicionais`);
      }

      // Contar órfãos restantes
      const { count: stillOrphaned } = await this.supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', this.tenantId)
        .is('client_id', null);

      result.still_orphaned = stillOrphaned || 0;

      // Registrar órfãos restantes na tabela de tracking
      if (result.still_orphaned > 0) {
        await this.registerRemainingOrphans();
      }

      result.duration_ms = Date.now() - startTime;

      console.log(`\n✅ [OrphanLinker] Reparo concluído em ${(result.duration_ms / 1000).toFixed(1)}s`);
      console.log(`📊 Total: ${result.total_orphans} | Religados: ${result.relinked_by_lookup + result.relinked_after_creation}`);
      console.log(`👤 Clientes criados: ${result.clients_auto_created} | Restantes: ${result.still_orphaned}`);

      return result;

    } catch (error: unknown) {
      result.duration_ms = Date.now() - startTime;
      console.error(`💥 [OrphanLinker] Erro:`, (error as Error).message);
      throw error;
    }
  }

  /**
   * Auto-criar clientes a partir de metadata dos pedidos e vincular.
   */
  private async autoCreateAndLink(
    orphans: Array<{ id: string; external_id: string | null; metadata: unknown }>
  ): Promise<{ created: number; linked: number; failed: number; errors: Array<{ order_id: string; error: string }> }> {
    const result = { created: 0, linked: 0, failed: 0, errors: [] as Array<{ order_id: string; error: string }> };

    // Agrupar por telefone normalizado para evitar duplicatas
    const byPhone = new Map<string, { orderId: string; meta: Record<string, unknown> }>();

    for (const orphan of orphans) {
      const meta = orphan.metadata as Record<string, unknown> | null;
      if (!meta) continue;

      const rawPhone = String(
        meta.cliente_whatsapp_e164 || meta.cliente_whatsapp || meta.cliente_telefone || ''
      ).replace(/\D/g, '');

      if (!rawPhone || rawPhone.length < 8) continue;

      const canonical = PhoneNormalizer.canonical(rawPhone);
      if (!canonical) continue;

      // Só registrar o primeiro pedido de cada telefone
      if (!byPhone.has(canonical)) {
        byPhone.set(canonical, { orderId: orphan.id, meta });
      }
    }

    console.log(`👤 [OrphanLinker] ${byPhone.size} telefones únicos para auto-criar`);

    // Verificar quais já existem no banco
    const { data: existingClients } = await this.supabase
      .from('clients')
      .select('phone_normalized')
      .eq('tenant_id', this.tenantId);

    const existingPhones = new Set(
      (existingClients || []).map(c => c.phone_normalized)
    );

    // Filtrar apenas telefones que NÃO existem
    const toCreate: Array<Record<string, unknown>> = [];
    for (const [phone, { meta }] of byPhone) {
      if (existingPhones.has(phone)) continue;

      toCreate.push({
        whatsapp: meta.cliente_whatsapp || meta.cliente_telefone || '',
        telefone: meta.cliente_telefone || '',
        nome: meta.cliente_nome || 'Cliente',
        email: meta.cliente_email || '',
        cpf_cnpj: meta.cliente_cpf_cnpj || '',
        id: meta.cliente_id_facilzap || null,
      });
    }

    console.log(`👤 [OrphanLinker] ${toCreate.length} clientes novos a criar`);

    if (toCreate.length > 0) {
      const { valid } = mapClients(toCreate, this.tenantId, 'auto_orphan_repair');

      if (valid.length > 0) {
        const upsertResult = await upsertClients(this.supabase, valid);
        result.created = upsertResult.created;
        result.failed = upsertResult.failed;

        for (const err of upsertResult.errors) {
          result.errors.push({ order_id: '', error: err });
        }
      }
    }

    return result;
  }

  /**
   * Registrar pedidos órfãos restantes na tabela de tracking.
   */
  private async registerRemainingOrphans(): Promise<void> {
    try {
      await this.supabase.rpc('detect_orphaned_orders', { p_tenant_id: this.tenantId });
    } catch (error: unknown) {
      console.error('[OrphanLinker] Erro ao registrar órfãos:', (error as Error).message);
    }
  }
}
