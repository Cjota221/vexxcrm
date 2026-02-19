import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

type Params = Promise<{ id: string }>;

/** PATCH /api/v2/campanhas/[id]/pausar */
export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const { id } = await params;

    const { error } = await supabase
      .from('campaigns')
      .update({ status: 'paused', status_detalhe: 'Pausado manualmente' })
      .eq('tenant_id', profile.tenant_id)
      .eq('id', id)
      .in('status', ['running', 'scheduled']);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, status: 'paused' });
  } catch (err) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
