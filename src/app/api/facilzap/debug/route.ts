import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';

const API_BASE_URL = 'https://api.facilzap.app.br';

/**
 * GET /api/facilzap/debug
 * Debug: Busca dados RAW da FacilZap para ver estrutura real dos campos.
 * Retorna 1 pedido, 1 produto e 1 cliente raw da API.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
    }

    const { data: tenantData } = await supabase.from('tenants').select('facilzap_token').eq('id', profile.tenant_id).single();
    if (!tenantData?.facilzap_token) {
      return NextResponse.json({ error: 'Token FacilZap não configurado' }, { status: 400 });
    }

    const facilzapToken = tenantData.facilzap_token;

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${facilzapToken}`,
    };

    // Buscar 1 pedido com produtos incluídos
    const today = new Date().toISOString().split('T')[0];
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const startDate = twoYearsAgo.toISOString().split('T')[0];

    const [ordersRes, productsRes, clientsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/pedidos?page=1&length=2&filtros[incluir_produtos]=1&filtros[data_inicial]=${startDate}&filtros[data_final]=${today}`, { headers }),
      fetch(`${API_BASE_URL}/produtos?page=1&length=2`, { headers }),
      fetch(`${API_BASE_URL}/clientes?page=1&length=2`, { headers }),
    ]);

    const ordersRaw = await ordersRes.json();
    const productsRaw = await productsRes.json();
    const clientsRaw = await clientsRes.json();

    // Analisar campos de imagem nos itens do pedido
    const orderSample = ordersRaw?.data?.[0];
    const itemAnalysis = orderSample ? {
      order_keys: Object.keys(orderSample),
      codigo: orderSample.codigo,
      numero: orderSample.numero,
      numero_pedido: orderSample.numero_pedido,
      id: orderSample.id,
      status: orderSample.status,
      itens_count: (orderSample.itens || orderSample.produtos || []).length,
      first_item: (orderSample.itens || orderSample.produtos || [])[0] ? {
        all_keys: Object.keys((orderSample.itens || orderSample.produtos || [])[0]),
        raw_data: (orderSample.itens || orderSample.produtos || [])[0],
      } : null,
    } : null;

    // Também buscar um pedido do banco para comparar
    const { data: dbOrder } = await supabase
      .from('orders')
      .select('id, order_number, external_id, metadata')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const dbMeta = dbOrder?.metadata;
    const dbFirstItem = dbMeta?.itens?.[0] || null;

    return NextResponse.json({
      message: 'DEBUG - Dados RAW da FacilZap',
      facilzap_raw: {
        order_sample: itemAnalysis,
        full_order_raw: orderSample,
        product_sample_keys: productsRaw?.data?.[0] ? Object.keys(productsRaw.data[0]) : [],
        product_sample: productsRaw?.data?.[0] || null,
        client_sample_keys: clientsRaw?.data?.[0] ? Object.keys(clientsRaw.data[0]) : [],
        client_sample: clientsRaw?.data?.[0] || null,
      },
      database: {
        order_number: dbOrder?.order_number,
        external_id: dbOrder?.external_id,
        first_item_in_db: dbFirstItem,
        metadata_keys: dbMeta ? Object.keys(dbMeta) : [],
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
