/**
 * GET  /api/jarvis/config — verifica se a key Anthropic está configurada
 * POST /api/jarvis/config — salva a key Anthropic no banco
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('ai_provider_config')
    .select('anthropic_api_key')
    .eq('tenant_id', tenantId)
    .single();

  return NextResponse.json({ configurado: Boolean(data?.anthropic_api_key) });
}

export async function POST(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const { anthropic_api_key } = await req.json() as { anthropic_api_key: string };

  if (!anthropic_api_key?.trim()) {
    return NextResponse.json({ error: 'Key inválida' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from('ai_provider_config')
    .update({ anthropic_api_key })
    .eq('tenant_id', tenantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
