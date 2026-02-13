/**
 * API Intelligence — Overview Dashboard
 *
 * GET /api/intelligence/overview — Dashboard completo de inteligência AI
 * Consolida: distribuição RFM, alertas, métricas de modelo, tendências
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

    // Buscar métricas em paralelo
    const [
      clientsResult,
      eventsResult,
      predictionsResult,
      syncResult,
    ] = await Promise.all([
      // Clientes com RFM calculado
      supabase
        .from('clients')
        .select('rfm_segment, churn_probability, purchase_prob_30d, ltv_projected_12m, flag_auto_vip, flag_churn_risk, flag_needs_attention, flag_upsell_ready, nps_estimated, rfm_calculated_at')
        .eq('tenant_id', tenant.id)
        .not('rfm_segment', 'is', null),

      // Eventos dos últimos 7 dias
      supabase
        .from('behavioral_events')
        .select('category, event_type, sentiment_score, occurred_at')
        .eq('tenant_id', tenant.id)
        .gte('occurred_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),

      // Predições validadas
      supabase
        .from('predictions_log')
        .select('prediction_correct, confidence, prediction_type')
        .eq('tenant_id', tenant.id)
        .not('prediction_correct', 'is', null),

      // Último sync
      supabase
        .from('sync_audit_log')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('started_at', { ascending: false })
        .limit(5),
    ]);

    const clients = clientsResult.data || [];
    const events = eventsResult.data || [];
    const predictions = predictionsResult.data || [];
    const syncs = syncResult.data || [];

    // Distribuição RFM
    const rfmDistribution: Record<string, number> = {};
    for (const c of clients) {
      rfmDistribution[c.rfm_segment] = (rfmDistribution[c.rfm_segment] || 0) + 1;
    }

    // KPIs
    const totalClients = clients.length;
    const vipCount = clients.filter(c => c.flag_auto_vip).length;
    const riskCount = clients.filter(c => c.flag_churn_risk).length;
    const attentionCount = clients.filter(c => c.flag_needs_attention).length;
    const upsellCount = clients.filter(c => c.flag_upsell_ready).length;
    const avgChurn = totalClients > 0
      ? parseFloat((clients.reduce((s, c) => s + (c.churn_probability || 0), 0) / totalClients).toFixed(1))
      : 0;
    const avgProb30d = totalClients > 0
      ? parseFloat((clients.reduce((s, c) => s + (c.purchase_prob_30d || 0), 0) / totalClients).toFixed(1))
      : 0;
    const totalLTV12m = clients.reduce((s, c) => s + (c.ltv_projected_12m || 0), 0);

    // Sentimento médio
    const sentimentClients = clients.filter(c => c.nps_estimated != null);
    const avgSentiment = sentimentClients.length > 0
      ? parseFloat((sentimentClients.reduce((s, c) => s + c.nps_estimated, 0) / sentimentClients.length).toFixed(1))
      : 0;

    // Eventos por categoria
    const eventsByCategory: Record<string, number> = {};
    for (const e of events) {
      const cat = e.category || 'unknown';
      eventsByCategory[cat] = (eventsByCategory[cat] || 0) + 1;
    }

    // Precisão do modelo
    const correctPredictions = predictions.filter(p => p.prediction_correct).length;
    const modelAccuracy = predictions.length > 0
      ? parseFloat(((correctPredictions / predictions.length) * 100).toFixed(1))
      : null;

    // Último cálculo RFM
    const lastCalculated = clients.reduce((latest, c) => {
      if (c.rfm_calculated_at && (!latest || c.rfm_calculated_at > latest)) {
        return c.rfm_calculated_at;
      }
      return latest;
    }, null as string | null);

    return NextResponse.json({
      success: true,
      overview: {
        rfm: {
          total_calculated: totalClients,
          distribution: rfmDistribution,
          last_calculated_at: lastCalculated,
        },
        kpis: {
          vip_count: vipCount,
          risk_count: riskCount,
          attention_count: attentionCount,
          upsell_count: upsellCount,
          avg_churn_probability: avgChurn,
          avg_purchase_prob_30d: avgProb30d,
          total_ltv_projected_12m: parseFloat(totalLTV12m.toFixed(2)),
          avg_sentiment: avgSentiment,
        },
        events: {
          total_7d: events.length,
          by_category: eventsByCategory,
        },
        model: {
          total_predictions: predictions.length,
          accuracy: modelAccuracy,
          correct: correctPredictions,
        },
        sync: {
          recent: syncs,
        },
      },
    });
  } catch (error) {
    console.error('Erro no overview de inteligência:', error);
    return NextResponse.json(
      { error: 'Erro interno', details: String(error) },
      { status: 500 }
    );
  }
}
