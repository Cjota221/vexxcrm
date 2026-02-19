import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

type Params = Promise<{ id: string }>;

/**
 * GET /api/v2/campanhas/[id]/jobs
 * Lista jobs com paginação + filtro por status
 */
export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const { id } = await params;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const limit = Math.min(100, Number(searchParams.get('limit') ?? '50'));
    const offset = (page - 1) * limit;

    let query = supabase
      .from('campaign_jobs')
      .select('id, contato_nome, contato_telefone, status, tentativas, enviado_em, erro_mensagem, erro_codigo, ordem', { count: 'exact' })
      .eq('campanha_id', id)
      .eq('tenant_id', profile.tenant_id)
      .order('ordem', { ascending: true })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({
      jobs: data ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
