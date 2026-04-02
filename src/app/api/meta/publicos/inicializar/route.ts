/**
 * POST /api/meta/publicos/inicializar
 * Cria todos os públicos de alta performance de uma vez:
 * - Engajamento página 30 dias
 * - Visitantes do site 30 dias
 * - Lookalike clientes 1% BR
 *
 * Chamar uma vez para preparar a conta antes de rodar campanhas.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { resolverTokenMeta } from '@/lib/services/meta-token.service';
import {
  criarPublicoEngajamentoReal,
  criarPublicoVisitantesSite,
  criarLookalikeClientes,
} from '@/lib/services/meta-publicos-cj.service';

async function getTenantId(req: NextRequest): Promise<string | null> {
  const tenantId = req.headers.get('x-tenant-id');
  if (tenantId) return tenantId;
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
  return data?.tenant_id ?? null;
}

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const tokenConfig = await resolverTokenMeta(tenantId);
  if (!tokenConfig) return NextResponse.json({ error: 'Token Meta não configurado' }, { status: 400 });

  const token     = tokenConfig.token;
  const accountId = tokenConfig.account_id ?? '';

  if (!accountId) return NextResponse.json({ error: 'Ad Account ID não configurado' }, { status: 400 });

  const [engajamentoId, visitantesId, lookalikeId] = await Promise.all([
    criarPublicoEngajamentoReal(accountId, token, tenantId, 30),
    criarPublicoVisitantesSite(accountId, token, tenantId, 30),
    criarLookalikeClientes(accountId, token, tenantId),
  ]);

  return NextResponse.json({
    ok: true,
    publicos: {
      engajamento: engajamentoId ? { id: engajamentoId, status: 'criado' } : { status: 'erro' },
      visitantes:  visitantesId  ? { id: visitantesId,  status: 'criado' } : { status: 'erro' },
      lookalike:   lookalikeId   ? { id: lookalikeId,   status: 'criado' } : { status: 'erro' },
    },
    mensagem: 'Públicos inicializados. O Lookalike pode levar 1-2 horas para popular no Meta.',
  });
}
