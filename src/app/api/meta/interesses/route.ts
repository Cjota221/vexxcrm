/**
 * GET /api/meta/interesses?q=...
 * Busca interesses no Meta para targeting de adsets.
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

  const q = req.nextUrl.searchParams.get('q');
  if (!q || q.length < 2) {
    return NextResponse.json({ error: 'Parâmetro q obrigatório (mín. 2 chars)' }, { status: 400 });
  }

  try {
    const config = await resolverTokenMeta(tenantId);
    const res = await fetch(
      `${META_BASE}/search?type=adinterest&q=${encodeURIComponent(q)}&locale=pt_BR&limit=5&access_token=${config.token}`,
      { signal: AbortSignal.timeout(8000) },
    );
    const data = await res.json() as {
      data?: Array<{ id: string; name: string; audience_size_lower_bound?: number }>;
      error?: { message: string };
    };

    if (data.error) return NextResponse.json({ error: data.error.message }, { status: 400 });
    return NextResponse.json(data.data ?? []);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
