import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { sincronizarTudoDoMeta } from '@/lib/services/meta-sync.service';
import { resolverTokenMeta } from '@/lib/services/meta-token.service';

// Aumenta o timeout da função no Vercel para 60s (necessário para sync com muitos dados)
export const maxDuration = 60;

/**
 * POST /api/trafego/sync
 * Sincroniza campanhas, anúncios e criativos do Meta Ads para o cache local.
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const supabase = createServerSupabaseClient();

    const body = await req.json().catch(() => ({})) as { account_id?: string };

    // Resolver token via hierarquia: system_user → page → env
    let tokenConfig;
    try {
      tokenConfig = await resolverTokenMeta(profile.tenant_id);
    } catch {
      return NextResponse.json({ error: 'Meta Ads não configurado' }, { status: 400 });
    }

    // account_id do body tem prioridade (multi-conta)
    const accountId = body.account_id || tokenConfig.account_id;
    if (!accountId) {
      return NextResponse.json({ error: 'Ad Account ID não configurado' }, { status: 400 });
    }

    const result = await sincronizarTudoDoMeta(
      profile.tenant_id,
      accountId,
      tokenConfig.token,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * GET /api/trafego/sync
 * Retorna criativos e anúncios do cache local.
 */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const tipo = req.nextUrl.searchParams.get('tipo'); // 'criativos' | 'ads'
    const campaignId = req.nextUrl.searchParams.get('campaign_id');

    const supabase = createServerSupabaseClient();

    if (tipo === 'criativos') {
      const { data } = await supabase
        .from('meta_creatives_cache')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .order('sincronizado_em', { ascending: false })
        .limit(100);
      return NextResponse.json({ data: data || [] });
    }

    if (tipo === 'ads') {
      let query = supabase
        .from('meta_ads_cache')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .order('sincronizado_em', { ascending: false });
      if (campaignId) query = query.eq('campaign_id', campaignId);
      const { data } = await query.limit(100);
      return NextResponse.json({ data: data || [] });
    }

    // Retorna último timestamp de sincronização
    const { data: lastCampaign } = await supabase
      .from('meta_campaigns_cache')
      .select('sincronizado_em')
      .eq('tenant_id', profile.tenant_id)
      .order('sincronizado_em', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({ lastSync: lastCampaign?.sincronizado_em || null });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
