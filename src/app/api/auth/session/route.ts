import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';

/**
 * GET /api/auth/session
 * Retorna dados do usuário e tenant da sessão ativa.
 */
export async function GET(request: NextRequest) {
  console.log('🔑 API Session: Request recebida');
  try {
    const authorization = request.headers.get('Authorization');
    console.log('🔑 API Session: Authorization header:', authorization ? 'Presente' : 'Ausente');
    
    if (!authorization) {
      console.error('🔑 API Session: Token não fornecido');
      return NextResponse.json(
        { error: 'Token não fornecido' },
        { status: 401 }
      );
    }

    const token = authorization.replace('Bearer ', '');
    console.log('🔑 API Session: Token extraído:', token.substring(0, 20) + '...');
    
    const supabaseAuth = createAuthenticatedClient(token);
    const supabase = createServerSupabaseClient();
    console.log('🔑 API Session: Supabase client criado');

    // Verificar token
    console.log('🔑 API Session: Verificando token no Supabase...');
    const { data: { user: authUser }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !authUser) {
      console.error('🔑 API Session: Erro de autenticação:', authError);
      return NextResponse.json(
        { error: 'Sessão inválida ou expirada' },
        { status: 401 }
      );
    }

    console.log('🔑 API Session: Usuário autenticado:', authUser.email);

    // Buscar dados do usuário e tenant
    console.log('🔑 API Session: Buscando profile para user_id:', authUser.id);
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*, tenant:tenants(*)')
      .eq('id', authUser.id)
      .single();

    if (profileError) {
      console.error('🔑 API Session: Erro ao buscar profile:', profileError);
      return NextResponse.json(
        { error: `Erro ao buscar perfil: ${profileError.message}` },
        { status: 500 }
      );
    }

    if (!profile) {
      console.error('🔑 API Session: Profile não encontrado para user:', authUser.id);
      return NextResponse.json(
        { error: 'Perfil de usuário não encontrado. Entre em contato com o suporte.' },
        { status: 404 }
      );
    }

    console.log('✅ API Session: Profile encontrado:', profile.full_name, '- Tenant:', profile.tenant?.name);

    return NextResponse.json({
      user: {
        id: profile.id,
        tenant_id: profile.tenant_id,
        email: profile.email,
        name: profile.full_name,
        role: profile.role,
        avatar_url: profile.avatar_url,
        is_active: profile.is_active,
      },
      tenant: profile.tenant,
      access_token: token,
    }, {
      headers: {
        // Cache privado por 5 minutos — o token ainda identifica o usuário,
        // mas evita 4+ chamadas desnecessárias no mesmo segundo (mount race).
        'Cache-Control': 'private, max-age=300, stale-while-revalidate=60',
      },
    });
  } catch (err) {
    console.error('🔑 API Session: Erro fatal:', err);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
