/**
 * POST   /api/meta/token — salvar System User Token
 * GET    /api/meta/token — verificar status do token atual
 * DELETE /api/meta/token — remover token (volta para page token)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import {
  salvarSystemUserToken,
  verificarTokenMeta,
} from '@/lib/services/meta-token.service';

export async function GET(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const result = await verificarTokenMeta(tenantId);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const body = await req.json() as {
    systemUserToken: string;
    businessId?: string;
    appId?: string;
    pageId?: string;
    pixelId?: string;
  };

  if (!body.systemUserToken) {
    return NextResponse.json({ error: 'systemUserToken é obrigatório' }, { status: 400 });
  }

  const result = await salvarSystemUserToken(tenantId, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  await supabase
    .from('ai_provider_config')
    .update({
      meta_system_user_token: null,
      meta_token_type: 'page',
      meta_token_valid: false,
      meta_token_error: 'Token removido manualmente',
    })
    .eq('tenant_id', tenantId);

  return NextResponse.json({ ok: true });
}
