// Serviço de gerenciamento do token de acesso Meta (Facebook/Instagram).
// resolverTokenMeta  — busca o token salvo no banco para o tenant.
// verificarTokenMeta — valida o token chamando a Meta Debug Token API.

import { createServerSupabaseClient } from '@/lib/supabase';

const META_TOKEN_DEBUG = 'https://graph.facebook.com/v19.0/debug_token';

/* ─── Tipos ────────────────────────────────────────────────────────────────── */

export interface MetaTokenInfo {
  token: string;
  account_id: string | null;
  page_id: string | null;
  expires_at: string | null;
}

export interface MetaTokenStatus {
  valido: boolean;
  expira_em: string | null;        // ISO timestamp ou null se permanente
  scopes: string[];
  app_id: string | null;
  erro?: string;
}

/* ─── resolverTokenMeta ─────────────────────────────────────────────────────── */

/**
 * Busca o token Meta salvo em ai_provider_config para o tenant.
 * Usa o SERVICE client (bypassa RLS) — chamado internamente pelo servidor.
 *
 * @throws Error se não houver token configurado
 */
export async function resolverTokenMeta(tenantId: string): Promise<MetaTokenInfo> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('ai_provider_config')
    .select('meta_access_token, meta_ad_account_id, meta_page_id, meta_token_expires_at')
    .eq('tenant_id', tenantId)
    .single();

  if (error || !data?.meta_access_token) {
    throw new Error('Token Meta não configurado. Configure em Configurações → Time de IAs.');
  }

  return {
    token:      data.meta_access_token,
    account_id: data.meta_ad_account_id ?? null,
    page_id:    data.meta_page_id ?? null,
    expires_at: data.meta_token_expires_at ?? null,
  };
}

/* ─── verificarTokenMeta ────────────────────────────────────────────────────── */

/**
 * Verifica a validade de um token Meta chamando a Debug Token API.
 * Requer um App Access Token (APP_ID|APP_SECRET) no env para usar como input_token.
 *
 * Se META_APP_SECRET não estiver configurado, retorna validação superficial
 * (apenas checa se o token existe).
 */
export async function verificarTokenMeta(token: string): Promise<MetaTokenStatus> {
  const appId     = process.env.META_APP_ID     || process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  // Sem app credentials não conseguimos chamar a Debug Token API
  if (!appId || !appSecret) {
    return {
      valido:     true,
      expira_em:  null,
      scopes:     [],
      app_id:     null,
    };
  }

  const appAccessToken = `${appId}|${appSecret}`;

  try {
    const res = await fetch(
      `${META_TOKEN_DEBUG}?input_token=${token}&access_token=${encodeURIComponent(appAccessToken)}`
    );

    if (!res.ok) {
      return {
        valido:    false,
        expira_em: null,
        scopes:    [],
        app_id:    null,
        erro:      `Meta API respondeu com HTTP ${res.status}`,
      };
    }

    const body = await res.json() as {
      data?: {
        is_valid:        boolean;
        expires_at?:     number;
        scopes?:         string[];
        app_id?:         string;
        error?:          { message: string };
      };
    };

    const d = body.data;
    if (!d) {
      return { valido: false, expira_em: null, scopes: [], app_id: null, erro: 'Resposta inválida da Meta API' };
    }

    return {
      valido:    d.is_valid,
      expira_em: d.expires_at ? new Date(d.expires_at * 1000).toISOString() : null,
      scopes:    d.scopes ?? [],
      app_id:    d.app_id ?? null,
      erro:      d.error?.message,
    };
  } catch (err) {
    return {
      valido:    false,
      expira_em: null,
      scopes:    [],
      app_id:    null,
      erro:      err instanceof Error ? err.message : 'Erro ao verificar token',
    };
  }
}
