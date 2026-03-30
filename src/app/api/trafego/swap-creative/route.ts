import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

import { META_BASE } from '@/lib/meta-config';

/**
 * POST /api/trafego/swap-creative
 * Swap ad creative (Meta requires creating a new adcreative and linking it)
 * Body: {
 *   ad_id: string,
 *   page_id?: string,
 *   titulo: string,
 *   texto: string,
 *   cta: string,
 *   url_destino: string,
 *   image_url?: string,
 *   image_hash?: string, // from media library
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as {
      ad_id: string;
      page_id?: string;
      titulo: string;
      texto: string;
      cta: string;
      url_destino: string;
      image_url?: string;
      image_hash?: string;
    };

    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_ad_account_id, meta_page_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token || !config?.meta_ad_account_id) {
      return NextResponse.json({ error: 'Meta não configurado' }, { status: 400 });
    }

    const token = config.meta_access_token;
    const accountId = config.meta_ad_account_id.startsWith('act_')
      ? config.meta_ad_account_id : `act_${config.meta_ad_account_id}`;
    const pageId = body.page_id || config.meta_page_id;

    const linkData: Record<string, unknown> = {
      message: body.texto,
      link: body.url_destino,
      name: body.titulo,
      call_to_action: { type: body.cta, value: { link: body.url_destino } },
    };
    if (body.image_url) linkData.picture = body.image_url;
    if (body.image_hash) linkData.image_hash = body.image_hash;

    // Meta Graph API mutations require form-encoded body with complex fields as JSON strings
    const creativeParams = new URLSearchParams();
    creativeParams.set('access_token', token);
    creativeParams.set('name', `Criativo trocado — ${new Date().toISOString()}`);
    creativeParams.set('object_story_spec', JSON.stringify({ page_id: pageId, link_data: linkData }));

    // Create new adcreative
    const creativeRes = await fetch(`${META_BASE}/${accountId}/adcreatives`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: creativeParams.toString(),
    });
    const creativeData = await creativeRes.json() as { id?: string; error?: { message: string; error_user_msg?: string } };
    if (!creativeRes.ok) return NextResponse.json({ error: creativeData.error?.error_user_msg || creativeData.error?.message }, { status: 502 });

    // Link new creative to ad
    const adParams = new URLSearchParams();
    adParams.set('access_token', token);
    adParams.set('creative', JSON.stringify({ creative_id: creativeData.id }));

    const adRes = await fetch(`${META_BASE}/${body.ad_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: adParams.toString(),
    });
    const adData = await adRes.json() as { success?: boolean; error?: { message: string; error_user_msg?: string } };
    if (!adRes.ok) return NextResponse.json({ error: adData.error?.error_user_msg || adData.error?.message }, { status: 502 });

    return NextResponse.json({ ok: true, creative_id: creativeData.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
