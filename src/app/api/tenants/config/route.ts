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
      .select('evolution_api_url, evolution_api_key, evolution_instance, facilzap_token, openai_api_key, anne_enabled, anne_system_prompt, anne_model, anne_max_tokens')
      .eq('id', profile.tenant_id)
      .single();

    // Transformar em formato esperado pelo frontend
    const config = {
      facilzap: {
        enabled: !!tenant?.facilzap_token,
        token: tenant?.facilzap_token || '',
        site_url: '', // TODO: adicionar coluna se necessário
      },
      evolution: {
        status: !!tenant?.evolution_api_url ? 'connected' : 'disconnected',
        url: tenant?.evolution_api_url || '',
        api_key: tenant?.evolution_api_key || '',
        instance: tenant?.evolution_instance || '',
      },
      openai: {
        enabled: tenant?.anne_enabled ?? !!tenant?.openai_api_key,
        api_key: tenant?.openai_api_key || '',
        model: tenant?.anne_model || 'gpt-4o-mini',
        system_prompt: tenant?.anne_system_prompt || '',
      },
    };

    console.log('✅ Get config:', config);
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
      if (configUpdate.openai.model !== undefined) {
        dbUpdate.anne_model = configUpdate.openai.model;
      }
      if (configUpdate.openai.system_prompt !== undefined) {
        dbUpdate.anne_system_prompt = configUpdate.openai.system_prompt;
      }
      if (configUpdate.openai.enabled !== undefined) {
        dbUpdate.anne_enabled = configUpdate.openai.enabled;
      }
    }

    const { data, error } = await supabase
      .from('tenants')
      .update(dbUpdate)
      .eq('id', profile.tenant_id)
      .select('evolution_api_url, evolution_api_key, evolution_instance, facilzap_token, openai_api_key, anne_enabled, anne_system_prompt, anne_model, anne_max_tokens')
      .single();

    if (error) {
      console.error('❌ Update config error:', error);
      return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
    }

    // Retornar no formato esperado
    const updatedConfig = {
      facilzap: {
        enabled: !!data.facilzap_token,
        token: data.facilzap_token || '',
        site_url: '',
      },
      evolution: {
        status: !!data.evolution_api_url ? 'connected' : 'disconnected',
        url: data.evolution_api_url || '',
        api_key: data.evolution_api_key || '',
        instance: data.evolution_instance || '',
      },
      openai: {
        enabled: data.anne_enabled ?? !!data.openai_api_key,
        api_key: data.openai_api_key || '',
        model: data.anne_model || 'gpt-4o-mini',
        system_prompt: data.anne_system_prompt || '',
      },
    };

    console.log('✅ Config atualizado:', updatedConfig);
    return NextResponse.json(updatedConfig);
  } catch (error) {
    console.error('❌ Update config fatal error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
