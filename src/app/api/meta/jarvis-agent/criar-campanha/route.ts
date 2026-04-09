/**
 * POST /api/meta/jarvis-agent/criar-campanha
 * Cria APENAS a campanha — 1 chamada Meta API, ~2-3s.
 * Body: { objetivo: string; nome_base: string }
 * Returns: { campaign_id: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { META_BASE } from '@/lib/meta-config';

const META_ACCOUNT = 'act_1244920119465862';

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

  let body: { objetivo?: string; nome_base?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data: tenant } = await supabase
      .from('tenants').select('meta_access_token').eq('id', tenantId).single();
    if (!tenant?.meta_access_token) {
      return NextResponse.json({ error: 'Token Meta não configurado' }, { status: 400 });
    }
    const token = tenant.meta_access_token;

    const OBJETIVO_MAP: Record<string, string> = {
      OUTCOME_SALES: 'OUTCOME_SALES',
      OUTCOME_LEADS: 'OUTCOME_LEADS',
      MESSAGES:      'OUTCOME_TRAFFIC',
    };
    const objetivoMeta = OBJETIVO_MAP[body.objetivo ?? ''] ?? 'OUTCOME_TRAFFIC';

    const camp = await metaPost(token, `${META_ACCOUNT}/campaigns`, {
      name:    body.nome_base ?? `[Jarvis] ${new Date().toLocaleDateString('pt-BR')}`,
      objective: objetivoMeta,
      status:  'PAUSED',
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
    });

    return NextResponse.json({ campaign_id: camp.id });
  } catch (err) {
    console.error('[criar-campanha]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
