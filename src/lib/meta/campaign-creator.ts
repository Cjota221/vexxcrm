/**
 * Meta Ads Campaign Creator — payloads validados no Graph API Explorer v25.0
 * Cria campanha completa: campanha → adset → criativo → anúncio (todos PAUSED).
 * Nunca expor token no frontend — usar apenas via API Routes server-side.
 */

const META_API_VERSION = 'v25.0';
const META_API_BASE    = `https://graph.facebook.com/${META_API_VERSION}`;

const META_AD_ACCOUNT = process.env.META_AD_ACCOUNT_CJ ?? 'act_1244920119465862';
const META_PAGE_ID    = process.env.META_PAGE_ID_CJ    ?? '101337882545607';

// Campos que devem ser JSON.stringify no body form-encoded
const FORM_COMPLEX_FIELDS = new Set([
  'targeting', 'object_story_spec', 'creative', 'special_ad_categories',
]);

/* ─── Interfaces ─────────────────────────────────────────────────────────── */

export interface CampaignParams {
  name: string;
  objective?: string; // default: OUTCOME_TRAFFIC
}

export interface AdSetParams {
  name: string;
  campaignId: string;
  dailyBudget: number;                              // em reais — convertido internamente (x100)
  ageMin?: number;                                  // default: 25
  ageMax?: number;                                  // default: 55
  interests?: Array<{ id: string; name: string }>; // default: []
}

export interface AdCreativeParams {
  name: string;
  message: string;       // texto principal do anúncio
  title: string;         // título
  link: string;          // URL de destino
  imageHash?: string;    // hash de imagem já uploadada no Meta (opcional)
  callToAction?: string; // default: LEARN_MORE
}

export interface AdParams {
  name: string;
  adsetId: string;
  creativeId: string;
}

export interface FullCampaignResult {
  campaignId: string;
  adsetId: string;
  creativeId: string;
  adId: string;
  adsManagerUrl: string;
}

/* ─── Helper HTTP ────────────────────────────────────────────────────────── */

async function metaPost<T>(
  endpoint: string,
  body: Record<string, unknown>,
  token: string,
): Promise<T> {
  const params = new URLSearchParams();
  params.set('access_token', token);

  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue;
    params.set(
      k,
      FORM_COMPLEX_FIELDS.has(k) || typeof v === 'object' ? JSON.stringify(v) : String(v),
    );
  }

  const url = `${META_API_BASE}/${endpoint}`;
  console.log(`[META v25] POST /${endpoint}`, JSON.stringify(body, null, 2));

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: AbortSignal.timeout(15_000),
  });

  const data = await res.json() as T & {
    error?: { message: string; error_user_msg?: string; fbtrace_id?: string };
  };

  if (!res.ok) {
    const err = (data as { error?: { message: string; error_user_msg?: string; fbtrace_id?: string } }).error;
    const msg   = err?.error_user_msg ?? err?.message ?? `Meta HTTP ${res.status}`;
    const trace = err?.fbtrace_id ? ` [fbtrace_id: ${err.fbtrace_id}]` : '';
    console.error(`[META v25 ERROR] ${endpoint}${trace}`, JSON.stringify(err));
    throw new Error(`${msg}${trace}`);
  }

  console.log(`[META v25] OK /${endpoint}:`, JSON.stringify(data));
  return data;
}

/* ─── 1.1 Criar campanha ─────────────────────────────────────────────────── */

export async function createCampaign(
  params: CampaignParams,
  token: string,
): Promise<string> {
  console.log('[META] Etapa 1/4 — Criando campanha:', params.name);

  const data = await metaPost<{ id: string }>(
    `${META_AD_ACCOUNT}/campaigns`,
    {
      name:                            params.name,
      objective:                       params.objective ?? 'OUTCOME_TRAFFIC',
      status:                          'PAUSED',
      special_ad_categories:           [],
      is_adset_budget_sharing_enabled: false,
    },
    token,
  );

  if (!data.id) throw new Error('Campanha criada sem ID retornado pelo Meta');
  console.log('[META] ✓ Campanha criada:', data.id);
  return data.id;
}

/* ─── 1.2 Criar adset ───────────────────────────────────────────────────── */

export async function createAdSet(
  params: AdSetParams,
  token: string,
): Promise<string> {
  console.log('[META] Etapa 2/4 — Criando adset:', params.name);

  // targeting_automation fica DENTRO de targeting (validado v25.0)
  const targeting: Record<string, unknown> = {
    geo_locations:       { countries: ['BR'] },
    age_min:             params.ageMin ?? 25,
    age_max:             params.ageMax ?? 55,
    genders:             [2],
    publisher_platforms: ['facebook', 'instagram'],
    facebook_positions:  ['feed'],
    instagram_positions: ['stream', 'story', 'reels'],
    targeting_automation: { advantage_audience: 0 },
    interests:           params.interests ?? [],
  };

  const data = await metaPost<{ id: string }>(
    `${META_AD_ACCOUNT}/adsets`,
    {
      name:              params.name,
      campaign_id:       params.campaignId,
      daily_budget:      Math.round(params.dailyBudget * 100), // reais → centavos
      billing_event:     'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      bid_strategy:      'LOWEST_COST_WITHOUT_CAP',
      targeting,
      status:            'PAUSED',
    },
    token,
  );

  if (!data.id) throw new Error('Adset criado sem ID retornado pelo Meta');
  console.log('[META] ✓ Adset criado:', data.id);
  return data.id;
}

/* ─── 1.3 Criar criativo ────────────────────────────────────────────────── */

export async function createAdCreative(
  params: AdCreativeParams,
  token: string,
): Promise<string> {
  console.log('[META] Etapa 3/4 — Criando criativo:', params.name);

  const linkData: Record<string, unknown> = {
    link:    params.link,
    message: params.message,
    name:    params.title,
    call_to_action: {
      type:  params.callToAction ?? 'LEARN_MORE',
      value: { link: params.link },
    },
  };
  if (params.imageHash) linkData.image_hash = params.imageHash;

  const data = await metaPost<{ id: string }>(
    `${META_AD_ACCOUNT}/adcreatives`,
    {
      name:              params.name,
      object_story_spec: {
        page_id:   META_PAGE_ID,
        link_data: linkData,
      },
    },
    token,
  );

  if (!data.id) throw new Error('Criativo criado sem ID retornado pelo Meta');
  console.log('[META] ✓ Criativo criado:', data.id);
  return data.id;
}

/* ─── 1.4 Criar anúncio ─────────────────────────────────────────────────── */

export async function createAd(
  params: AdParams,
  token: string,
): Promise<string> {
  console.log('[META] Etapa 4/4 — Criando anúncio:', params.name);

  const data = await metaPost<{ id: string }>(
    `${META_AD_ACCOUNT}/ads`,
    {
      name:     params.name,
      adset_id: params.adsetId,
      creative: { creative_id: params.creativeId },
      status:   'PAUSED',
    },
    token,
  );

  if (!data.id) throw new Error('Anúncio criado sem ID retornado pelo Meta');
  console.log('[META] ✓ Anúncio criado:', data.id);
  return data.id;
}

/* ─── 1.5 Orquestrador completo ─────────────────────────────────────────── */

export async function createFullCampaign(
  campaign: CampaignParams,
  adset: Omit<AdSetParams, 'campaignId'>,
  creative: AdCreativeParams,
  adName: string,
  token: string,
): Promise<FullCampaignResult> {
  const campaignId  = await createCampaign(campaign, token);
  const adsetId     = await createAdSet({ ...adset, campaignId }, token);
  const creativeId  = await createAdCreative(creative, token);
  const adId        = await createAd({ name: adName, adsetId, creativeId }, token);

  const adAccountNumeric = META_AD_ACCOUNT.replace('act_', '');
  const adsManagerUrl = `https://www.facebook.com/adsmanager/manage/campaigns?act=${adAccountNumeric}&selected_campaign_ids=${campaignId}`;

  console.log('[META] ✅ Campanha completa criada:', { campaignId, adsetId, creativeId, adId });
  return { campaignId, adsetId, creativeId, adId, adsManagerUrl };
}
