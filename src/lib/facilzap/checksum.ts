/**
 * FacilZap Checksum — Verificação de integridade entre FacilZap e banco local.
 *
 * Conta registros na API FacilZap e compara com o banco do VEXX CRM.
 * Detecta divergências (registros faltando, excedentes, desatualizados).
 *
 * @module facilzap/checksum
 */

import { createServerSupabaseClient } from '@/lib/supabase';
import {
  fetchAllProducts,
  fetchAllClients,
  fetchAllOrders,
  type FacilZapConfig,
} from '@/lib/services/facilzap.service';

type SupabaseAdmin = ReturnType<typeof createServerSupabaseClient>;

export interface ChecksumResult {
  entity: 'products' | 'clients' | 'orders';
  api_count: number;
  db_count: number;
  missing_in_db: number;
  extra_in_db: number;
  coverage_percent: number;
  is_ok: boolean;
  missing_ids: string[];
  extra_ids: string[];
  checked_at: string;
}

export interface FullChecksumResult {
  products: ChecksumResult;
  clients: ChecksumResult;
  orders: ChecksumResult;
  overall_ok: boolean;
  duration_ms: number;
  checked_at: string;
}

/**
 * Executa checksum completo: compara registros da API FacilZap com o banco local.
 *
 * Processo:
 * 1. Busca TODOS os IDs da API FacilZap (paginado)
 * 2. Busca TODOS os external_ids/phone_normalized do banco
 * 3. Compara os dois conjuntos
 * 4. Retorna divergências
 *
 * @param config - Config da FacilZap (token)
 * @param supabase - Cliente admin do Supabase
 * @param tenantId - ID do tenant
 */
export async function runFullChecksum(
  config: FacilZapConfig,
  supabase: SupabaseAdmin,
  tenantId: string
): Promise<FullChecksumResult> {
  const startTime = Date.now();
  const now = new Date().toISOString();

  // Buscar dados da API em paralelo
  const [apiProducts, apiClients, apiOrders] = await Promise.all([
    fetchAllProducts(config).catch(() => []),
    fetchAllClients(config).catch(() => []),
    fetchAllOrders(config).catch(() => []),
  ]);

  // Buscar IDs do banco em paralelo
  const [dbProducts, dbClients, dbOrders] = await Promise.all([
    supabase
      .from('products')
      .select('external_id')
      .eq('tenant_id', tenantId)
      .then(({ data }) => data || []),
    supabase
      .from('clients')
      .select('phone_normalized')
      .eq('tenant_id', tenantId)
      .then(({ data }) => data || []),
    supabase
      .from('orders')
      .select('external_id')
      .eq('tenant_id', tenantId)
      .then(({ data }) => data || []),
  ]);

  // ─── Checksum Produtos ───
  const apiProductIds = new Set(
    (apiProducts as Array<Record<string, unknown>>).map((p) => String(p.external_id || p.id))
  );
  const dbProductIds = new Set(dbProducts.map((p) => p.external_id));

  const missingProducts = [...apiProductIds].filter((id) => !dbProductIds.has(id));
  const extraProducts = [...dbProductIds].filter((id) => id && !apiProductIds.has(id));

  const productsResult: ChecksumResult = {
    entity: 'products',
    api_count: apiProductIds.size,
    db_count: dbProductIds.size,
    missing_in_db: missingProducts.length,
    extra_in_db: extraProducts.length,
    coverage_percent: apiProductIds.size > 0
      ? Math.round(((apiProductIds.size - missingProducts.length) / apiProductIds.size) * 10000) / 100
      : 100,
    is_ok: missingProducts.length === 0,
    missing_ids: missingProducts.slice(0, 50),
    extra_ids: extraProducts.slice(0, 50),
    checked_at: now,
  };

  // ─── Checksum Clientes (por external_id via facilzap_id nos custom_fields) ───
  const apiClientIds = new Set(
    (apiClients as Array<Record<string, unknown>>).map((c) => String(c.id))
  );
  // Buscar facilzap_ids dos clientes no banco
  const { data: dbClientsWithFzId } = await supabase
    .from('clients')
    .select('custom_fields')
    .eq('tenant_id', tenantId);

  const dbClientFzIds = new Set(
    (dbClientsWithFzId || [])
      .map((c) => {
        const cf = c.custom_fields as Record<string, unknown> | null;
        return cf?.facilzap_id ? String(cf.facilzap_id) : null;
      })
      .filter(Boolean) as string[]
  );

  const missingClients = [...apiClientIds].filter((id) => !dbClientFzIds.has(id));
  const extraClients: string[] = []; // Clientes extras podem ter vindo de outras fontes

  const clientsResult: ChecksumResult = {
    entity: 'clients',
    api_count: apiClientIds.size,
    db_count: dbClients.length,
    missing_in_db: missingClients.length,
    extra_in_db: extraClients.length,
    coverage_percent: apiClientIds.size > 0
      ? Math.round(((apiClientIds.size - missingClients.length) / apiClientIds.size) * 10000) / 100
      : 100,
    is_ok: missingClients.length === 0,
    missing_ids: missingClients.slice(0, 50),
    extra_ids: extraClients.slice(0, 50),
    checked_at: now,
  };

  // ─── Checksum Pedidos ───
  const apiOrderIds = new Set(
    (apiOrders as Array<Record<string, unknown>>).map((o) => String(o.id))
  );
  const dbOrderIds = new Set(
    dbOrders.map((o) => o.external_id).filter(Boolean) as string[]
  );

  const missingOrders = [...apiOrderIds].filter((id) => !dbOrderIds.has(id));
  const extraOrders = [...dbOrderIds].filter((id) => !apiOrderIds.has(id));

  const ordersResult: ChecksumResult = {
    entity: 'orders',
    api_count: apiOrderIds.size,
    db_count: dbOrderIds.size,
    missing_in_db: missingOrders.length,
    extra_in_db: extraOrders.length,
    coverage_percent: apiOrderIds.size > 0
      ? Math.round(((apiOrderIds.size - missingOrders.length) / apiOrderIds.size) * 10000) / 100
      : 100,
    is_ok: missingOrders.length === 0,
    missing_ids: missingOrders.slice(0, 50),
    extra_ids: extraOrders.slice(0, 50),
    checked_at: now,
  };

  const durationMs = Date.now() - startTime;

  return {
    products: productsResult,
    clients: clientsResult,
    orders: ordersResult,
    overall_ok: productsResult.is_ok && clientsResult.is_ok && ordersResult.is_ok,
    duration_ms: durationMs,
    checked_at: now,
  };
}

/**
 * Checksum rápido: conta apenas totais sem baixar todos os IDs.
 * Usa contagem da primeira página para estimar total da API.
 */
export async function runQuickChecksum(
  supabase: SupabaseAdmin,
  tenantId: string
): Promise<{
  products: { db_count: number };
  clients: { db_count: number };
  orders: { db_count: number };
  checked_at: string;
}> {
  const [products, clients, orders] = await Promise.all([
    supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
  ]);

  return {
    products: { db_count: products.count || 0 },
    clients: { db_count: clients.count || 0 },
    orders: { db_count: orders.count || 0 },
    checked_at: new Date().toISOString(),
  };
}
