/**
 * PATCH /api/meta/criativos/[id]/pin
 * Toggle: pina o criativo como preferido para campanhas automáticas.
 * Se já estava pinado → desafixar. Se não estava → fixar e desafixar todos os outros.
 * Apenas um criativo por tenant pode estar pinado simultaneamente.
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

  if (novoEstado) {
    // Pinar: desafixar todos os outros do tenant antes
    await supabase
      .from('ad_creatives')
      .update({ is_pinned: false })
      .eq('tenant_id', tenantId)
      .neq('id', id);
  }

  await supabase
    .from('ad_creatives')
    .update({ is_pinned: novoEstado })
    .eq('id', id)
    .eq('tenant_id', tenantId);

  return NextResponse.json({ ok: true, is_pinned: novoEstado });
}
