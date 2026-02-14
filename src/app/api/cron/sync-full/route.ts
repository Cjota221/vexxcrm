/**
 * POST /api/cron/sync-full
 *
 * Cron Job: Sync COMPLETO a cada 24 horas.
 * - Busca TODOS os produtos, clientes e pedidos da FacilZap
 * - Executa checksum (contagem FacilZap vs banco)
 * - Usa mapper.ts para normalização rigorosa
 * - Registra no sync_audit_log
 * - 3x retry em caso de falha 500/timeout (já embutido no facilzap.service)
 *
 * Configurar no Netlify/Vercel:
 * - Schedule: "0 3 * * *" (todo dia às 3h)
 * - Header: Authorization: Bearer CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import {
  fetchAllProducts,
  fetchAllClients,
  fetchAllOrders,
  type FacilZapConfig,
} from '@/lib/services/facilzap.service';
import {
  mapClients,
  mapProducts,
  mapOrders,
  buildClientLookup,
  upsertClients,
  upsertProducts,
  upsertOrders,
  updateClientStats,
  relinkOrphans,
} from '@/lib/facilzap/mapper';
import { SyncLogger, isSyncRunning } from '@/lib/facilzap/sync-logger';
import { runQuickChecksum } from '@/lib/facilzap/checksum';

const CRON_SECRET = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_KEY || '';

export async function POST(request: NextRequest) {
  return handleFullSync(request);
}

export async function GET(request: NextRequest) {
  return handleFullSync(request);
}

async function handleFullSync(request: NextRequest) {
  const startTime = Date.now();

  // ─── Autenticação ───
  const authHeader = request.headers.get('authorization')?.replace('Bearer ', '') || '';
  const cronKey = request.headers.get('x-cron-secret') || '';

  if (CRON_SECRET && authHeader !== CRON_SECRET && cronKey !== CRON_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  try {
    // ─── Buscar TODOS os tenants com FacilZap ───
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, facilzap_token')
      .not('facilzap_token', 'is', null);

    if (!tenants || tenants.length === 0) {
      return NextResponse.json({ message: 'Nenhum tenant com FacilZap configurado' });
    }

    const results: Record<string, unknown>[] = [];

    for (const tenant of tenants) {
      if (!tenant.facilzap_token) continue;

      // Verificar se já tem sync full rodando
      const running = await isSyncRunning(supabase, tenant.id, 'full');
      if (running) {
        results.push({ tenant_id: tenant.id, skipped: true, reason: 'sync full já em execução' });
        continue;
      }

      const logger = new SyncLogger(supabase, tenant.id, 'full', 'cron');
      await logger.start({ type: 'full_sync_24h' });

      try {
        const config: FacilZapConfig = { token: tenant.facilzap_token };
        const tenantId = tenant.id;

        // ─── Checksum PRÉ-SYNC (contagem local antes do sync) ───
        const preChecksum = await runQuickChecksum(supabase, tenantId);

        // ─── FASE 1: Buscar TUDO da API (em paralelo) ───
        console.log(`[Cron Full] Tenant ${tenantId}: Iniciando busca completa...`);

        const [apiProducts, apiClients, apiOrders] = await Promise.all([
          fetchAllProducts(config).catch((e) => {
            logger.addError(`Produtos: ${e.message}`);
            return [];
          }),
          fetchAllClients(config).catch((e) => {
            logger.addError(`Clientes: ${e.message}`);
            return [];
          }),
          fetchAllOrders(config).catch((e) => {
            logger.addError(`Pedidos: ${e.message}`);
            return [];
          }),
        ]);

        const apiTotal = apiProducts.length + apiClients.length + apiOrders.length;
        logger.setApiTotal(apiTotal);

        console.log(
          `[Cron Full] Tenant ${tenantId}: API retornou ${apiProducts.length}P, ${apiClients.length}C, ${apiOrders.length}O`
        );

        // ─── FASE 2: Mapear com mapper.ts ───

        // 2a. Produtos
        const { valid: mappedProducts, rejected: rejProducts } = mapProducts(
          apiProducts, tenantId, 'cron'
        );
        if (rejProducts.length > 0) {
          logger.addDuplicated(rejProducts.length);
          logger.addWarning(`${rejProducts.length} produtos rejeitados`);
        }

        // 2b. Clientes
        const { valid: mappedClients, rejected: rejClients } = mapClients(
          apiClients, tenantId, 'cron'
        );
        if (rejClients.length > 0) {
          logger.addDuplicated(rejClients.length);
          logger.addWarning(`${rejClients.length} clientes rejeitados`);
        }

        // ─── FASE 3: Upsert (ordem: Produtos → Clientes → Pedidos) ───

        // 3a. Produtos
        const productResult = await upsertProducts(supabase, mappedProducts);
        logger.addRecords(productResult.created);
        if (productResult.failed > 0) {
          for (const err of productResult.errors) logger.addError(err);
        }

        // 3b. Clientes
        const clientResult = await upsertClients(supabase, mappedClients);
        logger.addRecords(clientResult.created);
        if (clientResult.failed > 0) {
          for (const err of clientResult.errors) logger.addError(err);
        }

        // 3c. Construir lookup ATUALIZADO
        const { data: dbClients } = await supabase
          .from('clients')
          .select('id, phone, phone_normalized, name, email, custom_fields')
          .eq('tenant_id', tenantId);
        const lookup = buildClientLookup(dbClients || []);

        // 3d. Pedidos
        const { valid: mappedOrders, rejected: rejOrders } = mapOrders(
          apiOrders, tenantId, lookup, 'cron'
        );
        if (rejOrders.length > 0) {
          logger.addDuplicated(rejOrders.length);
          logger.addWarning(`${rejOrders.length} pedidos rejeitados`);
        }

        const orderResult = await upsertOrders(supabase, mappedOrders);
        logger.addRecords(orderResult.created);
        if (orderResult.failed > 0) {
          for (const err of orderResult.errors) logger.addError(err);
        }

        // ─── FASE 4: Re-vincular órfãos + Stats ───
        const relinked = await relinkOrphans(supabase, tenantId, lookup, 1000);
        await updateClientStats(supabase, tenantId);

        // ─── FASE 5: Checksum PÓS-SYNC ───
        const postChecksum = await runQuickChecksum(supabase, tenantId);

        // Calcular coverage
        const totalApiRecords = apiProducts.length + apiClients.length + apiOrders.length;
        const totalDbRecords =
          postChecksum.products.db_count +
          postChecksum.clients.db_count +
          postChecksum.orders.db_count;
        const coveragePercent = totalApiRecords > 0
          ? Math.round((Math.min(totalDbRecords, totalApiRecords) / totalApiRecords) * 10000) / 100
          : 100;

        await logger.finish('success', {
          integrity_ok: coveragePercent >= 95,
          divergence_found: coveragePercent < 100,
          coverage_percent: coveragePercent,
        });

        results.push({
          tenant_id: tenantId,
          products: { fetched: apiProducts.length, saved: productResult.created, rejected: rejProducts.length },
          clients: { fetched: apiClients.length, saved: clientResult.created, rejected: rejClients.length },
          orders: { fetched: apiOrders.length, saved: orderResult.created, rejected: rejOrders.length },
          relinked,
          coverage_percent: coveragePercent,
          checksum: {
            pre: preChecksum,
            post: postChecksum,
          },
        });
      } catch (err: unknown) {
        logger.addError((err as Error).message);
        await logger.finish('error');
        results.push({
          tenant_id: tenant.id,
          error: (err as Error).message,
        });
      }
    }

    const duration = Date.now() - startTime;
    return NextResponse.json({
      success: true,
      type: 'sync-full',
      schedule: 'every 24 hours',
      tenants_processed: results.length,
      results,
      duration_ms: duration,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Erro no cron sync-full', details: (error as Error).message },
      { status: 500 }
    );
  }
}
