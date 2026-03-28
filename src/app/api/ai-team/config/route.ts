import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * GET /api/ai-team/config
 * Retorna a configuração do Time de IAs do tenant.
 * API keys são mascaradas (* * * * *) — nunca expostas ao frontend.
 */
export async function GET(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    const { data } = await supabase
      .from('ai_provider_config')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!data) {
      return NextResponse.json({ config: null });
    }

    // Mascarar API keys antes de enviar ao frontend
    const masked = {
      ...data,
      auto_reply_api_key:   data.auto_reply_api_key   ? '••••••••' : null,
      analytics_api_key:    data.analytics_api_key    ? '••••••••' : null,
      strategy_api_key:     data.strategy_api_key     ? '••••••••' : null,
      research_api_key:     data.research_api_key     ? '••••••••' : null,
      visual_api_key:       data.visual_api_key        ? '••••••••' : null,
      meta_access_token:    data.meta_access_token     ? '••••••••' : null,
    };

    return NextResponse.json({ config: masked });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * PUT /api/ai-team/config
 * Salva ou atualiza a configuração do Time de IAs.
 * Campos com valor '••••••••' são ignorados (não sobrescreve keys existentes).
 */
export async function PUT(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const body = await request.json() as Record<string, unknown>;
    const supabase = createServerSupabaseClient();

    // Remover campos mascarados para não sobrescrever com '••••••••'
    const MASKED = '••••••••';
    const fields: Record<string, unknown> = { tenant_id: profile.tenant_id, updated_at: new Date().toISOString() };

    const keyFields = [
      'auto_reply_api_key', 'analytics_api_key', 'strategy_api_key',
      'research_api_key', 'visual_api_key', 'meta_access_token',
    ];
    const otherFields = [
      'auto_reply_provider', 'auto_reply_model',
      'analytics_provider', 'analytics_model',
      'strategy_provider', 'strategy_model',
      'research_provider', 'research_model',
      'visual_provider', 'visual_model',
      'meta_ad_account_id', 'meta_app_id',
      'require_approval', 'max_budget_increase_pct',
      'pause_roas_threshold', 'scale_roas_threshold',
      'analysis_enabled', 'sentinel_enabled', 'research_enabled', 'visual_enabled',
      'brand_produto', 'brand_publico', 'brand_ticket', 'brand_objetivo',
    ];

    for (const f of keyFields) {
      if (f in body && body[f] !== MASKED && body[f] !== '' && body[f] !== null) {
        fields[f] = body[f];
      }
    }
    for (const f of otherFields) {
      if (f in body) {
        // Normalizar meta_ad_account_id: Meta exige prefixo "act_"
        if (f === 'meta_ad_account_id' && body[f] && typeof body[f] === 'string') {
          const raw = (body[f] as string).trim();
          fields[f] = raw.startsWith('act_') ? raw : `act_${raw}`;
        } else {
          fields[f] = body[f];
        }
      }
    }

    const { error } = await supabase
      .from('ai_provider_config')
      .upsert(fields, { onConflict: 'tenant_id' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
