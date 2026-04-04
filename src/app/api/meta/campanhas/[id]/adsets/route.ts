/**
 * GET /api/meta/campanhas/[id]/adsets
 * Retorna os conjuntos de anúncios de uma campanha via Meta Marketing API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { resolverTokenMeta } from '@/lib/services/meta-token.service';
import { META_BASE } from '@/lib/meta-config';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const config = await resolverTokenMeta(tenantId);
    const url = new URL(`${META_BASE}/${id}/adsets`);
    url.searchParams.set('fields', 'id,name,status,effective_status,daily_budget,optimization_goal,targeting');
    url.searchParams.set('access_token', config.token);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
    const data = await res.json() as { data?: unknown[]; error?: { message: string } };

    if (data.error) {
      return NextResponse.json({ error: data.error.message }, { status: 400 });
    }

    return NextResponse.json(data.data ?? []);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
