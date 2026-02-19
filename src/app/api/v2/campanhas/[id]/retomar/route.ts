import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

type Params = Promise<{ id: string }>;

/** PATCH /api/v2/campanhas/[id]/retomar */
export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const { id } = await params;

    const { error } = await supabase
      .from('campaigns')
      .update({ status: 'running', status_detalhe: 'Retomado manualmente' })
      .eq('tenant_id', profile.tenant_id)
      .eq('id', id)
      .eq('status', 'paused');

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, status: 'running' });
  } catch (err) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
