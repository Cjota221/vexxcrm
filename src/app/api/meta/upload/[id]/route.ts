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
  { params }: { params: { id: string } },
) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const supabase = createServerSupabaseClient();
  await supabase
    .from('ad_creatives')
    .update({ status: 'arquivado' })
    .eq('id', params.id)
    .eq('tenant_id', tenantId); // RLS extra: só arquiva do próprio tenant

  return NextResponse.json({ ok: true });
}
