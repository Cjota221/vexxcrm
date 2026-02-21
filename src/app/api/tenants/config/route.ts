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
      .select('evolution_api_url, evolution_api_key, evolution_instance, facilzap_token, openai_api_key, openai_model, openai_system_prompt, openai_provider, openai_base_url, config')
      .eq('id', profile.tenant_id)
      .single();

    // config JSONB: contém site_url do FacilZap, pix, etc.
    const tenantConfig = (tenant?.config as Record<string, unknown>) || {};
    const facilzapConfig = (tenantConfig.facilzap as Record<string, unknown>) || {};
    const pixConfig = (tenantConfig.pix as Record<string, unknown>) || {};

    // Transformar em formato esperado pelo frontend (keys mascaradas)
    const config = {
      facilzap: {
        enabled: !!tenant?.facilzap_token,
        token: maskKey(tenant?.facilzap_token),
        has_token: !!tenant?.facilzap_token,
        site_url: (facilzapConfig.site_url as string) || '',
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
        model: tenant?.openai_model || 'gpt-4o-mini',
        system_prompt: tenant?.openai_system_prompt || '',
        provider: tenant?.openai_provider || 'openai',
        base_url: tenant?.openai_base_url || '',
      },
      pix: Object.keys(pixConfig).length > 0 ? {
        key: (pixConfig.key as string) || '',
        keyType: (pixConfig.keyType as string) || 'aleatoria',
        holderName: (pixConfig.holderName as string) || '',
      } : undefined,
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

    // Campos que vão em colunas dedicadas
    if (configUpdate.facilzap) {
      if (configUpdate.facilzap.token !== undefined) {
        dbUpdate.facilzap_token = configUpdate.facilzap.token;
      }
    }

    // Campos que vão no JSONB config (site_url, pix, etc.)
    // Buscar config atual para fazer merge seguro (não sobrescrever outros campos)
    const { data: currentTenant } = await supabase
      .from('tenants')
      .select('config')
      .eq('id', profile.tenant_id)
      .single();

    const currentConfig = (currentTenant?.config as Record<string, unknown>) || {};

    if (configUpdate.facilzap?.site_url !== undefined) {
      const currentFacilzap = (currentConfig.facilzap as Record<string, unknown>) || {};
      currentConfig.facilzap = { ...currentFacilzap, site_url: configUpdate.facilzap.site_url };
      dbUpdate.config = currentConfig;
    }

    if (configUpdate.pix !== undefined) {
      if (configUpdate.pix === null) {
        delete currentConfig.pix;
      } else {
        currentConfig.pix = configUpdate.pix;
      }
      dbUpdate.config = currentConfig;
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
        dbUpdate.openai_model = configUpdate.openai.model;
      }
      if (configUpdate.openai.system_prompt !== undefined) {
        // Salvar null se string vazia (usa o prompt padrão)
        dbUpdate.openai_system_prompt = configUpdate.openai.system_prompt?.trim() || null;
      }
      if (configUpdate.openai.provider !== undefined) {
        dbUpdate.openai_provider = configUpdate.openai.provider;
      }
      if (configUpdate.openai.base_url !== undefined) {
        dbUpdate.openai_base_url = configUpdate.openai.base_url?.trim() || null;
      }
    }

    const { data, error } = await supabase
      .from('tenants')
      .update(dbUpdate)
      .eq('id', profile.tenant_id)
      .select('evolution_api_url, evolution_api_key, evolution_instance, facilzap_token, openai_api_key, openai_model, openai_system_prompt, openai_provider, openai_base_url, config')
      .single();

    if (error) {
      console.error('❌ Update config error:', error);
      return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
    }

    // Retornar no formato esperado (keys mascaradas)
    const savedConfig = (data.config as Record<string, unknown>) || {};
    const savedFacilzap = (savedConfig.facilzap as Record<string, unknown>) || {};
    const savedPix = (savedConfig.pix as Record<string, unknown>) || {};

    const updatedConfig = {
      facilzap: {
        enabled: !!data.facilzap_token,
        token: maskKey(data.facilzap_token),
        has_token: !!data.facilzap_token,
        site_url: (savedFacilzap.site_url as string) || '',
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
        model: data.openai_model || 'gpt-4o-mini',
        system_prompt: data.openai_system_prompt || '',
        provider: data.openai_provider || 'openai',
        base_url: data.openai_base_url || '',
      },
      pix: Object.keys(savedPix).length > 0 ? {
        key: (savedPix.key as string) || '',
        keyType: (savedPix.keyType as string) || 'aleatoria',
        holderName: (savedPix.holderName as string) || '',
      } : undefined,
    };

    return NextResponse.json(updatedConfig);
  } catch (error) {
    console.error('❌ Update config fatal error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
