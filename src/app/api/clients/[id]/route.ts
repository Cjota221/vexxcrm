import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';

/**
 * GET /api/clients/[id]
 * Retorna detalhes de um cliente específico por ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authorization.replace('Bearer ', '');
    const supabaseAuth = createAuthenticatedClient(token);
    const supabase = createServerSupabaseClient();

    // Verificar token e obter tenant_id
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

    const { id } = await params;

    // Buscar cliente pelo ID dentro do tenant
    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (error || !client) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    // Buscar últimos pedidos do cliente (com detalhes completos)
    const { data: orders } = await supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(50);

    return NextResponse.json({
      data: {
        ...client,
        recent_orders: orders || [],
      },
    });
  } catch (error: any) {
    console.error('Erro ao buscar cliente:', error);
    return NextResponse.json(
      { error: 'Erro interno', details: error.message },
      { status: 500 }
    );
  }
}
