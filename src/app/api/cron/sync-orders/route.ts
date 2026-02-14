/**
 * POST /api/cron/sync-orders
 *
 * Cron Job: Sync incremental de pedidos a cada 1 hora.
 * - Busca pedidos dos últimos 7 dias (cobrir atualizações)
 * - Usa mapper.ts para normalização rigorosa
 * - Registra no sync_audit_log
 * - 3x retry em caso de falha 500/timeout
 *
 * Configurar no Netlify/Vercel:
 * - Schedule: "0 * * * *" (a cada hora)
 * - Header: Authorization: Bearer CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { fetchOrders, type FacilZapConfig } from '@/lib/services/facilzap.service';
import {
  mapClients,
  mapOrders,
  buildClientLookup,
  upsertClients,
  upsertOrders,
  updateClientStats,
  relinkOrphans,
} from '@/lib/facilzap/mapper';
import { SyncLogger, isSyncRunning } from '@/lib/facilzap/sync-logger';
import { PhoneNormalizer } from '@/lib/phone-normalizer';

const CRON_SECRET = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_KEY || '';
const MAX_PAGES = 10; // Máximo de páginas por execução
const DAYS_BACK = 7;  // Buscar pedidos dos últimos 7 dias

/**
 * POST handler — chamado pelo cron scheduler.
 * Aceita também GET para compatibilidade com Netlify Scheduled Functions.
 */
export async function POST(request: NextRequest) {
  return handleSync(request);
}

export async function GET(request: NextRequest) {
  return handleSync(request);
}

async function handleSync(request: NextRequest) {
  const startTime = Date.now();

  // ─── Autenticação: CRON_SECRET ou Supabase Service Key ───
  const authHeader = request.headers.get('authorization')?.replace('Bearer ', '') || '';
  const cronKey = request.headers.get('x-cron-secret') || '';

  if (CRON_SECRET && authHeader !== CRON_SECRET && cronKey !== CRON_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  try {
    // ─── Buscar TODOS os tenants com FacilZap configurado ───
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

      // Verificar se já tem sync rodando
      const running = await isSyncRunning(supabase, tenant.id, 'incremental');
      if (running) {
        results.push({ tenant_id: tenant.id, skipped: true, reason: 'sync já em execução' });
        continue;
      }

      const logger = new SyncLogger(supabase, tenant.id, 'incremental', 'cron');
      await logger.start({ days_back: DAYS_BACK, max_pages: MAX_PAGES });

      try {
        const config: FacilZapConfig = { token: tenant.facilzap_token };
        const tenantId = tenant.id;

        // ─── Calcular período ───
        const dataFinal = new Date().toISOString().split('T')[0];
        const dataInicial = new Date();
        dataInicial.setDate(dataInicial.getDate() - DAYS_BACK);
        const dataInicialStr = dataInicial.toISOString().split('T')[0];

        // ─── Buscar pedidos (paginado) ───
        const allOrders: unknown[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= MAX_PAGES) {
          const result = await fetchOrders(config, page, 100, {
            data_inicial: dataInicialStr,
            data_final: dataFinal,
          });

          if (result.orders.length > 0) {
            allOrders.push(...result.orders);
            logger.addPage();
            page++;
          } else {
            hasMore = false;
          }
        }

        if (allOrders.length === 0) {
          logger.addRecords(0);
          await logger.finish('success', {
            date_from: dataInicialStr,
            date_to: dataFinal,
          });
          results.push({ tenant_id: tenantId, orders: 0, message: 'Sem pedidos novos' });
          continue;
        }

        // ─── Auto-criar clientes dos pedidos ───
        const clientesFromOrders: unknown[] = [];
        for (const rawOrder of allOrders) {
          const o = rawOrder as Record<string, unknown>;
          const cliente = o.cliente as Record<string, unknown> | null;
          if (cliente && (cliente.whatsapp || cliente.whatsapp_e164 || cliente.telefone)) {
            clientesFromOrders.push(cliente);
          }
        }

        if (clientesFromOrders.length > 0) {
          const { valid: mappedClients, rejected: rejClients } = mapClients(
            clientesFromOrders, tenantId, 'cron'
          );
          if (mappedClients.length > 0) {
            await upsertClients(supabase, mappedClients);
          }
          if (rejClients.length > 0) {
            logger.addDuplicated(rejClients.length);
          }
        }

        // ─── Construir lookup de clientes ───
        const { data: dbClients } = await supabase
          .from('clients')
          .select('id, phone, phone_normalized, name, email, custom_fields')
          .eq('tenant_id', tenantId);

        const lookup = buildClientLookup(dbClients || []);

        // ─── Mapear pedidos ───
        const { valid: mappedOrders, rejected: rejOrders } = mapOrders(
          allOrders, tenantId, lookup, 'cron'
        );

        // ─── Upsert pedidos ───
        const orderResult = await upsertOrders(supabase, mappedOrders);

        logger.addRecords(orderResult.created, orderResult.updated);
        if (orderResult.failed > 0) {
          for (const err of orderResult.errors) {
            logger.addError(err);
          }
        }
        if (rejOrders.length > 0) {
          logger.addDuplicated(rejOrders.length);
          for (const rej of rejOrders.slice(0, 5)) {
            logger.addWarning(`Pedido rejeitado: ${rej.reason}`);
          }
        }

        // ─── Re-vincular órfãos ───
        const relinked = await relinkOrphans(supabase, tenantId, lookup, 200);

        // ─── Atualizar stats dos clientes ───
        const affectedClientIds = mappedOrders
          .filter((o) => o.client_id)
          .map((o) => o.client_id!);
        if (affectedClientIds.length > 0) {
          await updateClientStats(supabase, tenantId, [...new Set(affectedClientIds)]);
        }

        await logger.finish('success', {
          date_from: dataInicialStr,
          date_to: dataFinal,
          page_from: 1,
          page_to: page - 1,
        });

        results.push({
          tenant_id: tenantId,
          orders: orderResult.created,
          rejected: rejOrders.length,
          relinked,
          errors: orderResult.errors.length,
          pages: page - 1,
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
      type: 'sync-orders',
      schedule: 'every 1 hour',
      tenants_processed: results.length,
      results,
      duration_ms: duration,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Erro no cron sync-orders', details: (error as Error).message },
      { status: 500 }
    );
  }
}
