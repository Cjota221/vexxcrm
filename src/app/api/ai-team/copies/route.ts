import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * GET /api/ai-team/copies?status=draft
 * Lista copies gerados pelo Cláudio.
 *
 * PATCH /api/ai-team/copies — atualiza status de um copy
 * Body: { id: string, status: 'approved' | 'used' | 'discarded' }
 */
export async function GET(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const status = request.nextUrl.searchParams.get('status') || 'draft';

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('ai_generated_copies')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const { id, status } = await request.json() as { id: string; status: string };

    const validStatuses = ['approved', 'used', 'discarded'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from('ai_generated_copies')
      .update({ status })
      .eq('id', id)
      .eq('tenant_id', profile.tenant_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
