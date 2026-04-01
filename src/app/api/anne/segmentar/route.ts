import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';
import { segmentarCompradores } from '@/lib/anne/tools/segmentar-compradores';
import type { SegmentoComprador } from '@/lib/anne/tools/segmentar-compradores';

/**
 * GET /api/anne/segmentar?segmento=todos&limite=200
 *
 * Retorna a segmentação de compradores por ticket médio por pedido:
 *   - Grandes: avg_ticket > R$700
 *   - Médios:  R$300–R$700
 *   - Pequenos: < R$300
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

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

    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const segmento = (searchParams.get('segmento') || 'todos') as SegmentoComprador;
    const limite = parseInt(searchParams.get('limite') || '200', 10);

    const data = await segmentarCompradores({ segmento, limite }, profile.tenant_id);

    return NextResponse.json({ success: true, ...data });
  } catch (err) {
    console.error('[/api/anne/segmentar]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 }
    );
  }
}
