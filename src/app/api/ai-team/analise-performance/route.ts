import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import {
  analisarPerformanceComJose,
  type CampanhaParaAnalise,
} from '@/lib/services/jose-performance-analyst.service';

import { META_BASE } from '@/lib/meta-config';

/**
 * GET /api/ai-team/analise-performance
 * Retorna a análise mais recente salva no banco.
 *
 * POST /api/ai-team/analise-performance
 * Dispara nova análise: José analisa campanhas → gera alertas → salva ações na fila.
 * Usado pelo botão "Analisar agora" e pelo cron diário das 8h.
 */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const supabase = createServerSupabaseClient();

    // Última análise concluída
    const { data: ultimaAnalise } = await supabase
      .from('ai_analysis_runs')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Ações pendentes de aprovação
    const { data: acoesPendentes } = await supabase
      .from('ai_action_queue')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false })
      .limit(20);

    // Alertas do sentinela não resolvidos
    const { data: alertas } = await supabase
      .from('sentinela_meta_alerts')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('resolvido', false)
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      ultima_analise: ultimaAnalise ?? null,
      acoes_pendentes: acoesPendentes ?? [],
      alertas_ativos: alertas ?? [],
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const inicio = Date.now();

  try {
    const { profile } = await getTenantFromRequest(req);
    const supabase = createServerSupabaseClient();

    // Buscar credenciais
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_ad_account_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token || !config?.meta_ad_account_id) {
      return NextResponse.json({ error: 'Meta Ads não configurado' }, { status: 400 });
    }

    const token     = config.meta_access_token;
    const accountId = config.meta_ad_account_id;

    // ── 1. Buscar campanhas com métricas (últimos 7 dias) ──────────────────
    const insightFields = 'spend,impressions,clicks,reach,cpc,cpm,ctr,frequency,actions,action_values';
    const campaignFields = [
      `insights.date_preset(last_7d){${insightFields}}`,
      'id', 'name', 'status', 'effective_status', 'daily_budget',
    ].join(',');

    const metaRes = await fetch(
      `${META_BASE}/${accountId}/campaigns` +
      `?fields=${encodeURIComponent(campaignFields)}` +
      `&effective_status=${encodeURIComponent(JSON.stringify(['ACTIVE', 'PAUSED']))}` +
      `&limit=50&access_token=${token}`
    );

    if (!metaRes.ok) {
      const err = await metaRes.json().catch(() => ({})) as { error?: { message?: string } };
      return NextResponse.json({ error: `Meta API: ${err.error?.message || metaRes.status}` }, { status: 502 });
    }

    const metaData = await metaRes.json() as {
      data: Array<{
        id: string; name: string; status: string; effective_status: string;
        daily_budget?: string;
        insights?: {
          data: Array<{
            spend: string; impressions: string; clicks: string; reach: string;
            cpc: string; cpm: string; ctr: string; frequency: string;
            actions?: Array<{ action_type: string; value: string }>;
            action_values?: Array<{ action_type: string; value: string }>;
          }>;
        };
      }>;
    };

    function n(v: string | undefined | null): number {
      return parseFloat(v || '0') || 0;
    }

    const campanhas: CampanhaParaAnalise[] = (metaData.data || []).map((c) => {
      const ins      = c.insights?.data?.[0];
      const spend    = n(ins?.spend);
      const revenue  = n(ins?.action_values?.find(a => a.action_type === 'purchase')?.value);
      const leads    = Math.round(n(ins?.actions?.find(a => a.action_type === 'lead')?.value));
      const clicks   = Math.round(n(ins?.clicks));
      const impressions = Math.round(n(ins?.impressions));
      const reach    = Math.round(n(ins?.reach));
      const roas     = spend > 0 ? revenue / spend : 0;
      const cpl      = leads > 0 ? spend / leads : 0;

      return {
        id: c.id, nome: c.name, status: c.status,
        spend, revenue, leads, clicks, impressions, reach,
        roas, cpl,
        cpc: n(ins?.cpc), cpm: n(ins?.cpm), ctr: n(ins?.ctr),
        frequency: n(ins?.frequency) || (reach > 0 ? impressions / reach : 0),
        orcamento_diario: c.daily_budget ? n(c.daily_budget) / 100 : null,
      };
    });

    // ── 2. José analisa (resumo via Jarvis/Claude Haiku) ──────────────────
    const analise = await analisarPerformanceComJose(campanhas, '');

    // ── 3. Salvar run no banco ─────────────────────────────────────────────
    const { data: run } = await supabase
      .from('ai_analysis_runs')
      .insert({
        tenant_id: profile.tenant_id,
        date_range: 'last_7d',
        metrics_snapshot: { campanhas },
        analyst_output: analise,
        actions_generated: analise.acoes_urgentes.length,
        status: 'completed',
        duration_ms: Date.now() - inicio,
      })
      .select('id')
      .single();

    const runId = run?.id;

    // ── 4. Criar ações na fila de aprovação ────────────────────────────────
    const filaRows = analise.acoes_urgentes.map((acao) => ({
      tenant_id: profile.tenant_id,
      agent: 'jose',
      action_type: 'analise_performance',
      alvo_id: acao.campanha_id || null,
      alvo_nome: acao.campanha_nome,
      parametros: {},
      motivo: `${acao.acao} — ${acao.motivo}`,
      impacto_esperado: 'Reduzir desperdício de verba e melhorar ROAS',
      urgencia: acao.urgencia === 'imediata' ? 'imediata' : 'proximas_24h',
      status: 'pending_approval',
      analysis_run_id: runId ?? null,
    }));

    if (filaRows.length > 0) {
      await supabase.from('ai_action_queue').insert(filaRows);
    }

    // ── 5. Salvar alertas no sentinela ─────────────────────────────────────
    const alertasRows = analise.alertas.map((a) => ({
      tenant_id: profile.tenant_id,
      tipo: a.tipo === 'danger' ? 'roas_baixo' : `${a.metrica.toLowerCase()}_alerta`,
      severidade: a.tipo === 'danger' ? 'alta' : 'media',
      descricao: a.mensagem,
      campaign_id: a.campanha_id,
      campaign_name: a.campanha_nome,
      dados: { metrica: a.metrica, valor_atual: a.valor_atual, valor_ideal: a.valor_ideal },
    }));

    if (alertasRows.length > 0) {
      // Marcar alertas antigos como resolvidos antes de inserir novos
      await supabase
        .from('sentinela_meta_alerts')
        .update({ resolvido: true, resolvido_at: new Date().toISOString() })
        .eq('tenant_id', profile.tenant_id)
        .eq('resolvido', false);

      await supabase.from('sentinela_meta_alerts').insert(alertasRows);
    }

    return NextResponse.json({
      ok: true,
      analise,
      acoes_criadas: filaRows.length,
      duracao_ms: Date.now() - inicio,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
