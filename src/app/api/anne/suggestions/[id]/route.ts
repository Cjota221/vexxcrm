import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * PATCH /api/anne/suggestions/[id]
 *
 * Atualiza o status de uma sugestão da Anne.
 * Body: { status: 'sent' | 'dismissed' }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { profile } = await getTenantFromRequest(request);
    const { status } = await request.json() as { status: 'sent' | 'dismissed' };

    if (status !== 'sent' && status !== 'dismissed') {
      return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const { error } = await supabase
      .from('anne_suggestions')
      .update({ status })
      .eq('id', id)
      .eq('tenant_id', profile.tenant_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
