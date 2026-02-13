/**
 * API Intelligence — RFM Calculation & Query
 *
 * POST /api/intelligence/rfm — Calcular/recalcular RFM para todo o tenant
 * GET  /api/intelligence/rfm — Consultar distribuição e dados RFM
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { RFMEngine } from '@/lib/services/rfm-engine';
import { createLearningLogger } from '@/lib/services/learning-logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   POST — Calcular RFM
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export async function POST(request: NextRequest) {
  try {
    // Auth via header ou cookie
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validar usuário
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    // Buscar tenant
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 });
    }

    // Executar RFM Engine
    const engine = new RFMEngine(supabase, tenant.id);
    const report = await engine.calculateAll();

    // Logar sync
    const logger = createLearningLogger(supabase, tenant.id);
    await logger.logSync({
      sync_type: 'rfm_calculation',
      source: 'rfm_engine',
      records_fetched: report.stats.total_processed,
      records_created: 0,
      records_updated: report.stats.total_updated,
      records_failed: report.stats.total_errors,
      duration_ms: report.execution.duration_secs * 1000,
      status: report.stats.total_errors === 0 ? 'success' : 'partial',
      metadata: {
        algorithm_version: report.execution.algorithm_version,
        distribution: report.distribution,
        segment_changes: report.stats.segment_changes,
      },
    });

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error) {
    console.error('Erro no cálculo RFM:', error);
    return NextResponse.json(
      { error: 'Erro interno ao calcular RFM', details: String(error) },
      { status: 500 }
    );
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   GET — Consultar distribuição RFM
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const segment = searchParams.get('segment');
    const clientId = searchParams.get('client_id');

    // Consulta por cliente específico
    if (clientId) {
      const { data } = await supabase
        .from('clients')
        .select('id, name, phone, rfm_recency, rfm_frequency, rfm_monetary, rfm_score, rfm_segment, rfm_calculated_at, churn_probability, purchase_prob_30d, ltv_projected_12m, ltv_projected_life, flag_auto_vip, flag_churn_risk, flag_needs_attention, flag_upsell_ready, sentiment_score, sentiment_label')
        .eq('id', clientId)
        .eq('tenant_id', tenant.id)
        .single();

      return NextResponse.json({ success: true, client: data });
    }

    // Distribuição geral
    let query = supabase
      .from('clients')
      .select('rfm_segment, rfm_recency, rfm_frequency, rfm_monetary, churn_probability, flag_auto_vip, flag_churn_risk')
      .eq('tenant_id', tenant.id)
      .not('rfm_segment', 'is', null);

    if (segment) {
      query = query.eq('rfm_segment', segment);
    }

    const { data: clients } = await query;

    if (!clients || clients.length === 0) {
      return NextResponse.json({
        success: true,
        distribution: {},
        summary: { total: 0, calculated: false },
      });
    }

    // Montar distribuição
    const distribution: Record<string, { count: number; avg_churn: number; vip_count: number; risk_count: number }> = {};
    for (const c of clients) {
      const seg = c.rfm_segment || 'Unknown';
      if (!distribution[seg]) {
        distribution[seg] = { count: 0, avg_churn: 0, vip_count: 0, risk_count: 0 };
      }
      distribution[seg].count++;
      distribution[seg].avg_churn += c.churn_probability || 0;
      if (c.flag_auto_vip) distribution[seg].vip_count++;
      if (c.flag_churn_risk) distribution[seg].risk_count++;
    }

    // Calcular médias
    for (const key of Object.keys(distribution)) {
      distribution[key].avg_churn = parseFloat((distribution[key].avg_churn / distribution[key].count).toFixed(1));
    }

    return NextResponse.json({
      success: true,
      distribution,
      summary: {
        total: clients.length,
        calculated: true,
        vip_total: clients.filter(c => c.flag_auto_vip).length,
        risk_total: clients.filter(c => c.flag_churn_risk).length,
        avg_recency: parseFloat((clients.reduce((s, c) => s + (c.rfm_recency || 0), 0) / clients.length).toFixed(1)),
        avg_frequency: parseFloat((clients.reduce((s, c) => s + (c.rfm_frequency || 0), 0) / clients.length).toFixed(1)),
        avg_monetary: parseFloat((clients.reduce((s, c) => s + (c.rfm_monetary || 0), 0) / clients.length).toFixed(1)),
      },
    });
  } catch (error) {
    console.error('Erro na consulta RFM:', error);
    return NextResponse.json(
      { error: 'Erro interno', details: String(error) },
      { status: 500 }
    );
  }
}
