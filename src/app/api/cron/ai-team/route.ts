/**
 * GET  /api/cron/ai-team  — Scheduled Function (Netlify: todo dia às 08:00)
 * POST /api/cron/ai-team  — Disparo manual via dashboard (sem autenticação de cron)
 *
 * Roda a análise completa do Time de IAs para todos os tenants com Meta configurado.
 * Cada agente falha de forma independente — um erro não para os outros.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { runFullAnalysis } from '@/lib/services/ai-team-orchestrator.service';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/* ─── Scheduled Function (chamado pelo Netlify) ─────────────────────────────── */

export async function GET(req: NextRequest) {
  // Autenticar via CRON_SECRET
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  return runForAllTenants();
}

/* ─── Manual trigger (chamado pelo dashboard) ───────────────────────────────── */

export async function POST(req: NextRequest) {
  // Disparo manual: autenticar como usuário normal
  try {
    const { profile } = await getTenantFromRequest(req);
    const result = await runFullAnalysis(profile.tenant_id);

    return NextResponse.json({
      ok: true,
      runId: result.runId,
      actionsCreated: result.actionsCreated,
      copiesCreated: result.copiesCreated,
      errors: result.errors,
      durationMs: result.durationMs,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/* ─── Helper: rodar para todos os tenants ───────────────────────────────────── */

async function runForAllTenants(): Promise<NextResponse> {
  const t0 = Date.now();

  const supabase = createServerSupabaseClient();

  // Buscar tenants com análise habilitada e Meta configurado
  const { data: tenants, error } = await supabase
    .from('ai_provider_config')
    .select('tenant_id')
    .eq('analysis_enabled', true)
    .not('meta_ad_account_id', 'is', null)
    .not('meta_access_token', 'is', null);

  if (error) {
    console.error('[ai-team cron] Erro ao buscar tenants:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const results: Array<{
    tenantId: string;
    ok: boolean;
    actionsCreated: number;
    copiesCreated: number;
    errors: string[];
  }> = [];

  for (const { tenant_id } of tenants ?? []) {
    try {
      const result = await runFullAnalysis(tenant_id);
      results.push({
        tenantId: tenant_id,
        ok: result.errors.length === 0,
        actionsCreated: result.actionsCreated,
        copiesCreated: result.copiesCreated,
        errors: result.errors,
      });
    } catch (err) {
      console.error(`[ai-team cron] Erro no tenant ${tenant_id}:`, err);
      results.push({
        tenantId: tenant_id,
        ok: false,
        actionsCreated: 0,
        copiesCreated: 0,
        errors: [String(err)],
      });
    }
  }

  const totalActions = results.reduce((s, r) => s + r.actionsCreated, 0);
  const totalCopies = results.reduce((s, r) => s + r.copiesCreated, 0);
  const failed = results.filter(r => !r.ok).length;

  console.log(`[ai-team cron] Concluído: ${results.length} tenants, ${totalActions} ações, ${totalCopies} copies, ${failed} erros. ${Date.now() - t0}ms`);

  return NextResponse.json({
    ok: true,
    tenants_processed: results.length,
    total_actions_created: totalActions,
    total_copies_created: totalCopies,
    failed_tenants: failed,
    duration_ms: Date.now() - t0,
    results,
  });
}
