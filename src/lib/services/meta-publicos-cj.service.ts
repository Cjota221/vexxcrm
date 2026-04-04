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

const PAGE_ID  = '110009834520002';
const PIXEL_ID = '518376893062766';

/* ─── Interesses de alta performance ────────────────────────────────────── */

const INTERESSES_ATACADO = [
  'Atacado de moda',
  'Revenda de roupas',
  'Empreendedorismo feminino',
  'Renda extra',
  'Sacoleira',
  'Moda feminina',
  'Calçados femininos',
  'Sandálias',
];

/* ─── Targeting por tipo ─────────────────────────────────────────────────── */

export function targetingFrio(interestIds: Array<{ id: string; name: string }>) {
  return {
    age_min: 25,
    age_max: 55,
    genders: [2],
    geo_locations: { countries: ['BR'] },
    flexible_spec: interestIds.length > 0 ? [{ interests: interestIds }] : undefined,
    publisher_platforms: ['facebook', 'instagram'],
    instagram_positions: ['stream', 'reels', 'story'],
    facebook_positions: ['feed'],
    device_platforms: ['mobile'],
  };
}

export function targetingWhatsApp(interestIds: Array<{ id: string; name: string }>) {
  return {
    age_min: 25,
    age_max: 50,
    genders: [2],
    geo_locations: { countries: ['BR'] },
    flexible_spec: interestIds.length > 0 ? [{ interests: interestIds.slice(0, 4) }] : undefined,
    publisher_platforms: ['facebook', 'instagram'],
    instagram_positions: ['stream', 'story'],
    facebook_positions: ['feed', 'marketplace'],
    device_platforms: ['mobile'],
  };
}

export function targetingQuente(customAudienceId: string | null) {
  const base: Record<string, unknown> = {
    age_min: 22,
    age_max: 55,
    genders: [2],
    geo_locations: { countries: ['BR'] },
    publisher_platforms: ['facebook', 'instagram'],
    instagram_positions: ['stream', 'story'],
    facebook_positions: ['feed'],
    device_platforms: ['mobile'],
  };
  if (customAudienceId) {
    base.custom_audiences = [{ id: customAudienceId }];
  }
  return base;
}

/* ─── Buscar interesses reais no Meta ────────────────────────────────────── */

export async function buscarInteressesAtacado(
  token: string,
): Promise<Array<{ id: string; name: string }>> {
  const resultados = await Promise.all(
    INTERESSES_ATACADO.map(nome => buscarInterestId(nome, token))
  );
  return resultados
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map(r => ({ id: r.id, name: r.name }));
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
  formParams.set('name', `Cjota Rasteirinhas — Engajamento ${dias}d`);
  formParams.set('description', `Pessoas que interagiram com @cjotarasteirinhas nos últimos ${dias} dias`);
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
        nome: `Cjota Rasteirinhas — Engajamento ${dias}d`,
        descricao: `Quem interagiu com @cjotarasteirinhas nos últimos ${dias} dias`,
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

/* ─── Lookalike a partir dos clientes do VEXX ───────────────────────────── */

export async function criarLookalikeClientes(
  accountId: string,
  token: string,
  tenantId: string,
): Promise<string | null> {
  const supabase = createServerSupabaseClient();

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
  formBase.set('name', 'Clientes VEXX — Base Lookalike CJ');
  formBase.set('description', `${clientes.length} clientes reais da CJ Rasteirinhas`);
  formBase.set('subtype', 'CUSTOM');
  formBase.set('customer_file_source', 'USER_PROVIDED_ONLY');
  formBase.set('access_token', token);

  try {
    const baseRes = await fetch(
      `${META_BASE}/act_${accountId.replace('act_', '')}/customaudiences`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBase.toString(),
        signal: AbortSignal.timeout(15_000),
      }
    );
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
    lookalikeForm.set('name', 'Lookalike Clientes CJ — 1% BR');
    lookalikeForm.set('origin_audience_id', audienceId);
    lookalikeForm.set('lookalike_spec', JSON.stringify({
      type: 'similarity',
      starting_ratio: 0,
      ratio: 0.01,
      country: 'BR',
    }));
    lookalikeForm.set('access_token', token);

    const lookalikeRes = await fetch(
      `${META_BASE}/act_${accountId.replace('act_', '')}/customaudiences`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: lookalikeForm.toString(),
        signal: AbortSignal.timeout(15_000),
      }
    );
    const lookalikeData = await lookalikeRes.json() as { id?: string };

    if (lookalikeData.id) {
      await supabase.from('meta_audiences').insert({
        tenant_id: tenantId,
        nome: 'Lookalike Clientes CJ — 1% BR',
        descricao: `Pessoas similares aos ${clientes.length} clientes reais da CJ`,
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
