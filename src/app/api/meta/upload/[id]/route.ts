import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function DELETE(
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
  await supabase
    .from('ad_creatives')
    .update({ status: 'arquivado' })
    .eq('id', id)
    .eq('tenant_id', tenantId);

  return NextResponse.json({ ok: true });
}
