/**
 * PATCH /api/meta/criativos/[id]/pin
 * Toggle: pina/desafixar um criativo da pool de campanhas automáticas.
 * Múltiplos criativos podem estar pinados simultaneamente — todos formam a pool.
 * O sistema escolhe o de melhor performance dentro da pool ao publicar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function PATCH(
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

  const supabase = createServerSupabaseClient();

  // Verificar se o criativo pertence ao tenant
  const { data: criativo } = await supabase
    .from('ad_creatives')
    .select('id, is_pinned')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();

  if (!criativo) {
    return NextResponse.json({ error: 'Criativo não encontrado' }, { status: 404 });
  }

  const novoEstado = !criativo.is_pinned;

  await supabase
    .from('ad_creatives')
    .update({ is_pinned: novoEstado })
    .eq('id', id)
    .eq('tenant_id', tenantId);

  return NextResponse.json({ ok: true, is_pinned: novoEstado });
}
