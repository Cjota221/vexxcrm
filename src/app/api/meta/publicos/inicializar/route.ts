/**
 * POST /api/meta/publicos/inicializar
 * Cria todos os públicos de alta performance de uma vez:
 * - Engajamento página 30 dias
 * - Visitantes do site 30 dias (Pixel)
 * - Engajamento Instagram 30 dias
 * - Lista de Clientes do VEXX
 * - Lookalike Clientes 1% BR
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { inicializarTodosPublicos } from '@/lib/services/meta-publicos-cj.service';

const LABEL: Record<string, string> = {
  engajamento_pagina:      'Engajamento Pagina',
  visitantes_site:         'Visitantes Site',
  engajamento_instagram:   'Engajamento Instagram',
  lista_clientes:          'Lista de Clientes',
  lookalike:               'Lookalike 1% BR',
};

export async function POST(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  // ig_account_id opcional no body
  let igAccountId: string | undefined;
  try {
    const body = await req.json() as { ig_account_id?: string };
    igAccountId = body.ig_account_id;
  } catch { /* body vazio */ }

  try {
    const resultados = await inicializarTodosPublicos(tenantId, igAccountId);

    const publicos = Object.fromEntries(
      Object.entries(resultados).map(([key, id]) => [
        key,
        id
          ? { id, status: 'criado', label: LABEL[key] ?? key }
          : { status: 'erro', label: LABEL[key] ?? key },
      ])
    );

    const criados = Object.values(publicos).filter(p => p.status === 'criado').length;

    return NextResponse.json({
      ok: true,
      publicos,
      criados,
      mensagem: `${criados} público(s) criado(s). Lookalike pode levar 1-2 horas para popular no Meta.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
