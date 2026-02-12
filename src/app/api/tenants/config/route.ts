import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * GET /api/tenants/config
 * Retorna configurações do tenant autenticado.
 *
 * PUT /api/tenants/config
 * Atualiza configurações do tenant.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

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

    const { data: tenant } = await supabase
      .from('tenants')
      .select('config')
      .eq('id', profile.tenant_id)
      .single();

    return NextResponse.json({ data: tenant?.config || {} });
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

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

    const configUpdate = await request.json();

    // Merge com config existente
    const { data: currentTenant } = await supabase
      .from('tenants')
      .select('config')
      .eq('id', profile.tenant_id)
      .single();

    const mergedConfig = {
      ...currentTenant?.config,
      ...configUpdate,
    };

    const { data, error } = await supabase
      .from('tenants')
      .update({ config: mergedConfig, updated_at: new Date().toISOString() })
      .eq('id', profile.tenant_id)
      .select('config')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
    }

    return NextResponse.json({ data: data.config });
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
