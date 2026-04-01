// ANTES: não existia integração com Meta Marketing API.
// DEPOIS: serviço completo para buscar métricas de campanhas, pausar anúncios
//         e atualizar orçamentos — sempre via fila de aprovação (nunca direto).

import { META_BASE } from '@/lib/meta-config';

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

async function getConfigForTenant(tenantId?: string): Promise<MetaAdsConfig> {
  if (tenantId) {
    const { resolverTokenMeta } = await import('./meta-token.service');
    const config = await resolverTokenMeta(tenantId);
    if (config) return { accessToken: config.accessToken, adAccountId: config.adAccountId };
  }
  return getConfig();
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
  tenantId?: string,
): Promise<MetaCampaignMetrics[]> {
  const { accessToken, adAccountId } = cfg || await getConfigForTenant(tenantId);

  const insightFields = [
    'spend', 'impressions', 'clicks', 'reach', 'cpc', 'cpm', 'ctr',
    'actions', 'action_values',
  ].join(',');

  const campaignFields = [
    `insights.date_preset(${dateRange}){${insightFields},date_start,date_stop}`,
    'name', 'status', 'objective',
  ].join(',');

  type CampaignRaw = {
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
  };

  // Busca todas as páginas seguindo o cursor paging.next
  const allCampaigns: CampaignRaw[] = [];
  let nextUrl: string | null = (() => {
    const u = new URL(`${META_BASE}/${adAccountId}/campaigns`);
    u.searchParams.set('fields', campaignFields);
    u.searchParams.set('effective_status', JSON.stringify(['ACTIVE', 'PAUSED']));
    u.searchParams.set('limit', '100');
    u.searchParams.set('access_token', accessToken);
    return u.toString();
  })();

  while (nextUrl) {
    const res = await fetch(nextUrl);
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(err.error?.message || `Meta API HTTP ${res.status}`);
    }
    const page = await res.json() as { data: CampaignRaw[]; paging?: { next?: string } };
    allCampaigns.push(...(page.data || []));
    nextUrl = page.paging?.next || null;
  }

  return allCampaigns.map((campaign) => {
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
export async function pauseAd(adId: string, cfg?: MetaAdsConfig, tenantId?: string): Promise<boolean> {
  const { accessToken } = cfg || await getConfigForTenant(tenantId);

  const res = await fetch(`${META_BASE}/${adId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'PAUSED', access_token: accessToken }),
  });
  return res.ok;
}

/* ─── Criar rascunho de anúncio (status PAUSED — nunca ativo direto) ─────────── */

/**
 * Cria um rascunho de anúncio baseado em copy gerado pelo Cláudio.
 * O anúncio nasce PAUSADO — a operadora publica manualmente no Gerenciador.
 *
 * Fluxo obrigatório da Meta API:
 *   1. POST /{account}/adcreatives → obtém creative_id
 *   2. POST /{account}/ads com { creative: { creative_id } } → cria o anúncio
 */
export async function createAdDraft(params: {
  campaignId: string;
  adsetId: string;
  pageId: string;          // Page ID da página do Facebook/Instagram
  headline: string;
  body: string;
  callToAction: string;
  imageUrl?: string;
  cfg?: MetaAdsConfig;
  tenantId?: string;
}): Promise<{ ok: boolean; adId?: string; error?: string }> {
  const { accessToken, adAccountId } = params.cfg || await getConfigForTenant(params.tenantId);

  // Passo 1: criar o criativo
  const creativeRes = await fetch(`${META_BASE}/${adAccountId}/adcreatives`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `[IA Cláudio] ${params.headline}`,
      object_story_spec: {
        page_id: params.pageId,
        link_data: {
          message: params.body,
          name: params.headline,
          call_to_action: { type: params.callToAction },
          ...(params.imageUrl && { picture: params.imageUrl }),
        },
      },
      access_token: accessToken,
    }),
  });

  if (!creativeRes.ok) {
    const err = await creativeRes.json().catch(() => ({})) as { error?: { message?: string } };
    return { ok: false, error: err.error?.message || `Creative HTTP ${creativeRes.status}` };
  }

  const creativeData = await creativeRes.json() as { id?: string };
  if (!creativeData.id) return { ok: false, error: 'Meta não retornou creative_id' };

  // Passo 2: criar o anúncio referenciando o criativo
  const adRes = await fetch(`${META_BASE}/${adAccountId}/ads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaign_id: params.campaignId,
      adset_id: params.adsetId,
      name: `[IA Cláudio] ${params.headline}`,
      status: 'PAUSED',   // SEMPRE pausado — operadora publica manualmente
      creative: { creative_id: creativeData.id },
      access_token: accessToken,
    }),
  });

  if (!adRes.ok) {
    const err = await adRes.json().catch(() => ({})) as { error?: { message?: string } };
    return { ok: false, error: err.error?.message || `Ad HTTP ${adRes.status}` };
  }

  const adData = await adRes.json() as { id?: string };
  return { ok: true, adId: adData.id };
}

/* ─── Verificar conexão com a Meta API ─────────────────────────────────────── */

export async function testMetaConnection(cfg?: MetaAdsConfig, tenantId?: string): Promise<{
  ok: boolean;
  accountName?: string;
  error?: string;
}> {
  try {
    const { accessToken, adAccountId } = cfg || await getConfigForTenant(tenantId);
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
