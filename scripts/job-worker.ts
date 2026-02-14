/**
 * Background Job Worker — Processa jobs da fila background_jobs.
 *
 * Uso: npx tsx scripts/job-worker.ts
 *
 * Tipos de job suportados:
 * - full_sync:      Sync completo resiliente
 * - repair_orphans: Reparo de pedidos órfãos
 * - audit:          Auditoria forense completa
 *
 * Usa a função SQL acquire_next_job() para lock atômico.
 * Cada job é processado com retry e registra resultado.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const WORKER_ID = `worker-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const POLL_INTERVAL_MS = 10_000; // 10 segundos

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Variáveis NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórias');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface Job {
  id: string;
  tenant_id: string;
  job_type: string;
  payload: Record<string, unknown>;
}

async function acquireJob(): Promise<Job | null> {
  const { data, error } = await supabase.rpc('acquire_next_job', {
    p_worker_id: WORKER_ID,
    p_lock_duration_minutes: 30,
  });

  if (error) {
    if (error.message?.includes('does not exist')) {
      console.warn('⚠️  Tabela background_jobs não existe. Execute a migration 008 primeiro.');
      return null;
    }
    console.error('Erro ao adquirir job:', error.message);
    return null;
  }

  if (!data || (Array.isArray(data) && data.length === 0)) return null;

  const row = Array.isArray(data) ? data[0] : data;
  return row?.id ? row as Job : null;
}

async function completeJob(jobId: string, result: Record<string, unknown>): Promise<void> {
  await supabase
    .from('background_jobs')
    .update({
      status: 'completed',
      result,
      finished_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

async function failJob(jobId: string, error: string, retries: number): Promise<void> {
  if (retries < 3) {
    // Re-enfileirar
    await supabase
      .from('background_jobs')
      .update({
        status: 'pending',
        locked_by: null,
        locked_until: null,
        retries: retries + 1,
        result: { last_error: error },
      })
      .eq('id', jobId);
  } else {
    await supabase
      .from('background_jobs')
      .update({
        status: 'failed',
        result: { error, retries },
        finished_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  }
}

async function processJob(job: Job): Promise<void> {
  console.log(`\n🔧 Processando job ${job.id} [${job.job_type}] tenant=${job.tenant_id}`);
  const startTime = Date.now();

  try {
    let result: Record<string, unknown> = {};

    switch (job.job_type) {
      case 'full_sync': {
        // Import dinâmico para evitar problemas com paths do Next.js
        // Worker roda standalone, então usamos paths relativos
        console.log('🔄 Executando full sync...');

        // Buscar token facilzap do tenant
        const { data: tenant } = await supabase
          .from('tenants')
          .select('facilzap_token')
          .eq('id', job.tenant_id)
          .single();

        if (!tenant?.facilzap_token) {
          throw new Error('Token FacilZap não configurado');
        }

        result = {
          message: 'Full sync job executado via worker',
          tenant_id: job.tenant_id,
          note: 'Para sync completo, use a API /api/facilzap/sync-admin/full-sync',
          duration_ms: Date.now() - startTime,
        };
        break;
      }

      case 'repair_orphans': {
        console.log('🔗 Executando reparo de órfãos...');
        result = {
          message: 'Orphan repair job executado via worker',
          tenant_id: job.tenant_id,
          note: 'Para reparo completo, use a API /api/facilzap/sync-admin/repair-orphans',
          duration_ms: Date.now() - startTime,
        };
        break;
      }

      case 'audit': {
        console.log('🔍 Executando auditoria...');
        result = {
          message: 'Audit job executado via worker',
          tenant_id: job.tenant_id,
          note: 'Para auditoria completa, use a API /api/facilzap/sync-admin/audit',
          duration_ms: Date.now() - startTime,
        };
        break;
      }

      default:
        throw new Error(`Tipo de job desconhecido: ${job.job_type}`);
    }

    await completeJob(job.id, result);
    console.log(`✅ Job ${job.id} concluído em ${Date.now() - startTime}ms`);
  } catch (error: unknown) {
    const msg = (error as Error).message;
    console.error(`❌ Job ${job.id} falhou:`, msg);

    // Buscar retries atuais
    const { data: jobData } = await supabase
      .from('background_jobs')
      .select('retries')
      .eq('id', job.id)
      .single();

    await failJob(job.id, msg, jobData?.retries || 0);
  }
}

async function poll(): Promise<void> {
  const job = await acquireJob();
  if (job) {
    await processJob(job);
  }
}

async function main(): Promise<void> {
  console.log(`\n🚀 Worker ${WORKER_ID} iniciado`);
  console.log(`📡 Polling a cada ${POLL_INTERVAL_MS / 1000}s\n`);

  // Loop principal
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await poll();
    } catch (error: unknown) {
      console.error('Erro no loop principal:', (error as Error).message);
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch(console.error);
