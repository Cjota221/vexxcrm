import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

import { META_BASE } from '@/lib/meta-config';

/* ─── Tradutores de targeting para linguagem simples ──────────────────────── */

function traduzirGenero(genders: number[] | undefined): string {
  if (!genders || genders.length === 0) return 'Todos os gêneros';
  if (genders.length === 1 && genders[0] === 2) return 'Apenas mulheres';
  if (genders.length === 1 && genders[0] === 1) return 'Apenas homens';
  return 'Todos os gêneros';
}

function traduzirLocalizacao(geo: Record<string, unknown> | undefined): string {
  if (!geo) return 'Brasil';
  const partes: string[] = [];

  const cities = geo.cities as Array<{ name: string }> | undefined;
  if (cities?.length) {
    partes.push(cities.map((c) => c.name).join(', '));
  }

  const regions = geo.regions as Array<{ name: string }> | undefined;
  if (regions?.length) {
    partes.push(regions.map((r) => r.name).join(', '));
  }

  const countries = geo.countries as string[] | undefined;
  if (countries?.length && !partes.length) {
    const nomes: Record<string, string> = { BR: 'Brasil', US: 'EUA', PT: 'Portugal' };
    partes.push(countries.map((c) => nomes[c] || c).join(', '));
  }

  return partes.join(', ') || 'Brasil';
}

function traduzirInteresses(
  interests: Array<{ name: string }> | undefined,
  flexSpec: Array<{ interests?: Array<{ name: string }> }> | undefined
): string[] {
  const nomes = new Set<string>();

  if (interests?.length) {
    interests.forEach((i) => nomes.add(i.name));
  }

  if (flexSpec?.length) {
    flexSpec.forEach((f) => {
      f.interests?.forEach((i) => nomes.add(i.name));
    });
  }

  return Array.from(nomes);
}

function estimarTamanhoPublico(min?: number, max?: number): string {
  if (!min && !max) return 'calculando...';
  const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`;
  if (min && max) return `${fmt(min)} – ${fmt(max)} pessoas`;
  if (min) return `acima de ${fmt(min)} pessoas`;
  return `até ${fmt(max!)} pessoas`;
}

interface TargetingRaw {
  age_min?: number;
  age_max?: number;
  genders?: number[];
  geo_locations?: Record<string, unknown>;
  interests?: Array<{ id: string; name: string }>;
  flexible_spec?: Array<{ interests?: Array<{ id: string; name: string }> }>;
  exclusions?: Record<string, unknown>;
}

interface TargetingTraduzido {
  sexo: string;
  idade: string;
  localizacao: string;
  interesses: string[];
  tamanho_estimado: string;
}

function traduzirTargeting(raw: TargetingRaw | undefined): TargetingTraduzido {
  if (!raw) {
    return {
      sexo: 'Todos os gêneros',
      idade: '18–65 anos',
      localizacao: 'Brasil',
      interesses: [],
      tamanho_estimado: 'não calculado',
    };
  }

  return {
    sexo: traduzirGenero(raw.genders),
    idade: `${raw.age_min ?? 18}–${raw.age_max ?? 65} anos`,
    localizacao: traduzirLocalizacao(raw.geo_locations),
    interesses: traduzirInteresses(raw.interests, raw.flexible_spec),
    tamanho_estimado: 'calculando...', // preenchido com reachestimate se disponível
  };
}

function n(v: string | undefined | null): number {
  return parseFloat(v || '0') || 0;
}

function traduzirStatus(status: string, roas: number): string {
  if (status === 'PAUSED') return 'Pausado';
  if (roas >= 3) return 'Ativo — funcionando bem';
  if (roas >= 1.5) return 'Ativo — atenção';
  if (roas > 0) return 'Ativo — gastando sem resultado';
  return 'Ativo';
}

/**
 * GET /api/trafego/adsets?campaign_id=XXX
 * Lista adsets de uma campanha com métricas e targeting traduzido.
 *
 * PUT /api/trafego/adsets?adset_id=XXX
 * Edita orçamento diário (limite: +30%) ou status do adset.
 */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const campaignId = req.nextUrl.searchParams.get('campaign_id');
    if (!campaignId) return NextResponse.json({ error: 'campaign_id obrigatório' }, { status: 400 });

    const supabase = createServerSupabaseClient();

    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_ad_account_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token) {
      return NextResponse.json({ error: 'Meta não configurado' }, { status: 400 });
    }

    const token = config.meta_access_token;
    const period = req.nextUrl.searchParams.get('period') || '7d';
    const datePreset =
      period === '1d' ? 'today' :
      period === '7d' ? 'last_7d' :
      period === '15d' ? 'last_14d' :
      'last_30d';

    const insightFields = 'spend,impressions,clicks,reach,actions,action_values,cpc,cpm,ctr,frequency';
    const adsetFields = [
      'id', 'name', 'status', 'effective_status', 'daily_budget', 'lifetime_budget',
      'targeting', 'optimization_goal', 'billing_event', 'campaign_id',
      `insights.date_preset(${datePreset}){${insightFields}}`,
    ].join(',');

    const res = await fetch(
      `${META_BASE}/${campaignId}/adsets` +
      `?fields=${encodeURIComponent(adsetFields)}` +
      `&limit=50&access_token=${token}`
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      const errMsg = err.error?.message || `Erro Meta API ${res.status}`;

      // Fallback para cache local
      const { data: cached } = await supabase
        .from('meta_adsets_cache')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .eq('campaign_id', campaignId)
        .order('sincronizado_em', { ascending: false });

      if (cached && cached.length > 0) {
        return NextResponse.json({
          fromCache: true,
          cacheWarning: `Meta API indisponível — exibindo último sync (${errMsg})`,
          adsets: cached.map((a) => ({
            id: a.id,
            nome: a.nome,
            status: a.status,
            orcamento_diario: a.orcamento_diario ? a.orcamento_diario / 100 : null,
            targeting_traduzido: traduzirTargeting(a.targeting as TargetingRaw),
            objetivo_otimizacao: a.objetivo_otimizacao,
            metricas: a.metricas,
          })),
        });
      }

      return NextResponse.json({ error: errMsg }, { status: 502 });
    }

    const data = await res.json() as {
      data: Array<{
        id: string;
        name: string;
        status: string;
        effective_status: string;
        daily_budget?: string;
        lifetime_budget?: string;
        targeting?: TargetingRaw;
        optimization_goal?: string;
        billing_event?: string;
        campaign_id?: string;
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

    const adsets = (data.data || []).map((adset) => {
      const insight = adset.insights?.data?.[0];
      const spend   = n(insight?.spend);
      const revenue = n(insight?.action_values?.find(a => a.action_type === 'purchase')?.value);
      const leads   = Math.round(n(insight?.actions?.find(a => a.action_type === 'lead')?.value));
      const clicks  = Math.round(n(insight?.clicks));
      const reach   = Math.round(n(insight?.reach));
      const roas    = spend > 0 ? revenue / spend : 0;
      const cpl     = leads > 0 ? spend / leads : 0;

      const orcamento = adset.daily_budget
        ? n(adset.daily_budget) / 100
        : adset.lifetime_budget
        ? n(adset.lifetime_budget) / 100
        : null;

      const targeting_traduzido = traduzirTargeting(adset.targeting);

      return {
        id: adset.id,
        nome: adset.name,
        status: adset.status,
        effective_status: adset.effective_status,
        status_legivel: traduzirStatus(adset.status, roas),
        tipo_orcamento: adset.daily_budget ? 'diario' : 'vitalicio',
        orcamento_diario: orcamento,
        objetivo_otimizacao: adset.optimization_goal,
        targeting: adset.targeting,
        targeting_traduzido,
        metricas: {
          spend,
          revenue,
          leads,
          clicks,
          reach,
          roas: Number(roas.toFixed(2)),
          cpl: Number(cpl.toFixed(2)),
          cpc: n(insight?.cpc),
          cpm: n(insight?.cpm),
          ctr: n(insight?.ctr),
          frequency: n(insight?.frequency),
        },
      };
    });

    // Salvar em cache
    if (adsets.length > 0) {
      const rows = adsets.map((a) => ({
        id: a.id,
        tenant_id: profile.tenant_id,
        campaign_id: campaignId,
        nome: a.nome,
        status: a.status,
        orcamento_diario: a.orcamento_diario ? Math.round(a.orcamento_diario * 100) : null,
        targeting: a.targeting,
        objetivo_otimizacao: a.objetivo_otimizacao,
        metricas: a.metricas,
        sincronizado_em: new Date().toISOString(),
      }));

      await supabase
        .from('meta_adsets_cache')
        .upsert(rows, { onConflict: 'id,tenant_id' })
        .throwOnError();
    }

    return NextResponse.json({ adsets });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as {
      adset_id: string;
      novo_orcamento_diario?: number;  // em reais
      novo_status?: 'ACTIVE' | 'PAUSED';
    };

    if (!body.adset_id) return NextResponse.json({ error: 'adset_id obrigatório' }, { status: 400 });

    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, max_budget_increase_pct')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token) {
      return NextResponse.json({ error: 'Meta não configurado' }, { status: 400 });
    }

    const token = config.meta_access_token;
    const maxIncrease = config.max_budget_increase_pct ?? 0.30;

    // Validação: se mudando orçamento, verificar limite de 30%
    if (body.novo_orcamento_diario !== undefined) {
      // Buscar orçamento atual no Meta
      const currentRes = await fetch(
        `${META_BASE}/${body.adset_id}?fields=daily_budget&access_token=${token}`
      );
      if (currentRes.ok) {
        const current = await currentRes.json() as { daily_budget?: string };
        const orcamentoAtual = n(current.daily_budget) / 100; // em reais
        const aumentoPct = orcamentoAtual > 0
          ? (body.novo_orcamento_diario - orcamentoAtual) / orcamentoAtual
          : 0;

        if (aumentoPct > maxIncrease) {
          const limitePermitido = orcamentoAtual * (1 + maxIncrease);
          return NextResponse.json({
            error: `Segurança: aumento máximo de ${Math.round(maxIncrease * 100)}% por vez. ` +
                   `Orçamento atual: R$${orcamentoAtual.toFixed(2)}, ` +
                   `máximo permitido: R$${limitePermitido.toFixed(2)}.`,
            limite_reais: Number(limitePermitido.toFixed(2)),
          }, { status: 422 });
        }
      }

      // Aplicar novo orçamento (Meta recebe em centavos)
      const params = new URLSearchParams({
        daily_budget: String(Math.round(body.novo_orcamento_diario * 100)),
        access_token: token,
      });

      const res = await fetch(`${META_BASE}/${body.adset_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
        return NextResponse.json({ error: err.error?.message || 'Erro ao atualizar orçamento' }, { status: 502 });
      }
    }

    // Mudar status
    if (body.novo_status) {
      const params = new URLSearchParams({
        status: body.novo_status,
        access_token: token,
      });

      const res = await fetch(`${META_BASE}/${body.adset_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
        return NextResponse.json({ error: err.error?.message || 'Erro ao mudar status' }, { status: 502 });
      }

      // Atualizar cache local
      await supabase
        .from('meta_adsets_cache')
        .update({ status: body.novo_status })
        .eq('id', body.adset_id)
        .eq('tenant_id', profile.tenant_id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
