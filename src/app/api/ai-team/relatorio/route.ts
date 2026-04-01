import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

import { META_BASE } from '@/lib/meta-config';
const OPENAI_BASE = 'https://api.openai.com/v1';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function n(v: string | undefined | null): number {
  return parseFloat(v || '0') || 0;
}

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function roasEmoji(roas: number): string {
  if (roas >= 3) return '✅';
  if (roas >= 1.5) return '⚠️';
  return '🔴';
}

interface CampanhaRelatorio {
  nome: string;
  status: string;
  spend: number;
  leads: number;
  cpl: number;
  roas: number;
  health: 'great' | 'ok' | 'bad' | 'paused';
}

/**
 * GET /api/ai-team/relatorio?periodo=last_7d
 * Gera relatório de performance do período.
 * O Cláudio (Claude Haiku) escreve o texto do relatório em português.
 *
 * Parâmetros:
 *   periodo: 'last_7d' (padrão) | 'last_14d' | 'last_30d'
 *   formato: 'json' (padrão) | 'texto' (retorna string simples para WhatsApp)
 */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const periodo  = req.nextUrl.searchParams.get('periodo') || 'last_7d';
    const formato  = req.nextUrl.searchParams.get('formato') || 'json';

    const supabase = createServerSupabaseClient();

    // Buscar credenciais
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_ad_account_id, strategy_api_key, brand_produto, brand_publico')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token || !config?.meta_ad_account_id) {
      return NextResponse.json({ error: 'Meta Ads não configurado' }, { status: 400 });
    }

    const token       = config.meta_access_token;
    const accountId   = config.meta_ad_account_id;
    const claudeKey   = config.strategy_api_key || process.env.OPENAI_API_KEY || '';

    // ── 1. Buscar métricas de campanhas ────────────────────────────────────
    const insightFields = 'spend,impressions,clicks,reach,cpc,cpm,ctr,frequency,actions,action_values';
    const campaignFields = [
      `insights.date_preset(${periodo}){${insightFields}}`,
      'id', 'name', 'status', 'effective_status', 'daily_budget',
    ].join(',');

    const metaRes = await fetch(
      `${META_BASE}/${accountId}/campaigns` +
      `?fields=${encodeURIComponent(campaignFields)}` +
      `&effective_status=${encodeURIComponent(JSON.stringify(['ACTIVE', 'PAUSED', 'ARCHIVED']))}` +
      `&limit=50&access_token=${token}`
    );

    if (!metaRes.ok) {
      const err = await metaRes.json().catch(() => ({})) as { error?: { message?: string } };
      return NextResponse.json({ error: `Meta API: ${err.error?.message || metaRes.status}` }, { status: 502 });
    }

    const metaData = await metaRes.json() as {
      data: Array<{
        id: string; name: string; status: string; effective_status: string; daily_budget?: string;
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

    const campanhas: CampanhaRelatorio[] = (metaData.data || []).map((c) => {
      const ins   = c.insights?.data?.[0];
      const spend = n(ins?.spend);
      const leads = Math.round(n(ins?.actions?.find(a => a.action_type === 'lead')?.value));
      const rev   = n(ins?.action_values?.find(a => a.action_type === 'purchase')?.value);
      const roas  = spend > 0 ? rev / spend : 0;
      const cpl   = leads > 0 ? spend / leads : 0;

      let health: CampanhaRelatorio['health'] = 'paused';
      if (c.status === 'ACTIVE') {
        if (roas >= 3) health = 'great';
        else if (spend > 50 && roas < 1.5) health = 'bad';
        else health = 'ok';
      }

      return { nome: c.name, status: c.status, spend, leads, cpl, roas, health };
    });

    const gasto_total   = campanhas.reduce((s, c) => s + c.spend, 0);
    const retorno_total = campanhas.reduce((s, c) => s + c.spend * c.roas, 0);
    const leads_total   = campanhas.reduce((s, c) => s + c.leads, 0);
    const roas_medio    = gasto_total > 0 ? retorno_total / gasto_total : 0;
    const cpl_medio     = leads_total > 0 ? gasto_total / leads_total : 0;

    // ── 2. Buscar melhores públicos da análise mais recente ────────────────
    const { data: ultimaAnalise } = await supabase
      .from('ai_analysis_runs')
      .select('analyst_output, created_at')
      .eq('tenant_id', profile.tenant_id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // ── 3. Cláudio escreve o relatório ─────────────────────────────────────
    const campanhasTexto = campanhas
      .filter(c => c.spend > 0)
      .map(c => {
        const emoji = c.status === 'PAUSED' ? '⏸️' :
          c.health === 'great' ? '✅' : c.health === 'bad' ? '⚠️' : '🟡';
        return `${emoji} ${c.nome}: ${brl(c.spend)} → ${c.leads} leads (${brl(c.cpl)}/lead) ROAS ${c.roas.toFixed(1)}x`;
      })
      .join('\n');

    const periodoLabel =
      periodo === 'last_7d'  ? 'últimos 7 dias' :
      periodo === 'last_14d' ? 'últimas 2 semanas' :
      'últimos 30 dias';

    let textoRelatorio = '';

    if (claudeKey) {
      try {
        const claudeRes = await fetch(`${OPENAI_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${claudeKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            max_tokens: 1500,
            temperature: 0.7,
            messages: [
              {
                role: 'system',
                content: 'Você é Cláudio, estrategista de marketing. Escreva relatórios de performance em linguagem simples, sem termos técnicos. Use emojis para facilitar a leitura. Seja direto e objetivo.',
              },
              {
                role: 'user',
                content: `Escreva um relatório semanal de performance para a operadora entender o resultado do investimento.

PERÍODO: ${periodoLabel}
PRODUTO: ${config.brand_produto || 'Rasteirinhas femininas'}
PÚBLICO: ${config.brand_publico || 'Revendedoras e franqueadas'}

DADOS DAS CAMPANHAS:
${campanhasTexto || 'Nenhuma campanha com gasto no período.'}

TOTAIS:
- Investido: ${brl(gasto_total)}
- Retorno estimado: ${brl(retorno_total)}
- ROAS médio: ${roas_medio.toFixed(1)}x
- Total de leads: ${leads_total}
- CPL médio: ${brl(cpl_medio)}

Escreva o relatório no formato:
📊 Relatório Semanal — CJ Rasteirinhas
[data atual]

💰 RESUMO FINANCEIRO
[3 linhas com os números mais importantes]

📣 CAMPANHAS
[uma linha por campanha com emoji de status]

🎯 RECOMENDAÇÕES
[3 ações prioritárias numeradas]

Não inclua seção de "Melhores Públicos" nem "Pedro pesquisou" — apenas as 3 seções acima.`,
              },
            ],
          }),
        });

        if (claudeRes.ok) {
          const claudeData = await claudeRes.json() as {
            choices: Array<{ message: { content: string } }>;
          };
          textoRelatorio = claudeData.choices[0]?.message?.content || '';
        }
      } catch { /* fallback abaixo */ }
    }

    // Fallback: relatório gerado localmente
    if (!textoRelatorio) {
      const linhasCampanhas = campanhas
        .filter(c => c.spend > 0)
        .map(c => {
          const emoji = c.status === 'PAUSED' ? '⏸️' :
            c.health === 'great' ? '✅' : c.health === 'bad' ? '⚠️' : '🟡';
          const cplStr = c.leads > 0 ? ` (${brl(c.cpl)}/lead)` : ' (sem leads)';
          return `${emoji} ${c.nome}: ${brl(c.spend)} → ${c.leads} leads${cplStr}`;
        });

      const recomendacoes: string[] = [];
      const pausar = campanhas.filter(c => c.health === 'bad' && c.status === 'ACTIVE');
      if (pausar.length > 0) recomendacoes.push(`Pausar ${pausar.map(c => c.nome).join(', ')} (ROAS abaixo de 1.5x)`);
      const escalar = campanhas.filter(c => c.health === 'great');
      if (escalar.length > 0) recomendacoes.push(`Aumentar budget de ${escalar[0].nome} em 20% (ROAS ${escalar[0].roas.toFixed(1)}x)`);
      recomendacoes.push('Criar novo criativo para campanhas com CTR abaixo de 1.5%');

      textoRelatorio = [
        `📊 Relatório Semanal — CJ Rasteirinhas`,
        `Período: ${periodoLabel}`,
        ``,
        `💰 RESUMO FINANCEIRO`,
        `Investido: ${brl(gasto_total)}`,
        `Retorno estimado: ${brl(retorno_total)}`,
        `ROAS médio: ${roas_medio.toFixed(1)}x ${roasEmoji(roas_medio)} — cada R$1 gerou R$${roas_medio.toFixed(2)}`,
        ``,
        `📣 CAMPANHAS`,
        ...linhasCampanhas,
        ``,
        `🎯 RECOMENDAÇÕES`,
        ...recomendacoes.slice(0, 3).map((r, i) => `${i + 1}. ${r}`),
      ].join('\n');
    }

    // ── 4. Dados estruturados para exibição na UI ──────────────────────────
    const dadosEstruturados = {
      periodo: periodoLabel,
      gerado_em: new Date().toISOString(),
      resumo: {
        gasto_total,
        retorno_total,
        roas_medio: Number(roas_medio.toFixed(2)),
        leads_total,
        cpl_medio: Number(cpl_medio.toFixed(2)),
      },
      campanhas: campanhas.filter(c => c.spend > 0).map(c => ({
        nome: c.nome,
        status: c.status,
        health: c.health,
        spend: c.spend,
        leads: c.leads,
        cpl: Number(c.cpl.toFixed(2)),
        roas: Number(c.roas.toFixed(2)),
      })),
      texto_relatorio: textoRelatorio,
      ultima_analise_jose: ultimaAnalise?.created_at ?? null,
    };

    if (formato === 'texto') {
      return new NextResponse(textoRelatorio, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    return NextResponse.json({ ok: true, ...dadosEstruturados });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
