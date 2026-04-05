import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { META_BASE } from '@/lib/meta-config';

/**
 * Regras automáticas de gestão de campanhas.
 *
 * GET  /api/trafego/rules        — lista regras do tenant
 * POST /api/trafego/rules        — cria nova regra
 * DELETE /api/trafego/rules?id=X — remove regra
 * POST /api/trafego/rules/evaluate — avalia e executa regras (chamado pelo cron)
 */

export interface AutomationRule {
  id: string;
  tenant_id: string;
  nome: string;
  ativa: boolean;
  condicao: {
    metrica: 'cpl' | 'roas' | 'ctr' | 'cpm' | 'frequencia' | 'gasto';
    operador: 'maior_que' | 'menor_que';
    valor: number;
    janela_dias: number;  // quantos dias consecutivos a condição precisa ser verdadeira
  };
  acao: {
    tipo: 'pausar_campanha' | 'pausar_adset' | 'notificar' | 'escalar_orcamento';
    incremento_pct?: number;  // para escalar_orcamento (ex: 0.20 = +20%)
  };
  ultima_execucao?: string;
  vezes_executada: number;
  created_at: string;
}

function n(v: string | undefined | null): number {
  return parseFloat(v || '0') || 0;
}

export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from('meta_automation_rules')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false });

    if (error) {
      // Tabela pode não existir ainda — retornar vazio sem quebrar
      if (error.code === '42P01') return NextResponse.json({ rules: [] });
      throw error;
    }

    return NextResponse.json({ rules: data || [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const url = req.nextUrl.pathname;

    // Roteamento: /api/trafego/rules/evaluate é chamado pelo cron
    if (url.endsWith('/evaluate')) {
      return avaliarRegras(profile.tenant_id);
    }

    const body = await req.json() as Omit<AutomationRule, 'id' | 'tenant_id' | 'ultima_execucao' | 'vezes_executada' | 'created_at'>;

    if (!body.nome || !body.condicao || !body.acao) {
      return NextResponse.json({ error: 'nome, condicao e acao são obrigatórios' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('meta_automation_rules')
      .insert({
        tenant_id:       profile.tenant_id,
        nome:            body.nome,
        ativa:           body.ativa ?? true,
        condicao:        body.condicao,
        acao:            body.acao,
        vezes_executada: 0,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, rule: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

    const supabase = createServerSupabaseClient();
    await supabase
      .from('meta_automation_rules')
      .delete()
      .eq('id', id)
      .eq('tenant_id', profile.tenant_id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as { id: string; ativa: boolean };
    if (!body.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

    const supabase = createServerSupabaseClient();
    await supabase
      .from('meta_automation_rules')
      .update({ ativa: body.ativa })
      .eq('id', body.id)
      .eq('tenant_id', profile.tenant_id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/* ─── Avaliação de regras ─────────────────────────────────────────────────── */

async function avaliarRegras(tenantId: string): Promise<NextResponse> {
  const supabase = createServerSupabaseClient();

  const { data: config } = await supabase
    .from('ai_provider_config')
    .select('meta_access_token, meta_ad_account_id')
    .eq('tenant_id', tenantId)
    .single();

  if (!config?.meta_access_token || !config?.meta_ad_account_id) {
    return NextResponse.json({ skipped: true, reason: 'Meta não configurado' });
  }

  const { data: rules } = await supabase
    .from('meta_automation_rules')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('ativa', true);

  if (!rules?.length) return NextResponse.json({ executadas: 0 });

  const token     = config.meta_access_token;
  const accountId = config.meta_ad_account_id;

  // Buscar métricas dos últimos 7 dias de todas as campanhas ativas
  const insightFields = 'spend,actions,action_values,ctr,cpm,frequency,reach';
  const res = await fetch(
    `${META_BASE}/${accountId}/campaigns` +
    `?fields=id,name,status,effective_status,insights.date_preset(last_7d){${insightFields},date_start,date_stop}` +
    `&effective_status=["ACTIVE"]&limit=50&access_token=${token}`
  );

  if (!res.ok) return NextResponse.json({ error: 'Meta API indisponível' }, { status: 502 });

  const data = await res.json() as {
    data: Array<{
      id: string; name: string; status: string;
      insights?: { data: Array<{
        spend: string; ctr: string; cpm: string; frequency: string; reach: string;
        actions?: Array<{ action_type: string; value: string }>;
        action_values?: Array<{ action_type: string; value: string }>;
      }> };
    }>;
  };

  let executadas = 0;
  const log: Array<{ regra: string; campanha: string; acao: string; resultado: string }> = [];

  for (const campaign of data.data || []) {
    const insight = campaign.insights?.data?.[0];
    if (!insight) continue;

    const spend    = n(insight.spend);
    const revenue  = n(insight.action_values?.find(a => a.action_type === 'purchase')?.value);
    const leads    = n(insight.actions?.find(a => a.action_type === 'lead')?.value);
    const roas     = spend > 0 ? revenue / spend : 0;
    const cpl      = leads > 0 ? spend / leads : 0;
    const ctr      = n(insight.ctr);
    const cpm      = n(insight.cpm);
    const freq     = n(insight.frequency);

    const metricas: Record<string, number> = { cpl, roas, ctr, cpm, frequencia: freq, gasto: spend };

    for (const rule of rules) {
      const cond = rule.condicao as AutomationRule['condicao'];
      const acao = rule.acao as AutomationRule['acao'];
      const valorAtual = metricas[cond.metrica] ?? 0;

      const condicaoVerdadeira =
        cond.operador === 'maior_que' ? valorAtual > cond.valor :
        cond.operador === 'menor_que' ? valorAtual < cond.valor :
        false;

      if (!condicaoVerdadeira) continue;

      // Executar ação
      let resultado = '';
      try {
        if (acao.tipo === 'pausar_campanha') {
          const pauseRes = await fetch(`${META_BASE}/${campaign.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ status: 'PAUSED', access_token: token }).toString(),
          });
          resultado = pauseRes.ok ? 'pausada' : 'erro ao pausar';
        } else if (acao.tipo === 'escalar_orcamento' && acao.incremento_pct) {
          // Buscar orçamento atual
          const budgetRes = await fetch(`${META_BASE}/${campaign.id}?fields=daily_budget&access_token=${token}`);
          if (budgetRes.ok) {
            const bd = await budgetRes.json() as { daily_budget?: string };
            const atual = n(bd.daily_budget);
            const novo  = Math.round(atual * (1 + acao.incremento_pct));
            await fetch(`${META_BASE}/${campaign.id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ daily_budget: String(novo), access_token: token }).toString(),
            });
            resultado = `orçamento escalado +${Math.round(acao.incremento_pct * 100)}%`;
          }
        } else if (acao.tipo === 'notificar') {
          // Salva notificação no Supabase para exibir no dashboard
          await supabase.from('ai_analysis_runs').insert({
            tenant_id: tenantId,
            status:    'completed',
            resultado: `[Regra: ${rule.nome}] Campanha "${campaign.name}": ${cond.metrica} = ${valorAtual.toFixed(2)} (${cond.operador.replace('_', ' ')} ${cond.valor})`,
          });
          resultado = 'notificação criada';
        }
      } catch { resultado = 'erro na execução'; }

      log.push({ regra: rule.nome, campanha: campaign.name, acao: acao.tipo, resultado });
      executadas++;

      // Atualizar contagem de execuções
      await supabase
        .from('meta_automation_rules')
        .update({ ultima_execucao: new Date().toISOString(), vezes_executada: (rule.vezes_executada || 0) + 1 })
        .eq('id', rule.id);
    }
  }

  return NextResponse.json({ executadas, log });
}
