/**
 * API Intelligence — RFM Segment Clients
 *
 * GET /api/intelligence/rfm/clients?segment=Champions&page=1&limit=50
 * Retorna a lista de clientes de um segmento RFM específico
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
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

    const tenantId = profile.tenant_id;
    const { searchParams } = new URL(request.url);
    const segment = searchParams.get('segment');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const search = searchParams.get('search') || '';

    if (!segment) {
      return NextResponse.json({ error: 'Parâmetro segment é obrigatório' }, { status: 400 });
    }

    const offset = (page - 1) * limit;

    // Query base
    let query = supabase
      .from('clients')
      .select(`
        id, name, phone, email, cpf,
        rfm_segment, rfm_score, rfm_recency, rfm_frequency, rfm_monetary,
        churn_probability, purchase_prob_30d, ltv_projected_12m,
        flag_auto_vip, flag_churn_risk, flag_needs_attention, flag_upsell_ready,
        total_orders, avg_ticket, total_spent, last_order_at,
        created_at
      `, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('rfm_segment', segment);

    // Busca por nome/telefone
    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    // Ordenação: mais valiosos primeiro
    query = query
      .order('total_spent', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    const { data: clients, count, error: queryError } = await query;

    if (queryError) {
      console.error('Erro ao buscar clientes do segmento:', queryError);
      return NextResponse.json({ error: 'Erro ao buscar clientes' }, { status: 500 });
    }

    // Calcular totais do segmento
    const totalSpent = (clients || []).reduce((s, c) => s + (c.total_spent || 0), 0);
    const avgTicket = (clients || []).length > 0
      ? (clients || []).reduce((s, c) => s + (c.avg_ticket || 0), 0) / (clients || []).length
      : 0;

    return NextResponse.json({
      success: true,
      segment,
      clients: clients || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit),
      },
      summary: {
        total_clients: count || 0,
        total_spent: totalSpent,
        avg_ticket: avgTicket,
      },
    });
  } catch (error) {
    console.error('Erro na API rfm/clients:', error);
    return NextResponse.json(
      { error: 'Erro interno', details: String(error) },
      { status: 500 }
    );
  }
}
