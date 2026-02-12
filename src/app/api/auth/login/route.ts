import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * POST /api/auth/login
 * Login com email e senha via Supabase Auth.
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email e senha são obrigatórios' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      return NextResponse.json(
        { error: 'Credenciais inválidas' },
        { status: 401 }
      );
    }

    // Buscar dados do usuário e tenant
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*, tenant:tenants(*)')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Usuário não encontrado no sistema' },
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
      },
      tenant: profile.tenant,
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_at: authData.session.expires_at,
    });
  } catch {
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
