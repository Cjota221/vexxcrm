/**
 * Editor de campanhas Meta Ads — executa ações no Meta após aprovação.
 * TODAS as ações destrutivas/financeiras requerem confirmação na UI.
 */

const META_BASE = 'https://graph.facebook.com/v23.0';

async function metaPost(url: string, body: Record<string, unknown>): Promise<{ id?: string; success?: boolean; error?: { message: string } }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

/**
 * Editar texto de um anúncio.
 * Meta não permite editar criativo existente — cria novo e vincula.
 */
export async function editarTextoAnuncio(params: {
  adId: string;
  accountId: string;
  titulo: string;
  texto: string;
  cta: string;
  imageUrl?: string;
  videoId?: string;
  token: string;
}): Promise<{ ok: boolean; error?: string }> {
  const actId = params.accountId.startsWith('act_') ? params.accountId : `act_${params.accountId}`;

  // 1. Criar novo criativo
  const linkData: Record<string, unknown> = {
    message: params.texto,
    name: params.titulo,
    call_to_action: { type: params.cta || 'LEARN_MORE' },
  };
  if (params.imageUrl) linkData.picture = params.imageUrl;

  const creativoBody: Record<string, unknown> = {
    name: `[VEXX] ${params.titulo} — ${new Date().toISOString().substring(0, 10)}`,
    object_story_spec: { link_data: linkData },
    access_token: params.token,
  };
  if (params.videoId) {
    creativoBody.object_story_spec = {
      video_data: {
        video_id: params.videoId,
        title: params.titulo,
        message: params.texto,
        call_to_action: { type: params.cta || 'LEARN_MORE' },
      },
    };
  }

  const novoCriativo = await metaPost(`${META_BASE}/${actId}/adcreatives`, creativoBody);
  if (novoCriativo.error) return { ok: false, error: novoCriativo.error.message };
  if (!novoCriativo.id) return { ok: false, error: 'Criativo não criado' };

  // 2. Vincular novo criativo ao anúncio
  const vincular = await metaPost(`${META_BASE}/${params.adId}`, {
    creative: { creative_id: novoCriativo.id },
    access_token: params.token,
  });
  if (vincular.error) return { ok: false, error: vincular.error.message };

  return { ok: true };
}

/**
 * Mudar orçamento diário de uma campanha.
 * REGRA: nunca aumentar mais de 30% por vez.
 */
export async function mudarOrcamento(params: {
  campaignId: string;
  novoOrcamentoCentavos: number;
  orcamentoAtualCentavos: number;
  token: string;
}): Promise<{ ok: boolean; aplicado: number; erro?: string }> {
  const maximo = Math.floor(params.orcamentoAtualCentavos * 1.30);
  const final = Math.min(params.novoOrcamentoCentavos, maximo);

  if (params.novoOrcamentoCentavos > maximo) {
    return {
      ok: false,
      aplicado: 0,
      erro: `Limite de segurança: máximo 30% de aumento por vez. ` +
            `Máximo permitido: R$${(maximo / 100).toFixed(2)}`,
    };
  }

  const res = await metaPost(`${META_BASE}/${params.campaignId}`, {
    daily_budget: final,
    access_token: params.token,
  });

  if (res.error) return { ok: false, aplicado: 0, erro: res.error.message };
  return { ok: true, aplicado: final };
}

/**
 * Pausar ou ativar campanha/adset/anúncio.
 */
export async function alterarStatus(params: {
  id: string;
  novoStatus: 'ACTIVE' | 'PAUSED';
  token: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await metaPost(`${META_BASE}/${params.id}`, {
    status: params.novoStatus,
    access_token: params.token,
  });
  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true };
}

/**
 * Duplicar campanha completa (deep copy, sempre PAUSADA).
 */
export async function duplicarCampanha(params: {
  campaignId: string;
  token: string;
}): Promise<{ ok: boolean; novoCampaignId?: string; error?: string }> {
  const res = await metaPost(`${META_BASE}/${params.campaignId}/copies`, {
    deep_copy: true,
    status_option: 'PAUSED',
    access_token: params.token,
  });
  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, novoCampaignId: res.id };
}
