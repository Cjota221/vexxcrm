import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { calculateCustomerHealth, saveCustomerHealth } from '@/lib/services/customer-health';

/**
 * GET /api/clients/[id]/health
 * Calcula e retorna a saúde comercial de um cliente.
 * 
 * ?refresh=true → Recalcula e salva (ignora cache)
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

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 403 });
    }

    const { id } = await params;
    const refresh = request.nextUrl.searchParams.get('refresh') === 'true';

    // Verificar se o cliente pertence ao tenant
    const { data: client } = await supabase
      .from('clients')
      .select('id, custom_fields')
      .eq('id', id)
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!client) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    // Verificar cache (6 horas)
    const cf = client.custom_fields as Record<string, unknown> | null;
    const cachedHealth = cf?.health_data as Record<string, unknown> | undefined;
    
    if (!refresh && cachedHealth?.calculadoEm) {
      const cacheAge = Date.now() - new Date(cachedHealth.calculadoEm as string).getTime();
      const SIX_HOURS = 6 * 60 * 60 * 1000;
      
      if (cacheAge < SIX_HOURS) {
        return NextResponse.json({ data: cachedHealth, cached: true });
      }
    }

    // Calcular health
    const health = await calculateCustomerHealth(supabase, profile.tenant_id, id);

    // Salvar no banco
    await saveCustomerHealth(supabase, id, health);

    return NextResponse.json({ data: health, cached: false });
  } catch (error: unknown) {
    console.error('❌ Health API error:', error);
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
