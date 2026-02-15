import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * GET /api/campaigns
 * Lista campanhas do tenant (autenticado).
 *
 * POST /api/campaigns
 * Cria nova campanha (autenticado).
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const perPage = parseInt(searchParams.get('per_page') || '20');
    const offset = (page - 1) * perPage;

    const { data, count, error } = await supabase
      .from('campaigns')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + perPage - 1);

    if (error) {
      console.error('[Campaigns GET] Erro:', error.message);
      // Se tabela não existe, retornar vazio
      if (error.code === '42P01') {
        return NextResponse.json({ data: [], total: 0, page, per_page: perPage, total_pages: 0 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      per_page: perPage,
      total_pages: Math.ceil((count || 0) / perPage),
    });
  } catch (error: any) {
    if (error.message?.includes('Não autenticado') || error.message?.includes('Perfil não encontrado')) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const { name, type, status, message, target_segment, scheduled_at } = body;

    if (!name) {
      return NextResponse.json({ error: 'Nome da campanha é obrigatório' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        tenant_id: tenantId,
        name,
        type: type || 'whatsapp',
        status: status || 'draft',
        message: message || '',
        target_segment: target_segment || null,
        scheduled_at: scheduled_at || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[Campaigns POST] Erro:', error.message);
      if (error.code === '42P01') {
        return NextResponse.json({ error: 'Módulo de campanhas ainda não configurado' }, { status: 501 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error: any) {
    if (error.message?.includes('Não autenticado') || error.message?.includes('Perfil não encontrado')) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
