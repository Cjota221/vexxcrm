// ANTES: não existia integração com Meta Marketing API.
// DEPOIS: serviço completo para buscar métricas de campanhas, pausar anúncios
//         e atualizar orçamentos — sempre via fila de aprovação (nunca direto).

const META_BASE = 'https://graph.facebook.com/v23.0';

/* ─── Tipos ────────────────────────────────────────────────────────────────── */

export interface MetaCampaignMetrics {
  campaign_id: string;
  campaign_name: string;
  status: string;
  objective: string;
  spend: number;           // R$
  impressions: number;
  clicks: number;
  reach: number;
  cpc: number;             // custo por clique
  cpm: number;             // custo por mil impressões
  ctr: number;             // click-through rate %
  roas: number;            // return on ad spend
  conversions: number;
  revenue: number;         // receita gerada
  date_start: string;
  date_stop: string;
}

export interface MetaAdsConfig {
  accessToken: string;
  adAccountId: string;     // act_XXXXXXXXX
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function getConfig(): MetaAdsConfig {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId) {
    throw new Error('META_ACCESS_TOKEN e META_AD_ACCOUNT_ID são obrigatórias');
  }
  return { accessToken, adAccountId };
}

function toNumber(value: string | undefined | null): number {
  return parseFloat(value || '0') || 0;
}

/* ─── Buscar métricas de campanhas ─────────────────────────────────────────── */

/**
 * Busca métricas de todas as campanhas ativas/pausadas do período.
 * Chamado pelo José (GPT-4o-mini) para análise de performance.
 *
 * @param dateRange  - 'last_7d' | 'last_30d' | 'this_month'
 * @param cfg        - Credenciais Meta (opcional — usa env vars se não fornecido)
 */
export async function fetchCampaignMetrics(
  dateRange: 'last_7d' | 'last_30d' | 'this_month' = 'last_7d',
  cfg?: MetaAdsConfig,
): Promise<MetaCampaignMetrics[]> {
  const { accessToken, adAccountId } = cfg || getConfig();

  const insightFields = [
    'spend', 'impressions', 'clicks', 'reach', 'cpc', 'cpm', 'ctr',
    'actions', 'action_values',
  ].join(',');

  const campaignFields = [
    `insights.date_preset(${dateRange}){${insightFields},date_start,date_stop}`,
    'name', 'status', 'objective',
  ].join(',');

  const url = new URL(`${META_BASE}/${adAccountId}/campaigns`);
  url.searchParams.set('fields', campaignFields);
  url.searchParams.set('effective_status', JSON.stringify(['ACTIVE', 'PAUSED']));
  url.searchParams.set('limit', '50');
  url.searchParams.set('access_token', accessToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message || `Meta API HTTP ${res.status}`);
  }

  const data = await res.json() as {
    data: Array<{
      id: string;
      name: string;
      status: string;
      objective: string;
      insights?: {
        data: Array<{
          spend: string;
          impressions: string;
          clicks: string;
          reach: string;
          cpc: string;
          cpm: string;
          ctr: string;
          actions?: Array<{ action_type: string; value: string }>;
          action_values?: Array<{ action_type: string; value: string }>;
          date_start: string;
          date_stop: string;
        }>;
      };
    }>;
  };

  return (data.data || []).map((campaign) => {
    const insight = campaign.insights?.data?.[0];
    const purchaseAction = insight?.actions?.find(a => a.action_type === 'purchase');
    const purchaseValue = insight?.action_values?.find(a => a.action_type === 'purchase');

    const spend = toNumber(insight?.spend);
    const revenue = toNumber(purchaseValue?.value);
    const conversions = toNumber(purchaseAction?.value);

    return {
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      status: campaign.status,
      objective: campaign.objective,
      spend,
      impressions: toNumber(insight?.impressions),
      clicks: toNumber(insight?.clicks),
      reach: toNumber(insight?.reach),
      cpc: toNumber(insight?.cpc),
      cpm: toNumber(insight?.cpm),
      ctr: toNumber(insight?.ctr),
      roas: spend > 0 ? revenue / spend : 0,
      conversions,
      revenue,
      date_start: insight?.date_start || '',
      date_stop: insight?.date_stop || '',
    };
  });
}

/* ─── Pausar anúncio (requer aprovação antes de chamar) ────────────────────── */

/**
 * ⚠️ ATENÇÃO: Chamar APENAS após aprovação em ai_action_queue.
 * Pausa um anúncio ou campanha no Meta Ads.
 */
export async function pauseAd(adId: string, cfg?: MetaAdsConfig): Promise<boolean> {
  const { accessToken } = cfg || getConfig();

  const res = await fetch(`${META_BASE}/${adId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'PAUSED', access_token: accessToken }),
  });
  return res.ok;
}

/* ─── Atualizar orçamento diário (requer aprovação + limite de 30%) ─────────── */

/**
 * ⚠️ ATENÇÃO: Chamar APENAS após aprovação em ai_action_queue.
 * Atualiza o orçamento diário de uma campanha.
 * Limite embutido: nunca aumenta mais de 30% em relação ao orçamento atual.
 *
 * @param campaignId        - ID da campanha no Meta
 * @param newBudgetCents    - Novo orçamento em centavos (ex: R$ 50 = 5000)
 * @param currentBudgetCents - Orçamento atual (para aplicar limite de 30%)
 */
export async function updateDailyBudget(
  campaignId: string,
  newBudgetCents: number,
  currentBudgetCents: number,
  cfg?: MetaAdsConfig,
): Promise<{ ok: boolean; applied: number }> {
  const { accessToken } = cfg || getConfig();

  // Regra de segurança hardcoded: máx 30% de aumento por vez
  const maxAllowed = Math.floor(currentBudgetCents * 1.30);
  const applied = Math.min(newBudgetCents, maxAllowed);

  const res = await fetch(`${META_BASE}/${campaignId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ daily_budget: applied, access_token: accessToken }),
  });

  return { ok: res.ok, applied };
}

/* ─── Criar rascunho de anúncio (status PAUSED — nunca ativo direto) ─────────── */

/**
 * Cria um rascunho de ad set baseado em copy gerado pelo Cláudio.
 * O anúncio nasce PAUSADO — a operadora publica manualmente no Gerenciador.
 */
export async function createAdDraft(params: {
  campaignId: string;
  headline: string;
  body: string;
  callToAction: string;
  imageUrl?: string;
  cfg?: MetaAdsConfig;
}): Promise<{ ok: boolean; adId?: string }> {
  const { accessToken, adAccountId } = params.cfg || getConfig();

  // Criar ad set pausado
  const res = await fetch(`${META_BASE}/${adAccountId}/ads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaign_id: params.campaignId,
      name: `[IA Cláudio] ${params.headline}`,
      status: 'PAUSED',   // SEMPRE pausado — operadora publica manualmente
      creative: {
        title: params.headline,
        body: params.body,
        call_to_action_type: params.callToAction,
        ...(params.imageUrl && { image_url: params.imageUrl }),
      },
      access_token: accessToken,
    }),
  });

  if (!res.ok) return { ok: false };
  const data = await res.json() as { id?: string };
  return { ok: true, adId: data.id };
}

/* ─── Verificar conexão com a Meta API ─────────────────────────────────────── */

export async function testMetaConnection(cfg?: MetaAdsConfig): Promise<{
  ok: boolean;
  accountName?: string;
  error?: string;
}> {
  try {
    const { accessToken, adAccountId } = cfg || getConfig();
    const url = `${META_BASE}/${adAccountId}?fields=name,account_status&access_token=${accessToken}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      return { ok: false, error: err.error?.message || `HTTP ${res.status}` };
    }
    const data = await res.json() as { name?: string };
    return { ok: true, accountName: data.name };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
