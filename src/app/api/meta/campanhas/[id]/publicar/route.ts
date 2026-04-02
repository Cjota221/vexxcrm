/**
 * POST /api/meta/campanhas/[id]/publicar
 * Publica o rascunho de campanha no Meta Marketing API.
 * Cria campanha + adset + ad creative + ad (todos PAUSED).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { publicarRascunho } from '@/lib/services/meta-adset-creator.service';

export async function POST(
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

  const body = await req.json() as { pageId: string; whatsappNumber?: string };
  if (!body.pageId) {
    return NextResponse.json({ error: 'pageId é obrigatório' }, { status: 400 });
  }

  try {
    const resultado = await publicarRascunho(tenantId, id, body.pageId, body.whatsappNumber);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
