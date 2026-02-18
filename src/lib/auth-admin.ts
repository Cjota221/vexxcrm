/**
 * Helper de autenticação para rotas admin.
 * Centraliza: validação de token, busca de profile, tenant e facilzap_token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';

export interface AuthContext {
  supabase: ReturnType<typeof createServerSupabaseClient>;
  userId: string;
  tenantId: string;
  facilzapToken: string | null;
}

/**
 * Valida auth, retorna contexto ou NextResponse de erro.
 * Usa headers x-tenant-id e x-user-id injetados pelo middleware quando disponíveis.
 */
export async function authenticateAdmin(
  request: NextRequest
): Promise<AuthContext | NextResponse> {
  const supabase = createServerSupabaseClient();
  
  // Tentar usar headers do middleware primeiro (mais rápido)
  const tenantIdFromHeader = request.headers.get('x-tenant-id');
  const userIdFromHeader = request.headers.get('x-user-id');
  
  if (tenantIdFromHeader && userIdFromHeader) {
    // Middleware já validou — buscar apenas o facilzap_token
    const { data: tenant } = await supabase
      .from('tenants')
      .select('facilzap_token')
      .eq('id', tenantIdFromHeader)
      .single();

    return {
      supabase,
      userId: userIdFromHeader,
      tenantId: tenantIdFromHeader,
      facilzapToken: tenant?.facilzap_token || null,
    };
  }
  
  // Fallback: validação manual (para rotas públicas ou sem middleware)
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const supabaseAuth = createAuthenticatedClient(token);

  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.tenant_id) {
    return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 403 });
  }

  // Buscar token FacilZap
  const { data: tenant } = await supabase
    .from('tenants')
    .select('facilzap_token')
    .eq('id', profile.tenant_id)
    .single();

  return {
    supabase,
    userId: user.id,
    tenantId: profile.tenant_id,
    facilzapToken: tenant?.facilzap_token || null,
  };
}
