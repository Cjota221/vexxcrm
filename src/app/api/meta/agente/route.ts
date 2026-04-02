/**
 * POST /api/meta/agente
 * Executa o Agente Orquestrador de Tráfego.
 *
 * Body: { instrucao: string, page_id?: string, whatsapp_number?: string }
 * Retorna: AgenteResultado { logs, campanhasCriadas, erros, resumo }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { executarAgente } from '@/lib/services/agente-trafego.service';

export async function POST(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const body = await req.json() as {
    instrucao: string;
    page_id?: string;
    whatsapp_number?: string;
  };

  if (!body.instrucao?.trim()) {
    return NextResponse.json({ error: 'Informe uma instrução' }, { status: 400 });
  }

  // page_id e whatsapp_number podem ser passados pelo cliente ou usar defaults
  const pageId = body.page_id ?? process.env.META_PAGE_ID ?? '';
  const whatsappNumber = body.whatsapp_number ?? process.env.META_WHATSAPP_NUMBER;

  if (!pageId) {
    return NextResponse.json({ error: 'page_id não configurado' }, { status: 400 });
  }

  try {
    const resultado = await executarAgente(tenantId, body.instrucao, pageId, whatsappNumber);
    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
