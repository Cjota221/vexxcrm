import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * GET /api/auth/session
 * Retorna dados do usuário e tenant da sessão ativa.
 */
export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) {
      return NextResponse.json(
        { error: 'Token não fornecido' },
        { status: 401 }
      );
    }

    const token = authorization.replace('Bearer ', '');
    const supabase = createServerSupabaseClient();

    // Verificar token
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authUser) {
      return NextResponse.json(
        { error: 'Sessão inválida ou expirada' },
        { status: 401 }
      );
    }

    // Buscar dados do usuário e tenant
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*, tenant:tenants(*)')
      .eq('id', authUser.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

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
    });
  } catch {
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
