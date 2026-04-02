/**
 * GET /api/meta/upload/config
 * Retorna token + account_id para o browser fazer upload direto ao Meta.
 * Usado por vídeos grandes que excedem o limite de 6MB do Netlify.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { resolverTokenMeta } from '@/lib/services/meta-token.service';

export async function GET(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const config = await resolverTokenMeta(tenantId);
    if (!config.account_id) {
      return NextResponse.json({ error: 'Ad Account ID não configurado' }, { status: 400 });
    }
    const actId = config.account_id.startsWith('act_')
      ? config.account_id
      : `act_${config.account_id}`;

    return NextResponse.json({ token: config.token, adAccountId: actId });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
