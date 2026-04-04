/**
 * GET /api/meta/diagnostico
 * Retorna estrutura de catálogos, campanhas e pixels da conta Meta.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { resolverTokenMeta } from '@/lib/services/meta-token.service';
import { META_BASE } from '@/lib/meta-config';

export async function GET(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const config = await resolverTokenMeta(tenantId);
  const token = config.token;
  const actId = config.account_id?.startsWith('act_')
    ? config.account_id
    : `act_${config.account_id}`;
  const businessId = '110009834520002';

  const [catalogos, campanhas, pixels] = await Promise.all([
    fetch(`${META_BASE}/${businessId}/owned_product_catalogs?fields=id,name,product_count&access_token=${token}`)
      .then(r => r.json()),
    fetch(`${META_BASE}/${actId}/campaigns?fields=id,name,objective,status&limit=10&access_token=${token}`)
      .then(r => r.json()),
    fetch(`${META_BASE}/${actId}/adspixels?fields=id,name,last_fired_time&access_token=${token}`)
      .then(r => r.json()),
  ]);

  return NextResponse.json({ catalogos, campanhas, pixels });
}
