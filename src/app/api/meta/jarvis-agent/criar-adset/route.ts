/**
 * POST /api/meta/jarvis-agent/criar-adset
 * Cria APENAS 1 adset — 1 chamada Meta API, ~2-3s.
 * Body: {
 *   campaign_id, tipo, nome_base, orcamento_centavos,
 *   targeting_base, meta_audience_id, objetivo
 * }
 * Returns: { adset_id: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { META_BASE } from '@/lib/meta-config';
import { escolherPublicos } from '@/lib/services/jarvis-audience-selector';

// actId vem de ai_provider_config em tempo de execução

async function metaPost(token: string, path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${META_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: token }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    let errorData: unknown;
    try { errorData = JSON.parse(errorText); } catch { errorData = errorText; }
    throw new Error(JSON.stringify(errorData));
  }
  const json = await res.json() as Record<string, unknown>;
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json;
}

export async function POST(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  let body: {
    campaign_id:        string;
    tipo:               string;
    nome_base:          string;
    orcamento_centavos: number;
    targeting_base:     Record<string, unknown>;
    meta_audience_id:   string | null;
    objetivo?:          string;
    publico_nome?:      string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_ad_account_id')
      .eq('tenant_id', tenantId)
      .single();
    if (!config?.meta_access_token) {
      return NextResponse.json({ error: 'Token Meta não configurado em ai_provider_config' }, { status: 400 });
    }
    const token = config.meta_access_token;
    const actId = config.meta_ad_account_id ?? 'act_1244920119465862';

    // ── Selecionar públicos autonomamente ─────────────────────────────────
    const audienceSel = await escolherPublicos(supabase, tenantId, token, actId, body.tipo);
    console.log('[criar-adset] Jarvis escolheu públicos:', audienceSel);

    // ── Montar targeting ──────────────────────────────────────────────────
    const t: Record<string, unknown> = { ...(body.targeting_base ?? {}) };

    // Prioridade: seleção autônoma > meta_audience_id do body
    const audienceIds = audienceSel.ids.length > 0
      ? audienceSel.ids
      : body.meta_audience_id ? [body.meta_audience_id] : [];

    if (audienceIds.length > 0) {
      t.custom_audiences = audienceIds.map(id => ({ id }));
    }

    // Limpar flexible_spec com arrays vazios
    if (Array.isArray(t.flexible_spec)) {
      t.flexible_spec = (t.flexible_spec as Array<Record<string, unknown>>)
        .map(spec => Object.fromEntries(Object.entries(spec).filter(([, v]) => !Array.isArray(v) || v.length > 0)))
        .filter(spec => Object.keys(spec).length > 0);
      if ((t.flexible_spec as unknown[]).length === 0) delete t.flexible_spec;
    }
    if (Array.isArray(t.custom_audiences) && (t.custom_audiences as unknown[]).length === 0) {
      delete t.custom_audiences;
    }

    // Campos obrigatórios
    t.geo_locations        = (t.geo_locations as unknown) ?? { countries: ['BR'] };
    t.age_min              = (t.age_min as unknown) ?? 25;
    t.age_max              = (t.age_max as unknown) ?? 55;
    t.genders              = (t.genders as unknown) ?? [2];
    t.targeting_automation = { advantage_audience: 0 };
    t.publisher_platforms  = ['facebook', 'instagram'];
    t.facebook_positions   = ['feed'];
    t.instagram_positions  = ['stream', 'story', 'reels'];

    // ── Criar adset ───────────────────────────────────────────────────────
    const adset = await metaPost(token, `${actId}/adsets`, {
      name:              `${body.nome_base} — Conjunto`,
      campaign_id:       body.campaign_id,
      daily_budget:      body.orcamento_centavos,
      billing_event:     'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      bid_strategy:      'LOWEST_COST_WITHOUT_CAP',
      status:            'PAUSED',
      targeting:         t,
    });

    // ── Salvar rascunho ───────────────────────────────────────────────────
    try {
      await supabase.from('meta_campaign_drafts').insert({
        tenant_id:        tenantId,
        nome:             body.nome_base,
        objetivo:         body.objetivo ?? 'OUTCOME_TRAFFIC',
        tipo:             body.tipo,
        status:           'publicado',
        meta_campaign_id: body.campaign_id,
        meta_adset_id:    adset.id as string,
        meta_ad_id:       null,
        jarvis_log:       `Público: ${body.publico_nome ?? 'não identificado'} | Adset: ${adset.id} | ${audienceSel.justificativa}`,
        created_at:       new Date().toISOString(),
      });
    } catch (insertErr: any) {
      console.error('[criar-adset] Erro ao salvar draft:', JSON.stringify(insertErr));
    }

    return NextResponse.json({ adset_id: adset.id });
  } catch (err) {
    console.error('[criar-adset]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
