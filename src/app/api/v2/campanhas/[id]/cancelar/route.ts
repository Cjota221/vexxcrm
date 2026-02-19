import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

type Params = Promise<{ id: string }>;

/** DELETE /api/v2/campanhas/[id]/cancelar */
export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const { id } = await params;

    // Cancelar campanha
    const { error: errCampanha } = await supabase
      .from('campaigns')
      .update({ status: 'cancelled', status_detalhe: 'Cancelado pelo usuário' })
      .eq('tenant_id', profile.tenant_id)
      .eq('id', id)
      .not('status', 'in', '("completed","cancelled")');

    if (errCampanha) return NextResponse.json({ error: errCampanha.message }, { status: 400 });

    // Cancelar jobs pendentes em lote
    await supabase
      .from('campaign_jobs')
      .update({ status: 'cancelado' })
      .eq('campanha_id', id)
      .eq('status', 'pendente');

    return NextResponse.json({ success: true, status: 'cancelled' });
  } catch (err) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
