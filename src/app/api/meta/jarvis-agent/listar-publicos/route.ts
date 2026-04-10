/**
 * GET /api/meta/jarvis-agent/listar-publicos
 * Endpoint temporário de diagnóstico — lista custom audiences da conta.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { META_BASE } from '@/lib/meta-config';

const TENANT_ID  = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';
const ACT_ID     = 'act_1244920119465862';

export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: config } = await supabase
    .from('ai_provider_config')
    .select('meta_access_token')
    .eq('tenant_id', TENANT_ID)
    .single();

  if (!config?.meta_access_token) {
    return NextResponse.json({ error: 'Token Meta não encontrado em ai_provider_config' }, { status: 400 });
  }

  const token = config.meta_access_token as string;

  const res = await fetch(
    `${META_BASE}/${ACT_ID}/customaudiences?fields=id,name,subtype,approximate_count_lower_bound,description&limit=50&access_token=${token}`,
  );
  const json = await res.json();

  return NextResponse.json(json);
}
