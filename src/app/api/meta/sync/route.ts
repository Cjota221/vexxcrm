/**
 * POST /api/meta/sync
 * Sincroniza vídeos e imagens da conta Meta para meta_creatives_cache.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { resolverTokenMeta } from '@/lib/services/meta-token.service';
import { sincronizarTudoDoMeta } from '@/lib/services/meta-sync.service';

export async function POST(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const config = await resolverTokenMeta(tenantId);
  if (!config.account_id) {
    return NextResponse.json({ error: 'Ad Account não configurado' }, { status: 400 });
  }

  const result = await sincronizarTudoDoMeta(tenantId, config.account_id, config.token);
  return NextResponse.json(result);
}
