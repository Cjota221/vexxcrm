import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

async function getTenantId(): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single();
  return data?.tenant_id ?? null;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const supabase = createServerSupabaseClient();
  await supabase
    .from('ad_creatives')
    .update({ status: 'arquivado' })
    .eq('id', id)
    .eq('tenant_id', tenantId);

  return NextResponse.json({ ok: true });
}
