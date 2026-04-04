/**
 * POST /api/meta/campanhas/limpar-testes
 * Arquiva campanhas no Meta por nome (substring) ou array de IDs.
 *
 * Body:
 *   { nomes?: string[], ids?: string[], status_filtro?: string[] }
 *
 * - nomes: arquiva qualquer campanha cujo nome contenha algum dos termos (case-insensitive)
 * - ids: arquiva as campanhas com esses IDs exatos
 * - status_filtro: só arquiva se o status atual for um desses (default: ['PAUSED'])
 *
 * Retorna: { arquivadas: number, erros: number, detalhes: [...] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { resolverTokenMeta } from '@/lib/services/meta-token.service';
import { META_BASE } from '@/lib/meta-config';

export async function POST(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const body = await req.json() as {
    nomes?: string[];
    ids?: string[];
    status_filtro?: string[];
  };

  if ((!body.nomes?.length) && (!body.ids?.length)) {
    return NextResponse.json({ error: 'Informe nomes ou ids para arquivar' }, { status: 400 });
  }

  const statusFiltro = body.status_filtro ?? ['PAUSED'];

  let config: Awaited<ReturnType<typeof resolverTokenMeta>>;
  try {
    config = await resolverTokenMeta(tenantId);
  } catch {
    return NextResponse.json({ error: 'Token Meta não configurado' }, { status: 400 });
  }

  const { token, account_id } = config;
  if (!account_id) return NextResponse.json({ error: 'Ad Account ID não configurado' }, { status: 400 });

  const actId = account_id.startsWith('act_') ? account_id : `act_${account_id}`;

  // 1. Buscar campanhas da conta (até 200)
  const fields = 'id,name,status,insights{spend}';
  const res = await fetch(
    `${META_BASE}/${actId}/campaigns?fields=${encodeURIComponent(fields)}&limit=200&access_token=${token}`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) {
    const err = await res.json() as { error?: { message: string } };
    return NextResponse.json({ error: err.error?.message ?? 'Erro ao listar campanhas' }, { status: 502 });
  }

  const { data: campanhas } = await res.json() as {
    data: Array<{
      id: string;
      name: string;
      status: string;
      insights?: { data: Array<{ spend: string }> };
    }>;
  };

  // 2. Filtrar candidatas
  const nomesLower = (body.nomes ?? []).map(n => n.toLowerCase());

  const candidatas = campanhas.filter(c => {
    // filtro por status
    if (!statusFiltro.includes(c.status)) return false;
    // filtro por ID
    if (body.ids?.includes(c.id)) return true;
    // filtro por nome (substring)
    if (nomesLower.some(n => c.name.toLowerCase().includes(n))) return true;
    return false;
  });

  if (candidatas.length === 0) {
    return NextResponse.json({ arquivadas: 0, erros: 0, mensagem: 'Nenhuma campanha encontrada com esses critérios' });
  }

  // 3. Arquivar em paralelo (lotes de 5 para não sobrecarregar)
  const detalhes: Array<{ id: string; nome: string; resultado: 'arquivada' | 'erro'; erro?: string }> = [];
  let arquivadas = 0;
  let erros = 0;

  for (let i = 0; i < candidatas.length; i += 5) {
    const lote = candidatas.slice(i, i + 5);
    await Promise.all(lote.map(async c => {
      try {
        const r = await fetch(`${META_BASE}/${c.id}?access_token=${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'ARCHIVED' }),
          signal: AbortSignal.timeout(10_000),
        });
        if (r.ok) {
          arquivadas++;
          detalhes.push({ id: c.id, nome: c.name, resultado: 'arquivada' });
        } else {
          const e = await r.json() as { error?: { message: string } };
          erros++;
          detalhes.push({ id: c.id, nome: c.name, resultado: 'erro', erro: e.error?.message });
        }
      } catch (err) {
        erros++;
        detalhes.push({ id: c.id, nome: c.name, resultado: 'erro', erro: String(err) });
      }
    }));
  }

  return NextResponse.json({ arquivadas, erros, total_candidatas: candidatas.length, detalhes });
}
