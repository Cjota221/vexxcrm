/**
 * GET /api/meta/diagnostico
 * TEMP: sem auth para diagnóstico rápido de catálogos/campanhas/pixels Meta.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { META_BASE } from '@/lib/meta-config';

export async function GET() {
  const supabase = createServerSupabaseClient();

  const { data: config } = await supabase
    .from('ai_provider_config')
    .select('meta_access_token, meta_ad_account_id')
    .eq('tenant_id', '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd')
    .single();

  const token = config?.meta_access_token;
  const actId = 'act_1244920119465862';
  const businessId = '110009834520002';

  const [catalogos, campanhas, pixels] = await Promise.all([
    fetch(`${META_BASE}/${businessId}/owned_product_catalogs?fields=id,name,product_count&access_token=${token}`)
      .then(r => r.json()),
    fetch(`${META_BASE}/${actId}/campaigns?fields=id,name,objective,status&limit=10&access_token=${token}`)
      .then(r => r.json()),
    fetch(`${META_BASE}/${actId}/adspixels?fields=id,name&access_token=${token}`)
      .then(r => r.json()),
  ]);

  return NextResponse.json({ catalogos, campanhas, pixels });
}
