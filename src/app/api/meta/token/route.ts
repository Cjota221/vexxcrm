import { NextRequest, NextResponse } from 'next/server';
import { createServerClientFromCookies, createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { resolverTokenMeta, verificarTokenMeta } from '@/lib/services/meta-token.service';

/* ─── Helper: tenant a partir de cookies (sem Authorization header) ─────────── */

/**
 * Obtém o tenant_id lendo a sessão do usuário via cookies SSR.
 * Usado quando a rota é chamada pelo frontend sem enviar o header Authorization
 * (ex: redirect OAuth do Meta que cai direto nesta rota).
 */
async function getTenantIdFromCookies(): Promise<string | null> {
  try {
    const supabase = await createServerClientFromCookies();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Buscar tenant_id via service client (bypassa RLS)
    const service = createServerSupabaseClient();
    const { data } = await service
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    return data?.tenant_id ?? null;
  } catch {
    return null;
  }
}

/* ─── GET /api/meta/token ────────────────────────────────────────────────────
   Retorna o status do token Meta configurado para o tenant.
   Resposta: { configurado, valido, expira_em, scopes, account_id, page_id }
   ─────────────────────────────────────────────────────────────────────────── */

export async function GET(request: NextRequest) {
  try {
    // Tenta Authorization header primeiro; cai para cookies se não houver
    let tenantId: string;
    try {
      const auth = await getTenantFromRequest(request);
      tenantId = auth.tenantId;
    } catch {
      const fromCookies = await getTenantIdFromCookies();
      if (!fromCookies) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
      }
      tenantId = fromCookies;
    }

    let tokenInfo;
    try {
      tokenInfo = await resolverTokenMeta(tenantId);
    } catch {
      return NextResponse.json({ configurado: false, valido: false });
    }

    const status = await verificarTokenMeta(tokenInfo.token);

    return NextResponse.json({
      configurado: true,
      valido:      status.valido,
      expira_em:   status.expira_em,
      scopes:      status.scopes,
      account_id:  tokenInfo.account_id,
      page_id:     tokenInfo.page_id,
      erro:        status.erro,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/* ─── POST /api/meta/token ───────────────────────────────────────────────────
   Salva ou atualiza o token Meta do tenant.
   Body: { access_token, account_id?, page_id? }
   ─────────────────────────────────────────────────────────────────────────── */

export async function POST(request: NextRequest) {
  try {
    let tenantId: string;
    try {
      const auth = await getTenantFromRequest(request);
      tenantId = auth.tenantId;
    } catch {
      const fromCookies = await getTenantIdFromCookies();
      if (!fromCookies) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
      }
      tenantId = fromCookies;
    }

    const body = await request.json() as {
      access_token: string;
      account_id?:  string;
      page_id?:     string;
    };

    if (!body.access_token) {
      return NextResponse.json({ error: 'access_token é obrigatório' }, { status: 400 });
    }

    // Verificar o token antes de salvar
    const status = await verificarTokenMeta(body.access_token);
    if (!status.valido && status.erro) {
      return NextResponse.json(
        { error: `Token inválido: ${status.erro}` },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Normalizar account_id: Meta exige prefixo "act_"
    const rawAccountId = body.account_id?.trim();
    const accountId = rawAccountId
      ? rawAccountId.startsWith('act_') ? rawAccountId : `act_${rawAccountId}`
      : undefined;

    const { error } = await supabase
      .from('ai_provider_config')
      .upsert(
        {
          tenant_id:             tenantId,
          meta_access_token:     body.access_token,
          ...(accountId           && { meta_ad_account_id:    accountId }),
          ...(body.page_id        && { meta_page_id:          body.page_id }),
          ...(status.expira_em    && { meta_token_expires_at: status.expira_em }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id' }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok:       true,
      valido:   status.valido,
      expira_em: status.expira_em,
      scopes:   status.scopes,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/* ─── DELETE /api/meta/token ─────────────────────────────────────────────────
   Remove o token Meta do tenant.
   ─────────────────────────────────────────────────────────────────────────── */

export async function DELETE(request: NextRequest) {
  try {
    let tenantId: string;
    try {
      const auth = await getTenantFromRequest(request);
      tenantId = auth.tenantId;
    } catch {
      const fromCookies = await getTenantIdFromCookies();
      if (!fromCookies) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
      }
      tenantId = fromCookies;
    }

    const supabase = createServerSupabaseClient();

    const { error } = await supabase
      .from('ai_provider_config')
      .update({
        meta_access_token:    null,
        meta_token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
