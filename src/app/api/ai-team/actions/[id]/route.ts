import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { executeApprovedAction } from '@/lib/services/ai-team-orchestrator.service';

/**
 * PATCH /api/ai-team/actions/[id]
 * Body: { status: 'approved' | 'rejected' }
 *
 * Aprova ou rejeita uma ação da fila.
 * Se aprovada + action_type for executável automaticamente (pausar, escalar),
 * chame POST /execute para executar.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { profile } = await getTenantFromRequest(request);
    const { status } = await request.json() as { status: 'approved' | 'rejected' };

    if (status !== 'approved' && status !== 'rejected') {
      return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Verificar que a ação pertence ao tenant
    const { data: action } = await supabase
      .from('ai_action_queue')
      .select('tenant_id, status')
      .eq('id', id)
      .single();

    if (!action || action.tenant_id !== profile.tenant_id) {
      return NextResponse.json({ error: 'Ação não encontrada' }, { status: 404 });
    }
    if (action.status !== 'pending_approval') {
      return NextResponse.json({ error: `Ação já está com status "${action.status}"` }, { status: 409 });
    }

    await supabase
      .from('ai_action_queue')
      .update({
        status,
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id);

    return NextResponse.json({ ok: true, status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * POST /api/ai-team/actions/[id]/execute — executar ação aprovada
 * (na verdade: PATCH com execute=true para simplificar o endpoint)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { profile } = await getTenantFromRequest(request);

    const supabase = createServerSupabaseClient();
    const { data: action } = await supabase
      .from('ai_action_queue')
      .select('tenant_id')
      .eq('id', id)
      .single();

    if (!action || action.tenant_id !== profile.tenant_id) {
      return NextResponse.json({ error: 'Ação não encontrada' }, { status: 404 });
    }

    const result = await executeApprovedAction(id);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
