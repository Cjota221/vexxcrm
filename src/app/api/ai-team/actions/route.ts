import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * GET /api/ai-team/actions?status=pending_approval
 * Lista ações da fila de aprovação do tenant.
 */
export async function GET(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const status = request.nextUrl.searchParams.get('status') || 'pending_approval';
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('ai_action_queue')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
