import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

const META_BASE = 'https://graph.facebook.com/v23.0';

/* ─── Interesses pré-configurados por segmento ─────────────────────────────── */

const INTERESSES_SEGMENTO: Record<string, string[]> = {
  revendedoras: [
    'Atacado', 'Revenda de roupas', 'Moda feminina', 'Empreendedorismo feminino',
    'Renda extra', 'Negócio próprio', 'Sacoleira', 'Moda praia',
  ],
  franqueadas: [
    'Franquia', 'Negócio próprio', 'Empreendedorismo', 'Investimento',
    'Renda passiva', 'Crescimento profissional', 'C4 Franchising',
  ],
  marca_propria: [
    'Moda feminina', 'Calçados femininos', 'Rasteirinha', 'Sandálias',
    'Moda casual', 'Estilo feminino', 'Compras online',
  ],
};

/* ─── Buscar ID real de interesse no Meta ───────────────────────────────────── */

async function buscarInteresseId(
  nome: string,
  token: string
): Promise<{ id: string; name: string } | null> {
  try {
    const res = await fetch(
      `${META_BASE}/search?type=adinterest&q=${encodeURIComponent(nome)}&locale=pt_BR&limit=1&access_token=${token}`
    );
    if (!res.ok) return null;
    const data = await res.json() as { data: Array<{ id: string; name: string }> };
    return data.data?.[0] ?? null;
  } catch {
    return null;
  }
}

/* ─── Estimar alcance ──────────────────────────────────────────────────────── */

async function estimarAlcance(
  targeting: Record<string, unknown>,
  accountId: string,
  token: string
): Promise<{ min: number; max: number } | null> {
  try {
    const params = new URLSearchParams({
      targeting_spec: JSON.stringify(targeting),
      optimization_goal: 'REACH',
      access_token: token,
    });
    const res = await fetch(
      `${META_BASE}/act_${accountId.replace('act_', '')}/reachestimate?${params.toString()}`
    );
    if (!res.ok) return null;
    const data = await res.json() as {
      data?: { users_lower_bound: number; users_upper_bound: number };
      users_lower_bound?: number;
      users_upper_bound?: number;
    };
    const lower = data.data?.users_lower_bound ?? data.users_lower_bound ?? 0;
    const upper = data.data?.users_upper_bound ?? data.users_upper_bound ?? 0;
    return lower > 0 ? { min: lower, max: upper } : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/trafego/publicos/criar
 * Cria um público de interesse manualmente ou via segmento pré-definido.
 *
 * Body:
 * {
 *   nome: string
 *   segmento?: 'revendedoras' | 'franqueadas' | 'marca_propria' | 'personalizado'
 *   idade_min?: number         (default: 25)
 *   idade_max?: number         (default: 50)
 *   genero?: 'feminino' | 'masculino' | 'todos'  (default: feminino)
 *   localizacao?: string[]     (estados ou países — default: BR)
 *   interesses?: string[]      (adicionados aos do segmento)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);

    const body = await req.json() as {
      nome?: string;
      segmento?: 'revendedoras' | 'franqueadas' | 'marca_propria' | 'personalizado';
      idade_min?: number;
      idade_max?: number;
      genero?: 'feminino' | 'masculino' | 'todos';
      localizacao?: string[];
      interesses?: string[];
    };

    if (!body.nome) {
      return NextResponse.json({ error: 'Campo "nome" obrigatório' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

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

    // Combinar interesses do segmento + interesses manuais
    const nomesInteresses = [
      ...(body.segmento && body.segmento !== 'personalizado'
        ? INTERESSES_SEGMENTO[body.segmento] ?? []
        : []),
      ...(body.interesses ?? []),
    ];

    // Buscar IDs reais no Meta (paralelamente, máx 8)
    const interessesComId = await Promise.all(
      nomesInteresses.slice(0, 8).map((nome) => buscarInteresseId(nome, token))
    );
    const interessesValidos = interessesComId.filter(Boolean) as Array<{ id: string; name: string }>;

    // Mapear gênero
    const genders =
      body.genero === 'masculino' ? [1] :
      body.genero === 'todos'     ? [] :
      [2]; // feminino (default)

    // Montar geo_locations
    const localizacao = body.localizacao ?? [];
    const geoLocations: Record<string, unknown> =
      localizacao.length === 0
        ? { countries: ['BR'] }
        : localizacao[0].length === 2
        ? { countries: localizacao } // código de país
        : {
            countries: ['BR'],
            regions: localizacao.map((r) => ({ name: r })),
          };

    // Montar targeting
    const targeting: Record<string, unknown> = {
      age_min: body.idade_min ?? 25,
      age_max: body.idade_max ?? 50,
      geo_locations: geoLocations,
    };
    if (genders.length > 0) targeting.genders = genders;
    if (interessesValidos.length > 0) targeting.interests = interessesValidos;

    // Estimar alcance
    const estimativa = await estimarAlcance(targeting, accountId, token);

    // Salvar no banco local
    const { data: publico, error: dbErr } = await supabase
      .from('meta_audiences')
      .insert({
        tenant_id: profile.tenant_id,
        nome: body.nome,
        descricao: body.segmento
          ? `Público de ${body.segmento} criado manualmente`
          : 'Público personalizado',
        targeting,
        estimativa_alcance_min: estimativa?.min ?? null,
        estimativa_alcance_max: estimativa?.max ?? null,
        criado_por_ia: false,
        tipo: 'interesse',
        status: 'pronto',
      })
      .select('id')
      .single();

    if (dbErr) {
      return NextResponse.json({ error: `Erro ao salvar público: ${dbErr.message}` }, { status: 500 });
    }

    function fmtAlcance(min?: number | null, max?: number | null): string {
      if (!min && !max) return 'não calculado';
      const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`;
      return min && max ? `${fmt(min)} – ${fmt(max)} pessoas` : min ? `acima de ${fmt(min)}` : '';
    }

    return NextResponse.json({
      ok: true,
      publico_id: publico?.id,
      nome: body.nome,
      interesses_encontrados: interessesValidos.map(i => i.name),
      interesses_nao_encontrados: nomesInteresses.slice(0, 8).filter(
        (nome) => !interessesValidos.find(i => i.name.toLowerCase().includes(nome.toLowerCase()))
      ),
      estimativa_alcance: fmtAlcance(estimativa?.min, estimativa?.max),
      estimativa_min: estimativa?.min ?? null,
      estimativa_max: estimativa?.max ?? null,
      targeting,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
