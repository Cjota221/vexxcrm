import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';

/**
 * Mascara uma chave de API para exibição segura no frontend.
 * Ex: "sk-abc123xyz789" → "sk-a...789"
 */
function maskKey(key: string | null | undefined): string {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 4) + '••••' + key.slice(-4);
}

/**
 * GET /api/tenants/config
 * Retorna configurações do tenant autenticado.
 * API keys são retornadas MASCARADAS (segurança).
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

    const { data: tenant } = await supabase
      .from('tenants')
      .select('evolution_api_url, evolution_api_key, evolution_instance, facilzap_token, openai_api_key')
      .eq('id', profile.tenant_id)
      .single();

    // Transformar em formato esperado pelo frontend (keys mascaradas)
    const config = {
      facilzap: {
        enabled: !!tenant?.facilzap_token,
        token: maskKey(tenant?.facilzap_token),
        has_token: !!tenant?.facilzap_token,
        site_url: '',
      },
      evolution: {
        status: !!tenant?.evolution_api_url ? 'connected' : 'disconnected',
        url: tenant?.evolution_api_url || '',
        api_key: maskKey(tenant?.evolution_api_key),
        has_key: !!tenant?.evolution_api_key,
        instance: tenant?.evolution_instance || '',
      },
      openai: {
        enabled: !!tenant?.openai_api_key,
        api_key: maskKey(tenant?.openai_api_key),
        has_key: !!tenant?.openai_api_key,
        model: 'gpt-4o-mini',
        system_prompt: '',
      },
    };

    return NextResponse.json(config);
  } catch (error) {
    console.error('❌ Get config error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
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

    const configUpdate = await request.json();

    // Mapear estrutura do frontend para colunas do banco
    const dbUpdate: any = { updated_at: new Date().toISOString() };

    if (configUpdate.facilzap) {
      if (configUpdate.facilzap.token !== undefined) {
        dbUpdate.facilzap_token = configUpdate.facilzap.token;
      }
    }

    if (configUpdate.evolution) {
      if (configUpdate.evolution.url !== undefined) {
        dbUpdate.evolution_api_url = configUpdate.evolution.url;
      }
      if (configUpdate.evolution.api_key !== undefined) {
        dbUpdate.evolution_api_key = configUpdate.evolution.api_key;
      }
      if (configUpdate.evolution.instance !== undefined) {
        dbUpdate.evolution_instance = configUpdate.evolution.instance;
      }
    }

    if (configUpdate.openai) {
      if (configUpdate.openai.api_key !== undefined) {
        dbUpdate.openai_api_key = configUpdate.openai.api_key;
      }
    }

    const { data, error } = await supabase
      .from('tenants')
      .update(dbUpdate)
      .eq('id', profile.tenant_id)
      .select('evolution_api_url, evolution_api_key, evolution_instance, facilzap_token, openai_api_key')
      .single();

    if (error) {
      console.error('❌ Update config error:', error);
      return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
    }

    // Retornar no formato esperado (keys mascaradas)
    const updatedConfig = {
      facilzap: {
        enabled: !!data.facilzap_token,
        token: maskKey(data.facilzap_token),
        has_token: !!data.facilzap_token,
        site_url: '',
      },
      evolution: {
        status: !!data.evolution_api_url ? 'connected' : 'disconnected',
        url: data.evolution_api_url || '',
        api_key: maskKey(data.evolution_api_key),
        has_key: !!data.evolution_api_key,
        instance: data.evolution_instance || '',
      },
      openai: {
        enabled: !!data.openai_api_key,
        api_key: maskKey(data.openai_api_key),
        has_key: !!data.openai_api_key,
        model: 'gpt-4o-mini',
        system_prompt: '',
      },
    };

    return NextResponse.json(updatedConfig);
  } catch (error) {
    console.error('❌ Update config fatal error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
