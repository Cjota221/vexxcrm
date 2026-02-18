import { NextRequest } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';

/**
 * Resultado da autenticação de uma API route.
 */
export interface AuthenticatedRequest {
  userId: string;
  tenantId: string;
  profile: {
    id: string;
    tenant_id: string;
    full_name: string;
    email: string;
    role: string;
  };
}

/**
 * Helper reutilizável para autenticar e extrair tenant_id em API routes.
 * 
 * Tenta obter o tenant_id de 3 formas (em ordem de prioridade):
 * 1. Header `x-tenant-id` (injetado pelo middleware)
 * 2. Token JWT no header Authorization
 * 3. Cookie `sb-access-token`
 * 
 * @param request - NextRequest da API route
 * @returns AuthenticatedRequest com userId, tenantId e profile
 * @throws Error se não autenticado ou tenant_id não encontrado
 * 
 * @example
 * export async function GET(request: NextRequest) {
 *   try {
 *     const { tenantId, profile } = await getTenantFromRequest(request);
 *     
 *     // Usar tenantId para buscar dados isolados
 *     const { data } = await supabase
 *       .from('clients')
 *       .select('*')
 *       .eq('tenant_id', tenantId);
 *     
 *     return NextResponse.json({ data });
 *   } catch (error) {
 *     return NextResponse.json(
 *       { error: error.message },
 *       { status: 401 }
 *     );
 *   }
 * }
 */
export async function getTenantFromRequest(
  request: NextRequest
): Promise<AuthenticatedRequest> {
  // 1. Tentar obter do header (injetado pelo middleware)
  const tenantIdFromHeader = request.headers.get('x-tenant-id');
  const userIdFromHeader = request.headers.get('x-user-id');
  
  if (tenantIdFromHeader && userIdFromHeader) {
    // Middleware já validou — buscar profile pelo user_id (seguro para multi-user tenants)
    const supabase = createServerSupabaseClient();
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, tenant_id, full_name, email, role')
      .eq('id', userIdFromHeader)
      .single();

    if (error || !profile) {
      throw new Error('Sessão inválida');
    }

    return {
      userId: profile.id,
      tenantId: profile.tenant_id,
      profile,
    };
  }

  // 2. Tentar obter do token JWT
  const token = 
    request.headers.get('Authorization')?.replace('Bearer ', '') ||
    request.cookies.get('sb-access-token')?.value;

  if (!token) {
    throw new Error('Token não fornecido');
  }

  // Validar token usando anon key client (service client pode rejeitar tokens de usuário)
  const supabaseAuth = createAuthenticatedClient(token);
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    throw new Error('Token inválido ou expirado');
  }

  // Buscar profile e tenant_id usando service client (bypassa RLS)
  const supabase = createServerSupabaseClient();
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, tenant_id, full_name, email, role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    throw new Error('Perfil não encontrado');
  }

  return {
    userId: profile.id,
    tenantId: profile.tenant_id,
    profile,
  };
}

/**
 * Busca configurações do tenant (tokens de integração, etc).
 * 
 * @param tenantId - UUID do tenant
 * @returns Objeto tenant com evolution_api_key, facilzap_token, openai_api_key, etc
 * @throws Error se tenant não encontrado
 * 
 * @example
 * const { tenantId } = await getTenantFromRequest(request);
 * const tenant = await getTenantConfig(tenantId);
 * 
 * if (!tenant.facilzap_token) {
 *   return NextResponse.json(
 *     { error: 'FacilZap não configurado' },
 *     { status: 400 }
 *   );
 * }
 * 
 * // Usar tenant.facilzap_token para chamadas à API
 */
export async function getTenantConfig(tenantId: string) {
  const supabase = createServerSupabaseClient();

  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, name, slug, evolution_api_url, evolution_api_key, evolution_instance, facilzap_token, openai_api_key')
    .eq('id', tenantId)
    .single();

  if (error || !tenant) {
    throw new Error('Tenant não encontrado');
  }

  return tenant;
}

/**
 * Valida se o tenant possui uma integração configurada.
 * 
 * @param tenantId - UUID do tenant
 * @param integration - Nome da integração ('facilzap', 'evolution', 'openai')
 * @returns true se configurada, false caso contrário
 * 
 * @example
 * const { tenantId } = await getTenantFromRequest(request);
 * 
 * if (!await hasIntegration(tenantId, 'facilzap')) {
 *   return NextResponse.json(
 *     { error: 'Configure a integração FacilZap em Configurações' },
 *     { status: 400 }
 *   );
 * }
 */
export async function hasIntegration(
  tenantId: string,
  integration: 'facilzap' | 'evolution' | 'openai'
): Promise<boolean> {
  try {
    const tenant = await getTenantConfig(tenantId);

    switch (integration) {
      case 'facilzap':
        return !!tenant.facilzap_token;
      case 'evolution':
        return !!(tenant.evolution_api_url && tenant.evolution_api_key);
      case 'openai':
        return !!tenant.openai_api_key;
      default:
        return false;
    }
  } catch {
    return false;
  }
}
