import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';

/**
 * GET /api/tenants/me
 * Retorna configurações de IA do tenant autenticado (chave raw para popular formulário).
 *
 * PATCH /api/tenants/me
 * Atualiza configurações de IA do tenant.
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
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('openai_api_key, openai_model, openai_provider, openai_base_url')
      .eq('id', profile.tenant_id)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      openai_api_key: tenant.openai_api_key ?? null,
      openai_model: tenant.openai_model ?? 'gpt-4o-mini',
      openai_provider: tenant.openai_provider ?? 'openai',
      openai_base_url: tenant.openai_base_url ?? null,
    });
  } catch (error) {
    console.error('❌ GET /api/tenants/me error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
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
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const body = await request.json();

    const dbUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.openai_api_key !== undefined) dbUpdate.openai_api_key = body.openai_api_key;
    if (body.openai_model !== undefined) dbUpdate.openai_model = body.openai_model;
    if (body.openai_provider !== undefined) dbUpdate.openai_provider = body.openai_provider;
    if (body.openai_base_url !== undefined) dbUpdate.openai_base_url = body.openai_base_url;

    const { data, error } = await supabase
      .from('tenants')
      .update(dbUpdate)
      .eq('id', profile.tenant_id)
      .select('openai_api_key, openai_model, openai_provider, openai_base_url')
      .single();

    if (error) {
      console.error('❌ PATCH /api/tenants/me error:', error);
      return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
    }

    return NextResponse.json({
      openai_api_key: data.openai_api_key ?? null,
      openai_model: data.openai_model ?? 'gpt-4o-mini',
      openai_provider: data.openai_provider ?? 'openai',
      openai_base_url: data.openai_base_url ?? null,
    });
  } catch (error) {
    console.error('❌ PATCH /api/tenants/me fatal error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
