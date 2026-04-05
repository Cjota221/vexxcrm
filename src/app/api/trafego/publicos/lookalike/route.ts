import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { META_BASE } from '@/lib/meta-config';

/**
 * POST /api/trafego/publicos/lookalike
 * Cria um Lookalike Audience no Meta a partir de qualquer Custom Audience.
 *
 * Body:
 *   origin_audience_id: string  — ID do Custom Audience semente
 *   origin_audience_name: string — nome da semente (para nomear o lookalike)
 *   ratio: number               — percentual: 0.01 a 0.10 (1% a 10%)
 *   country: string             — padrão "BR"
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as {
      origin_audience_id: string;
      origin_audience_name?: string;
      ratio?: number;
      country?: string;
    };

    if (!body.origin_audience_id) {
      return NextResponse.json({ error: 'origin_audience_id obrigatório' }, { status: 400 });
    }

    const ratio   = Math.max(0.01, Math.min(0.10, body.ratio ?? 0.01));
    const country = body.country || 'BR';
    const pct     = Math.round(ratio * 100);
    const nome    = `CJ | LOOKALIKE ${pct}% | ${body.origin_audience_name || body.origin_audience_id} BR`;

    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_ad_account_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token || !config?.meta_ad_account_id) {
      return NextResponse.json({ error: 'Meta não configurado' }, { status: 400 });
    }

    const token     = config.meta_access_token;
    const accountId = config.meta_ad_account_id.startsWith('act_')
      ? config.meta_ad_account_id
      : `act_${config.meta_ad_account_id}`;

    const params = new URLSearchParams();
    params.set('name', nome);
    params.set('subtype', 'LOOKALIKE');
    params.set('origin_audience_id', body.origin_audience_id);
    params.set('lookalike_spec', JSON.stringify({
      ratio,
      country,
      type: 'similarity',
    }));
    params.set('access_token', token);

    const res = await fetch(`${META_BASE}/${accountId}/customaudiences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json() as { id?: string; error?: { message?: string } };

    if (!data.id) {
      return NextResponse.json({
        error: data.error?.message || 'Meta não retornou ID do lookalike',
      }, { status: 502 });
    }

    // Salvar no banco local
    await supabase.from('meta_audiences').insert({
      tenant_id:         profile.tenant_id,
      nome,
      descricao:         `Lookalike ${pct}% baseado em: ${body.origin_audience_name || body.origin_audience_id}`,
      meta_audience_id:  data.id,
      targeting:         { custom_audiences: [{ id: data.id }] },
      tipo:              'lookalike',
      status:            'pronto',
      criado_por_ia:     false,
    });

    return NextResponse.json({
      ok:                true,
      meta_audience_id:  data.id,
      nome,
      ratio,
      country,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
