import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

import { META_BASE } from '@/lib/meta-config';

/**
 * GET /api/trafego/audience?campaign_id=XXX
 * Lists adsets for a campaign including current targeting
 */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const campaignId = req.nextUrl.searchParams.get('campaign_id');
    if (!campaignId) return NextResponse.json({ error: 'campaign_id obrigatório' }, { status: 400 });

    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token) return NextResponse.json({ error: 'Meta não configurado' }, { status: 400 });

    const fields = 'id,name,status,targeting,daily_budget,optimization_goal,start_time,end_time';
    const res = await fetch(
      `${META_BASE}/${campaignId}/adsets?fields=${encodeURIComponent(fields)}&access_token=${config.meta_access_token}`
    );
    const data = await res.json() as { data: unknown[]; error?: { message: string } };
    if (!res.ok) return NextResponse.json({ error: data.error?.message }, { status: 502 });

    return NextResponse.json({ adsets: data.data || [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * PATCH /api/trafego/audience
 * Update adset targeting
 * Body: { adset_id, targeting: { paises, idade_min, idade_max, genero?, interesses? } }
 */
export async function PATCH(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as {
      adset_id: string;
      targeting: {
        paises?: string[];
        idade_min?: number;
        idade_max?: number;
        genero?: number;
        interesses?: Array<{ id: string; name: string }>;
      };
      orcamento_diario?: number; // in reais
    };

    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token) return NextResponse.json({ error: 'Meta não configurado' }, { status: 400 });

    // Meta Graph API mutations require form-encoded body, with complex fields JSON-stringified
    const params = new URLSearchParams();
    params.set('access_token', config.meta_access_token);

    if (body.targeting) {
      const t = body.targeting;
      const targeting: Record<string, unknown> = {};
      if (t.paises) targeting.geo_locations = { countries: t.paises };
      if (t.idade_min) targeting.age_min = t.idade_min;
      if (t.idade_max) targeting.age_max = t.idade_max;
      if (t.genero !== undefined && t.genero !== 0) targeting.genders = [t.genero];
      if (t.interesses && t.interesses.length > 0) targeting.flexible_spec = [{ interests: t.interesses }];
      params.set('targeting', JSON.stringify(targeting));
    }

    if (body.orcamento_diario) {
      params.set('daily_budget', String(Math.round(body.orcamento_diario * 100)));
    }

    const res = await fetch(`${META_BASE}/${body.adset_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await res.json() as { success?: boolean; error?: { message: string; error_user_msg?: string } };
    if (!res.ok) return NextResponse.json({ error: data.error?.error_user_msg || data.error?.message }, { status: 502 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
