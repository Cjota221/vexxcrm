/**
 * GET /api/extension/client?phone=5511999999999
 * 
 * Retorna dados do cliente pelo número de telefone.
 * Usado pela extensão para mostrar histórico do cliente na sidebar.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { PhoneNormalizer } from '@/lib/phone-normalizer';

function corsHeaders(req: NextRequest) {
  const origin = req.headers.get('origin') || '';
  const allowed = origin.startsWith('chrome-extension://') || origin.includes('vexxcrm') || origin.includes('localhost');
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-tenant-id',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function GET(req: NextRequest) {
  const headers = corsHeaders(req);

  try {
    // Auth
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401, headers });
    }
    const token = authHeader.replace('Bearer ', '');

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401, headers });
    }

    const supabase = createServerSupabaseClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404, headers });
    }

    const tenantId = profile.tenant_id;

    // Parâmetro: phone (número do WhatsApp)
    const rawPhone = req.nextUrl.searchParams.get('phone') || '';
    if (!rawPhone) {
      return NextResponse.json({ client: null }, { headers });
    }

    // Normalizar telefone (REGRA CRÍTICA do VEXX CRM)
    const phoneNormalized = PhoneNormalizer.canonical(rawPhone);

    // Buscar cliente
    const { data: client } = await supabase
      .from('clients')
      .select(`
        id, name, name_manual, phone, email, cpf, avatar_url,
        birthday, city, state, address,
        created_at, updated_at
      `)
      .eq('tenant_id', tenantId)
      .eq('phone_normalized', phoneNormalized)
      .single();

    if (!client) {
      return NextResponse.json({ client: null }, { headers });
    }

    // Buscar pedidos recentes (últimos 10)
    const { data: recentOrders } = await supabase
      .from('orders')
      .select('id, order_number, status, total_amount, tracking_code, created_at')
      .eq('tenant_id', tenantId)
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(10);

    // Calcular estatísticas
    const { data: statsData } = await supabase
      .from('orders')
      .select('total_amount, status')
      .eq('tenant_id', tenantId)
      .eq('client_id', client.id)
      .neq('status', 'cancelled');

    const totalOrders = statsData?.length || 0;
    const totalSpent  = statsData?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;
    const avgTicket   = totalOrders > 0 ? Math.round(totalSpent / totalOrders) : 0;

    // Buscar notas do cliente
    const { data: notes } = await supabase
      .from('client_notes')
      .select('id, content, created_at')
      .eq('tenant_id', tenantId)
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(20);

    // Buscar análises pendentes do Sentinela (Anne Intelligence)
    const { data: analyses } = await supabase
      .from('sentinela_analyses')
      .select('type, urgency, title, description')
      .eq('tenant_id', tenantId)
      .eq('client_id', client.id)
      .eq('status', 'pending')
      .order('urgency', { ascending: false })
      .limit(5);

    // Buscar segmento RFM e status de saúde do cliente
    const { data: clientStats } = await supabase
      .from('clients')
      .select('rfm_segment, health_status, total_orders, ltv, last_order_at')
      .eq('id', client.id)
      .eq('tenant_id', tenantId)
      .single();

    return NextResponse.json({
      client: {
        ...client,
        rfm_segment: clientStats?.rfm_segment || null,
        health_status: clientStats?.health_status || null,
        total_orders: clientStats?.total_orders || totalOrders,
        ltv: clientStats?.ltv || totalSpent,
        last_order_at: clientStats?.last_order_at || null,
        recentOrders: recentOrders || [],
        notes: notes || [],
        analyses: analyses || [],
        stats: { totalOrders, totalSpent, avgTicket },
      },
    }, { headers });

  } catch (error) {
    console.error('[Extension API] /client error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500, headers });
  }
}
