/**
 * Públicos de alta performance para CJ Rasteirinhas / Cjota Rasteirinhas.
 *
 * Três tipos de público prontos para uso pelo agente:
 * 1. Frio — interesses segmentados (mulheres, moda, atacado)
 * 2. Quente — engajamento com a página nos últimos 30 dias
 * 3. Visitantes do site — pixel de remarketing
 * 4. Lookalike — similar aos clientes reais do VEXX
 */

import { META_BASE } from '@/lib/meta-config';
import { createServerSupabaseClient } from '@/lib/supabase';
import { buscarInterestId } from './meta-audiences.service';
import { resolverTokenMeta } from './meta-token.service';

const PAGE_ID  = '101337882545607'; // CJ Rasteirinhas — Page ID (não Business ID)
const PIXEL_ID = '518376893062766';

/* ─── Interesses de alta performance ────────────────────────────────────── */

// Termos em inglês/neutro que a Meta API pt_BR consegue resolver com confiança
const INTERESSES_ATACADO = [
  'Moda feminina',
  'Calçados femininos',
  'Sandálias',
  'Empreendedorismo',
  'Renda extra',
  'Pequenos negócios',
  'Atacado',
  'Revenda',
];

/* ─── Targeting por tipo ─────────────────────────────────────────────────── */

// Targeting simplificado: sem placement fields (publisher_platforms, instagram_positions etc.)
// Campos de placement dentro de "targeting" causam "Invalid parameter" em OUTCOME_TRAFFIC.
// Deixar a Meta escolher placements automaticamente é mais seguro e geralmente performa melhor.

export function targetingFrio(interestIds: Array<{ id: string; name: string }>) {
  return {
    age_min: 25,
    age_max: 55,
    genders: [2],
    geo_locations: { countries: ['BR'] },
    ...(interestIds.length > 0 ? { flexible_spec: [{ interests: interestIds }] } : {}),
  };
}

export function targetingWhatsApp(interestIds: Array<{ id: string; name: string }>) {
  return {
    age_min: 25,
    age_max: 50,
    genders: [2],
    geo_locations: { countries: ['BR'] },
    ...(interestIds.length > 0 ? { flexible_spec: [{ interests: interestIds.slice(0, 4) }] } : {}),
  };
}

export function targetingQuente(customAudienceId: string | null) {
  const base: Record<string, unknown> = {
    age_min: 22,
    age_max: 55,
    genders: [2],
    geo_locations: { countries: ['BR'] },
  };
  if (customAudienceId) {
    base.custom_audiences = [{ id: customAudienceId }];
  }
  return base;
}

/* ─── Buscar interesses reais no Meta ────────────────────────────────────── */

// Fallback com IDs conhecidos caso a busca dinâmica retorne poucos resultados
const INTERESSES_FALLBACK: Array<{ id: string; name: string }> = [
  { id: '6003107902433', name: 'Moda feminina' },
  { id: '6003200790972', name: 'Calçados femininos' },
  { id: '6003349442438', name: 'Empreendedorismo' },
  { id: '6003483890484', name: 'Negócio próprio' },
];

export async function buscarInteressesAtacado(
  token: string,
): Promise<Array<{ id: string; name: string }>> {
  try {
    const resultados = await Promise.all(
      INTERESSES_ATACADO.map(nome => buscarInterestId(nome, token))
    );
    const encontrados = resultados
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map(r => ({ id: r.id, name: r.name }));
    // Se encontrou pelo menos 3 interesses, usa os dinâmicos; senão usa fallback
    return encontrados.length >= 3 ? encontrados : INTERESSES_FALLBACK;
  } catch {
    return INTERESSES_FALLBACK;
  }
}

/* ─── Público de engajamento com a página (quente) ───────────────────────── */

export async function criarPublicoEngajamentoReal(
  accountId: string,
  token: string,
  tenantId: string,
  dias: number = 30,
): Promise<string | null> {
  const supabase = createServerSupabaseClient();

  const { data: existente } = await supabase
    .from('meta_audiences')
    .select('meta_audience_id')
    .eq('tenant_id', tenantId)
    .eq('tipo', 'remarketing')
    .not('meta_audience_id', 'is', null)
    .not('nome', 'ilike', '%Visitantes%')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (existente?.meta_audience_id) return existente.meta_audience_id;

  const rule = {
    inclusions: {
      operator: 'or',
      rules: [{
        event_sources: [{ id: PAGE_ID, type: 'page' }],
        retention_seconds: dias * 86400,
        filter: {
          operator: 'and',
          filters: [{ field: 'event', operator: 'eq', value: 'page_engaged' }],
        },
      }],
    },
  };

  const formParams = new URLSearchParams();
  formParams.set('name', `Cjota Rasteirinhas - Engajamento ${dias}d`);
  formParams.set('description', `Pessoas que interagiram com cjotarasteirinhas nos ultimos ${dias} dias`);
  formParams.set('subtype', 'ENGAGEMENT');
  formParams.set('rule', JSON.stringify(rule));
  formParams.set('access_token', token);

  try {
    const res = await fetch(
      `${META_BASE}/act_${accountId.replace('act_', '')}/customaudiences`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formParams.toString(),
        signal: AbortSignal.timeout(15_000),
      }
    );
    const data = await res.json() as { id?: string; error?: { message: string } };

    if (data.id) {
      await supabase.from('meta_audiences').insert({
        tenant_id: tenantId,
        nome: `Cjota Rasteirinhas - Engajamento ${dias}d`,
        descricao: `Quem interagiu com cjotarasteirinhas nos ultimos ${dias} dias`,
        meta_audience_id: data.id,
        targeting: { custom_audiences: [{ id: data.id }] },
        criado_por_ia: true,
        tipo: 'remarketing',
        status: 'pronto',
      });
      return data.id;
    }
  } catch (err) {
    console.error('[publicos-cj] Erro ao criar engajamento:', err);
  }
  return null;
}

/* ─── Público de visitantes do site via Pixel ────────────────────────────── */

export async function criarPublicoVisitantesSite(
  accountId: string,
  token: string,
  tenantId: string,
  dias: number = 30,
): Promise<string | null> {
  const supabase = createServerSupabaseClient();

  const { data: existente } = await supabase
    .from('meta_audiences')
    .select('meta_audience_id')
    .eq('tenant_id', tenantId)
    .eq('tipo', 'remarketing')
    .ilike('nome', '%Visitantes%')
    .not('meta_audience_id', 'is', null)
    .limit(1)
    .single();

  if (existente?.meta_audience_id) return existente.meta_audience_id;

  const rule = {
    inclusions: {
      operator: 'or',
      rules: [{
        event_sources: [{ id: PIXEL_ID, type: 'pixel' }],
        retention_seconds: dias * 86400,
        filter: {
          operator: 'and',
          filters: [{ field: 'event', operator: 'eq', value: 'PageView' }],
        },
      }],
    },
  };

  const formParams = new URLSearchParams();
  formParams.set('name', `Visitantes cjotarasteirinhas.com.br ${dias}d`);
  formParams.set('description', `Quem visitou o site nos últimos ${dias} dias`);
  formParams.set('subtype', 'WEBSITE');
  formParams.set('rule', JSON.stringify(rule));
  formParams.set('access_token', token);

  try {
    const res = await fetch(
      `${META_BASE}/act_${accountId.replace('act_', '')}/customaudiences`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formParams.toString(),
        signal: AbortSignal.timeout(15_000),
      }
    );
    const data = await res.json() as { id?: string; error?: { message: string } };

    if (data.id) {
      await supabase.from('meta_audiences').insert({
        tenant_id: tenantId,
        nome: `Visitantes cjotarasteirinhas.com.br ${dias}d`,
        descricao: `Pixel — visitantes do site nos últimos ${dias} dias`,
        meta_audience_id: data.id,
        targeting: { custom_audiences: [{ id: data.id }] },
        criado_por_ia: true,
        tipo: 'remarketing',
        status: 'pronto',
      });
      return data.id;
    }
  } catch (err) {
    console.error('[publicos-cj] Erro ao criar visitantes:', err);
  }
  return null;
}

/* ─── Público de engajamento com Instagram ───────────────────────────────── */

export async function criarPublicoEngajamentoInstagram(
  accountId: string,
  token: string,
  tenantId: string,
  igAccountId: string,
  dias: number = 30,
): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const actId = accountId.replace('act_', '');

  const rule = {
    inclusions: {
      operator: 'or',
      rules: [{
        event_sources: [{ id: igAccountId, type: 'ig_business' }],
        retention_seconds: dias * 86400,
        filter: {
          operator: 'and',
          filters: [{ field: 'event', operator: 'eq', value: 'ig_business_profile_all' }],
        },
      }],
    },
  };

  const params = new URLSearchParams();
  params.set('name', `CJ Engajamento Instagram ${dias}d`);
  params.set('description', `Engajamento Instagram nos ultimos ${dias} dias`);
  params.set('subtype', 'ENGAGEMENT');
  params.set('rule', JSON.stringify(rule));
  params.set('access_token', token);

  try {
    const res = await fetch(`${META_BASE}/act_${actId}/customaudiences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json() as { id?: string; error?: { message: string } };
    console.log('[publicos-cj] Instagram engajamento:', data);
    if (data.id) {
      await supabase.from('meta_audiences').insert({
        tenant_id: tenantId,
        nome: `CJ Engajamento Instagram ${dias}d`,
        descricao: `Engajamento Instagram nos ultimos ${dias} dias`,
        meta_audience_id: data.id,
        targeting: { custom_audiences: [{ id: data.id }] },
        criado_por_ia: true,
        tipo: 'remarketing',
        status: 'pronto',
      });
      return data.id;
    }
  } catch (err) {
    console.error('[publicos-cj] Erro Instagram:', err);
  }
  return null;
}

/* ─── Público de engajamento com Vídeo ───────────────────────────────────── */

const PERCENTUAL_MAP: Record<number, string> = {
  25: 'video_view_25_percent',
  50: 'video_view_50_percent',
  75: 'video_view_75_percent',
  95: 'video_view_95_percent',
};

export async function criarPublicoEngajamentoVideo(
  accountId: string,
  token: string,
  tenantId: string,
  videoIds: string[],
  percentual = 25,
  dias = 30,
): Promise<string | null> {
  if (!videoIds.length) return null;
  const supabase = createServerSupabaseClient();
  const actId = accountId.replace('act_', '');
  const eventValue = PERCENTUAL_MAP[percentual] ?? 'video_view_25_percent';
  const nome = `CJ Engajamento Video ${percentual}pct ${dias}d`;

  const rule = {
    inclusions: {
      operator: 'or',
      rules: [{
        event_sources: videoIds.map(id => ({ id, type: 'video' })),
        retention_seconds: dias * 86400,
        filter: {
          operator: 'and',
          filters: [{ field: 'event', operator: 'eq', value: eventValue }],
        },
      }],
    },
  };

  const params = new URLSearchParams();
  params.set('name', nome);
  params.set('description', `Assistiram ${percentual}pct dos videos selecionados nos ultimos ${dias} dias`);
  params.set('subtype', 'ENGAGEMENT');
  params.set('rule', JSON.stringify(rule));
  params.set('access_token', token);

  try {
    const res = await fetch(`${META_BASE}/act_${actId}/customaudiences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json() as { id?: string; error?: { message: string } };
    console.log('[publicos-cj] Video engajamento:', data);
    if (data.id) {
      await supabase.from('meta_audiences').insert({
        tenant_id: tenantId,
        nome,
        descricao: `Assistiram ${percentual}pct dos videos selecionados nos ultimos ${dias} dias`,
        meta_audience_id: data.id,
        targeting: { custom_audiences: [{ id: data.id }] },
        criado_por_ia: true,
        tipo: 'remarketing',
        status: 'pronto',
      });
      return data.id;
    }
  } catch (err) {
    console.error('[publicos-cj] Erro Video:', err);
  }
  return null;
}

/* ─── Lista de Clientes do VEXX (CUSTOM audience sem lookalike) ──────────── */

export async function criarPublicoListaClientes(
  accountId: string,
  token: string,
  tenantId: string,
): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const actId = accountId.replace('act_', '');

  const { data: clientes } = await supabase
    .from('clients')
    .select('phone, email, name')
    .eq('tenant_id', tenantId)
    .limit(1000);

  if (!clientes || clientes.length < 10) {
    console.warn('[publicos-cj] Poucos clientes para lista:', clientes?.length);
    return null;
  }

  const params = new URLSearchParams();
  params.set('name', 'CJ Lista Clientes VEXX');
  params.set('description', `${clientes.length} clientes reais CJ Rasteirinhas`);
  params.set('subtype', 'CUSTOM');
  params.set('customer_file_source', 'USER_PROVIDED_ONLY');
  params.set('access_token', token);

  try {
    const createRes = await fetch(`${META_BASE}/act_${actId}/customaudiences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const createData = await createRes.json() as { id?: string; error?: { message: string } };
    console.log('[publicos-cj] Lista clientes criada:', createData);
    if (!createData.id) return null;

    const audienceId = createData.id;
    const crypto = await import('crypto');
    const schema = ['PHONE', 'EMAIL', 'FN'];
    const rows = clientes
      .map(c => {
        const phone = c.phone?.replace(/\D/g, '') ?? '';
        const email = (c.email ?? '').toLowerCase().trim();
        const fn    = (c.name ?? '').split(' ')[0].toLowerCase().trim();
        return [
          phone ? crypto.createHash('sha256').update(phone).digest('hex') : '',
          email ? crypto.createHash('sha256').update(email).digest('hex') : '',
          fn    ? crypto.createHash('sha256').update(fn).digest('hex')    : '',
        ];
      })
      .filter(row => row[0] || row[1]);

    await fetch(`${META_BASE}/${audienceId}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: { schema, data: rows }, access_token: token }),
      signal: AbortSignal.timeout(30_000),
    });

    await supabase.from('meta_audiences').insert({
      tenant_id: tenantId,
      nome: 'CJ Lista Clientes VEXX',
      descricao: `${clientes.length} clientes reais CJ Rasteirinhas`,
      meta_audience_id: audienceId,
      targeting: { custom_audiences: [{ id: audienceId }] },
      criado_por_ia: true,
      tipo: 'remarketing',
      status: 'pronto',
    });

    return audienceId;
  } catch (err) {
    console.error('[publicos-cj] Erro lista clientes:', err);
  }
  return null;
}

/* ─── Lookalike a partir dos clientes do VEXX ───────────────────────────── */

export async function criarLookalikeClientes(
  accountId: string,
  token: string,
  tenantId: string,
): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const actId = accountId.replace('act_', '');

  const { data: clientes } = await supabase
    .from('clients')
    .select('phone, email, name')
    .eq('tenant_id', tenantId)
    .not('phone', 'is', null)
    .limit(500);

  if (!clientes || clientes.length < 50) {
    console.warn('[publicos-cj] Poucos clientes para Lookalike:', clientes?.length);
    return null;
  }

  const formBase = new URLSearchParams();
  formBase.set('name', 'CJ Base Lookalike Clientes');
  formBase.set('description', `${clientes.length} clientes reais CJ Rasteirinhas`);
  formBase.set('subtype', 'CUSTOM');
  formBase.set('customer_file_source', 'USER_PROVIDED_ONLY');
  formBase.set('access_token', token);

  try {
    const baseRes = await fetch(`${META_BASE}/act_${actId}/customaudiences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBase.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const baseData = await baseRes.json() as { id?: string; error?: { message: string } };
    if (!baseData.id) return null;

    const audienceId = baseData.id;
    const crypto = await import('crypto');
    const schema = ['PHONE', 'EMAIL', 'FN'];
    const data = clientes
      .map(c => {
        const phone     = c.phone?.replace(/\D/g, '') ?? '';
        const email     = (c.email ?? '').toLowerCase().trim();
        const firstName = (c.name ?? '').split(' ')[0].toLowerCase().trim();
        return [
          phone     ? crypto.createHash('sha256').update(phone).digest('hex')     : '',
          email     ? crypto.createHash('sha256').update(email).digest('hex')     : '',
          firstName ? crypto.createHash('sha256').update(firstName).digest('hex') : '',
        ];
      })
      .filter(row => row[0] || row[1]);

    await fetch(`${META_BASE}/${audienceId}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: { schema, data }, access_token: token }),
      signal: AbortSignal.timeout(30_000),
    });

    const lookalikeForm = new URLSearchParams();
    lookalikeForm.set('name', 'CJ Lookalike Clientes 1pct BR');
    lookalikeForm.set('origin_audience_id', audienceId);
    lookalikeForm.set('lookalike_spec', JSON.stringify({
      type: 'similarity',
      starting_ratio: 0,
      ratio: 0.01,
      country: 'BR',
    }));
    lookalikeForm.set('access_token', token);

    const lookalikeRes = await fetch(`${META_BASE}/act_${actId}/customaudiences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: lookalikeForm.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const lookalikeData = await lookalikeRes.json() as { id?: string };

    if (lookalikeData.id) {
      await supabase.from('meta_audiences').insert({
        tenant_id: tenantId,
        nome: 'CJ Lookalike Clientes 1pct BR',
        descricao: `Similares aos ${clientes.length} clientes reais da CJ`,
        meta_audience_id: lookalikeData.id,
        targeting: { custom_audiences: [{ id: lookalikeData.id }] },
        criado_por_ia: true,
        tipo: 'lookalike',
        status: 'pronto',
      });
      return lookalikeData.id;
    }
  } catch (err) {
    console.error('[publicos-cj] Erro ao criar Lookalike:', err);
  }
  return null;
}

/* ─── Alias para compatibilidade ─────────────────────────────────────────── */
export const criarPublicoEngajamentoPagina = criarPublicoEngajamentoReal;

/* ─── Inicializar TODOS os públicos de uma vez ───────────────────────────── */

export async function inicializarTodosPublicos(
  tenantId: string,
  igAccountId?: string,
): Promise<Record<string, string | null>> {
  // Usa resolverTokenMeta — mesma lógica que funciona para criar campanhas
  const metaConfig = await resolverTokenMeta(tenantId);
  if (!metaConfig.account_id) {
    throw new Error('Ad Account ID não configurado. Configure em Configurações → Time de IAs.');
  }

  const token = metaConfig.token;
  const actId = metaConfig.account_id.replace('act_', '');

  // ig_account_id: parâmetro > DB
  const supabase = createServerSupabaseClient();
  const { data: extra } = await supabase
    .from('ai_provider_config')
    .select('meta_ig_account_id')
    .eq('tenant_id', tenantId)
    .single();
  const igId = igAccountId ?? (extra?.meta_ig_account_id as string | undefined) ?? '';

  const resultados: Record<string, string | null> = {};

  const [engPag, visitantes, listaClientes] = await Promise.allSettled([
    criarPublicoEngajamentoReal(actId, token, tenantId, 30),
    criarPublicoVisitantesSite(actId, token, tenantId, 30),
    criarPublicoListaClientes(actId, token, tenantId),
  ]);

  resultados.engajamento_pagina  = engPag.status      === 'fulfilled' ? engPag.value      : null;
  resultados.visitantes_site     = visitantes.status  === 'fulfilled' ? visitantes.value  : null;
  resultados.lista_clientes      = listaClientes.status === 'fulfilled' ? listaClientes.value : null;

  // Instagram só se tiver o ID configurado
  if (igId) {
    try {
      resultados.engajamento_instagram = await criarPublicoEngajamentoInstagram(actId, token, tenantId, igId, 30);
    } catch {
      resultados.engajamento_instagram = null;
    }
  } else {
    resultados.engajamento_instagram = null;
  }

  // Lookalike após ter lista de clientes
  try {
    resultados.lookalike = await criarLookalikeClientes(actId, token, tenantId);
  } catch {
    resultados.lookalike = null;
  }

  return resultados;
}
