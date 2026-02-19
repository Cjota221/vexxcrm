import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';
import { executeSentinelaChunk } from '@/lib/services/customer-health';

/**
 * POST /api/sentinela/scan
 * Executa varredura em lotes para evitar timeout no Netlify (26s max).
 *
 * Body: { offset?: number, limit?: number }
 * - offset: índice de início (default 0)
 * - limit: clientes por chamada (default 150, max 200)
 *
 * Response: { data: { ...resultado, offset, limit, total, hasMore } }
 * O frontend encadeia chamadas até hasMore === false.
 */
export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authorization.replace('Bearer ', '');
    const supabaseAuth = createAuthenticatedClient(token);
    const supabase = createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 403 });
    }

    // Parâmetros de paginação
    const body = await request.json().catch(() => ({}));
    const offset = Math.max(0, Number(body.offset) || 0);
    const limit = Math.min(200, Math.max(50, Number(body.limit) || 150));

    console.log(`🔍 Sentinela: chunk offset=${offset} limit=${limit} tenant=${profile.tenant_id}`);

    const result = await executeSentinelaChunk(supabase, profile.tenant_id, offset, limit);

    console.log(`✅ Sentinela chunk: ${result.totalProcessados} processados, hasMore=${result.hasMore}`);

    return NextResponse.json({ data: result });
  } catch (error: unknown) {
    console.error('❌ Sentinela scan error:', error);
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
