// Serviço de criação de públicos via Meta Marketing API v23.0.
// Suporta: públicos de interesse (saved), públicos de engajamento (remarketing),
// e estimativa de alcance via /reachestimate.

import { createServerSupabaseClient } from '@/lib/supabase';
import type { PublicoConfigurado, CopyPublico } from './claudio-audience-creator.service';

import { META_BASE } from '@/lib/meta-config';

/* ─── Tipos ──────────────────────────────────────────────────────────────────── */

export interface PublicoCriado {
  id: string;
  nome: string;
  tipo: 'interesse' | 'remarketing' | 'lookalike';
  tamanho_estimado: string;
  estimativa_min?: number;
  estimativa_max?: number;
  copy_sugerido?: CopyPublico;
  estrategia?: string;
  meta_audience_id?: string;
  erro?: string;
  status: 'criado' | 'falhou';
}

interface InterestSearchResult {
  id: string;
  name: string;
  audience_size_lower_bound?: number;
  audience_size_upper_bound?: number;
}

/* ─── Cache de interesses (evita chamadas repetidas ao Meta) ─────────────────── */

interface InterestCacheEntry { result: InterestSearchResult | null; expiresAt: number }
const interestCache = new Map<string, InterestCacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

/* ─── Buscar ID de interesse no Meta ─────────────────────────────────────────── */

/**
 * Busca o interest ID real no Meta por nome.
 * Resultados ficam em cache por 1 hora para reduzir chamadas à API.
 */
export async function buscarInterestId(
  interesse: string,
  token: string,
): Promise<InterestSearchResult | null> {
  // Usa os primeiros 8 chars do token como chave para não misturar contas
  const cacheKey = `${interesse.toLowerCase()}:${token.substring(0, 8)}`;
  const cached = interestCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  try {
    const res = await fetch(
      `${META_BASE}/search?type=adinterest&q=${encodeURIComponent(interesse)}&locale=pt_BR&limit=3&access_token=${token}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as { data?: InterestSearchResult[] };
    const result = data.data?.[0] || null;
    interestCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch {
    return null;
  }
}

/* ─── Estimar alcance do público ─────────────────────────────────────────────── */

async function estimarAlcance(
  accountId: string,
  token: string,
  targeting: Record<string, unknown>,
): Promise<{ min: number; max: number; texto: string }> {
  const formatNum = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);

  try {
    const params = new URLSearchParams();
    params.set('targeting_spec', JSON.stringify(targeting));
    params.set('optimization_goal', 'REACH');
    params.set('access_token', token);

    const res = await fetch(
      `${META_BASE}/act_${accountId}/reachestimate?${params.toString()}`,
      { signal: AbortSignal.timeout(10000) },
    );

    if (!res.ok) return { min: 0, max: 0, texto: 'Estimativa indisponível' };

    const data = await res.json() as {
      users_lower_bound?: number;
      users_upper_bound?: number;
      estimate_ready?: boolean;
    };

    const min = data.users_lower_bound || 0;
    const max = data.users_upper_bound || 0;

    if (!min && !max) return { min: 0, max: 0, texto: 'Calculando...' };

    return {
      min,
      max,
      texto: min && max ? `~${formatNum(min)} – ${formatNum(max)} pessoas` : `~${formatNum(min || max)} pessoas`,
    };
  } catch {
    return { min: 0, max: 0, texto: 'Estimativa indisponível' };
  }
}

/* ─── Criar público de interesse (saved audience) ────────────────────────────── */

/**
 * Salva a configuração de público no banco local (meta_audiences).
 * Resolve interest IDs reais via Meta API Search antes de salvar.
 */
export async function criarPublicoMeta(
  accountId: string,
  token: string,
  tenantId: string,
  publico: PublicoConfigurado,
  justificativa?: string,
): Promise<PublicoCriado> {
  const supabase = createServerSupabaseClient();

  // Resolver interest IDs reais em paralelo
  const interestResults = await Promise.all(
    publico.targeting.interests.map(i => buscarInterestId(i.name, token)),
  );

  const interestIds = interestResults
    .map((found, idx) => {
      if (found) return { id: found.id, name: found.name };
      console.warn('[meta-audiences] Interesse sem ID ignorado:', publico.targeting.interests[idx].name);
      return null;
    })
    .filter((x): x is { id: string; name: string } => x !== null);

  // Resolver flexible_spec interests também
  let resolvedFlexSpec = publico.targeting.flexible_spec;
  if (resolvedFlexSpec?.length) {
    resolvedFlexSpec = await Promise.all(
      resolvedFlexSpec.map(async (spec) => ({
        interests: (await Promise.all(
          spec.interests.map(i => buscarInterestId(i.name, token))
        )).map((found, idx) => {
            if (found) return { id: found.id, name: found.name };
            console.warn('[meta-audiences] Interesse flexible_spec sem ID ignorado:', spec.interests[idx].name);
            return null;
          }).filter((x): x is { id: string; name: string } => x !== null),
      })),
    );
  }

  const targeting = {
    ...publico.targeting,
    interests: interestIds,
    flexible_spec: resolvedFlexSpec,
  };

  // Estimar alcance
  const alcance = await estimarAlcance(accountId, token, targeting);

  // Salvar no banco local
  const { data: salvo, error } = await supabase
    .from('meta_audiences')
    .insert({
      tenant_id: tenantId,
      nome: publico.nome_meta,
      descricao: publico.descricao,
      targeting,
      estimativa_alcance_min: alcance.min || null,
      estimativa_alcance_max: alcance.max || null,
      criado_por_ia: true,
      jose_justificativa: justificativa || null,
      claudio_copy: publico.copy_sugerido,
      tipo: 'interesse',
      status: 'pronto',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Supabase: ${error.message}`);

  return {
    id: salvo!.id,
    nome: publico.nome_meta,
    tipo: 'interesse',
    tamanho_estimado: alcance.texto,
    estimativa_min: alcance.min,
    estimativa_max: alcance.max,
    copy_sugerido: publico.copy_sugerido,
    estrategia: publico.estrategia_uso,
    status: 'criado',
  };
}

/* ─── Criar público de remarketing (engajamento com a página) ────────────────── */

/**
 * Cria um Custom Audience de engajamento com a página no Meta.
 * Requer permissão ads_management + page_id.
 */
export async function criarPublicoRemarketing(
  accountId: string,
  token: string,
  tenantId: string,
  pageId: string,
  dias: number = 30,
): Promise<PublicoCriado> {
  const supabase = createServerSupabaseClient();
  const nome = `CJ — Remarketing Engajamento ${dias}d`;

  const rule = {
    inclusions: {
      operator: 'or',
      rules: [{
        event_sources: [{ id: pageId, type: 'page' }],
        retention_seconds: dias * 86400,
        filter: {
          operator: 'and',
          filters: [{ field: 'event', operator: 'eq', value: 'page_engaged' }],
        },
      }],
    },
  };

  // Meta API: /customaudiences exige application/x-www-form-urlencoded
  // com o campo rule como string JSON (não objeto aninhado)
  const formParams = new URLSearchParams();
  formParams.set('name', nome);
  formParams.set('description', `Pessoas que interagiram com @cjrasteirinhas nos últimos ${dias} dias`);
  formParams.set('subtype', 'ENGAGEMENT');
  formParams.set('rule', JSON.stringify(rule));
  formParams.set('access_token', token);

  const res = await fetch(`${META_BASE}/act_${accountId}/customaudiences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formParams.toString(),
    signal: AbortSignal.timeout(15000),
  });

  const resData = await res.json() as { id?: string; error?: { message?: string } };

  const metaAudienceId = resData.id || null;
  const errorMsg = resData.error?.message;

  // Salvar no banco local mesmo que o Meta retorne erro
  const { data: salvo } = await supabase
    .from('meta_audiences')
    .insert({
      tenant_id: tenantId,
      nome,
      descricao: `Pessoas que interagiram com @cjrasteirinhas nos últimos ${dias} dias`,
      meta_audience_id: metaAudienceId,
      targeting: { custom_audiences: metaAudienceId ? [{ id: metaAudienceId }] : [] },
      criado_por_ia: true,
      tipo: 'remarketing',
      status: metaAudienceId ? 'pronto' : 'rascunho',
    })
    .select('id')
    .single();

  if (errorMsg && !metaAudienceId) {
    console.warn('[meta-audiences] Remarketing parcialmente falhou:', errorMsg);
  }

  return {
    id: salvo?.id || crypto.randomUUID(),
    nome,
    tipo: 'remarketing',
    tamanho_estimado: 'Calculando...',
    meta_audience_id: metaAudienceId || undefined,
    estrategia: 'Público quente — maior chance de conversão. Use com oferta direta.',
    copy_sugerido: {
      headline: 'Você já nos conhece!',
      texto: 'Que tal começar a revender rasteirinhas de qualidade? Parceria sem estoque!',
      cta: 'Saiba mais',
    },
    status: metaAudienceId ? 'criado' : 'falhou',
    erro: errorMsg,
  };
}

/* ─── Listar públicos locais ─────────────────────────────────────────────────── */

export async function listarPublicosIA(tenantId: string): Promise<Array<{
  id: string;
  nome: string;
  descricao?: string;
  tipo: string;
  status: string;
  estimativa_alcance_min?: number;
  estimativa_alcance_max?: number;
  criado_por_ia: boolean;
  jose_justificativa?: string;
  claudio_copy?: CopyPublico;
  created_at: string;
}>> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('meta_audiences')
    .select('id, nome, descricao, tipo, status, estimativa_alcance_min, estimativa_alcance_max, criado_por_ia, jose_justificativa, claudio_copy, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  return data || [];
}
