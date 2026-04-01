/**
 * Gerenciamento de tokens Meta por tenant.
 * Prioridade: system_user_token > access_token > variável de ambiente
 * O token de sistema não expira e é recomendado para integrações server-side.
 */

import { createServerSupabaseClient } from '@/lib/supabase';
import { META_BASE } from '@/lib/meta-config';

export interface MetaTokenConfig {
  accessToken: string;
  adAccountId: string;
  pageId?: string;
  pixelId?: string;
  businessId?: string;
  tokenType: 'page' | 'system_user' | 'env';
}

/**
 * Resolve o melhor token disponível para um tenant.
 * Hierarquia: system_user_token → meta_access_token → env vars
 */
export async function resolverTokenMeta(tenantId: string): Promise<MetaTokenConfig | null> {
  const supabase = createServerSupabaseClient();

  const { data: config } = await supabase
    .from('ai_provider_config')
    .select(`
      meta_system_user_token,
      meta_access_token,
      meta_page_id,
      meta_pixel_id,
      meta_business_id,
      meta_token_type,
      meta_token_valid
    `)
    .eq('tenant_id', tenantId)
    .single();

  // Buscar conta de anúncio ativa do tenant
  const { data: adAccount } = await supabase
    .from('meta_ad_accounts')
    .select('ad_account_id')
    .eq('tenant_id', tenantId)
    .eq('ativa', true)
    .order('ordem')
    .limit(1)
    .single();

  const adAccountId = adAccount?.ad_account_id;
  if (!adAccountId) return null;

  // Prioridade 1: System User Token (não expira)
  if (config?.meta_system_user_token) {
    return {
      accessToken: config.meta_system_user_token,
      adAccountId,
      pageId: config.meta_page_id ?? undefined,
      pixelId: config.meta_pixel_id ?? undefined,
      businessId: config.meta_business_id ?? undefined,
      tokenType: 'system_user',
    };
  }

  // Prioridade 2: token salvo no banco (page token ou long-lived)
  if (config?.meta_access_token) {
    return {
      accessToken: config.meta_access_token,
      adAccountId,
      pageId: config.meta_page_id ?? undefined,
      pixelId: config.meta_pixel_id ?? undefined,
      tokenType: 'page',
    };
  }

  // Prioridade 3: variáveis de ambiente globais (fallback, não recomendado)
  const envToken = process.env.META_ACCESS_TOKEN;
  const envAccountId = process.env.META_AD_ACCOUNT_ID;
  if (envToken && envAccountId) {
    return {
      accessToken: envToken,
      adAccountId: envAccountId,
      pageId: process.env.META_PAGE_ID,
      tokenType: 'env',
    };
  }

  return null;
}

/**
 * Verifica se um token é válido fazendo uma chamada leve à Graph API.
 * Atualiza meta_token_valid e meta_token_last_checked no banco.
 */
export async function verificarTokenMeta(tenantId: string): Promise<{
  valid: boolean;
  accountName?: string;
  tokenType?: string;
  error?: string;
}> {
  const tokenConfig = await resolverTokenMeta(tenantId);

  if (!tokenConfig) {
    return { valid: false, error: 'Nenhum token configurado para este tenant' };
  }

  try {
    const res = await fetch(
      `${META_BASE}/${tokenConfig.adAccountId}?fields=name,account_status&access_token=${tokenConfig.accessToken}`,
      { signal: AbortSignal.timeout(8000) }
    );

    const data = await res.json() as {
      name?: string;
      account_status?: number;
      error?: { message: string; code: number };
    };

    const valid = res.ok && !data.error;

    // Atualizar status no banco
    const supabase = createServerSupabaseClient();
    await supabase
      .from('ai_provider_config')
      .update({
        meta_token_valid: valid,
        meta_token_last_checked: new Date().toISOString(),
        meta_token_error: data.error?.message ?? null,
      })
      .eq('tenant_id', tenantId);

    return {
      valid,
      accountName: data.name,
      tokenType: tokenConfig.tokenType,
      error: data.error?.message,
    };
  } catch (err) {
    return { valid: false, error: String(err) };
  }
}

/**
 * Salva um System User Token para o tenant.
 * Verifica o token via Graph API antes de persistir.
 */
export async function salvarSystemUserToken(
  tenantId: string,
  params: {
    systemUserToken: string;
    businessId?: string;
    appId?: string;
    pageId?: string;
    pixelId?: string;
  }
): Promise<{ ok: boolean; accountName?: string; error?: string }> {
  const supabase = createServerSupabaseClient();

  // Verificar token antes de salvar
  const testRes = await fetch(
    `${META_BASE}/me?fields=name&access_token=${params.systemUserToken}`,
    { signal: AbortSignal.timeout(8000) }
  );
  const testData = await testRes.json() as { name?: string; error?: { message: string } };

  if (!testRes.ok || testData.error) {
    return { ok: false, error: testData.error?.message ?? 'Token inválido' };
  }

  await supabase
    .from('ai_provider_config')
    .upsert({
      tenant_id: tenantId,
      meta_system_user_token: params.systemUserToken,
      meta_token_type: 'system_user',
      meta_business_id: params.businessId ?? null,
      meta_app_id: params.appId ?? null,
      meta_page_id: params.pageId ?? null,
      meta_pixel_id: params.pixelId ?? null,
      meta_token_valid: true,
      meta_token_last_checked: new Date().toISOString(),
      meta_token_error: null,
    }, { onConflict: 'tenant_id' });

  return { ok: true, accountName: testData.name };
}
