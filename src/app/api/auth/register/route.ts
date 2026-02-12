import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * POST /api/auth/register
 * Registra novo usuário: cria conta no Supabase Auth + Tenant + Profile.
 */
export async function POST(request: NextRequest) {
  try {
    const { storeName, fullName, email, password } = await request.json();

    // Validações
    if (!storeName || !fullName || !email || !password) {
      return NextResponse.json(
        { error: 'Todos os campos são obrigatórios' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'A senha deve ter pelo menos 6 caracteres' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // 1. Criar usuário no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Confirmar email automaticamente em dev
      user_metadata: {
        full_name: fullName,
        store_name: storeName,
      },
    });

    if (authError) {
      // Tratar erros comuns
      if (authError.message.includes('already registered') || authError.message.includes('already been registered')) {
        return NextResponse.json(
          { error: 'Este e-mail já está cadastrado' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Erro ao criar usuário' },
        { status: 500 }
      );
    }

    // 2. Gerar slug único do tenant
    const slug = storeName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remover acentos
      .replace(/[^a-z0-9]+/g, '-')     // trocar caracteres especiais por -
      .replace(/^-|-$/g, '');           // remover - do início/fim

    // Verificar se slug já existe
    const { data: existingTenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    const finalSlug = existingTenant
      ? `${slug}-${Date.now().toString(36)}`
      : slug;

    // 3. Criar Tenant
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        name: storeName,
        slug: finalSlug,
        plan: 'free',
      })
      .select()
      .single();

    if (tenantError || !tenant) {
      // Rollback: deletar usuário auth se tenant falhou
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: 'Erro ao criar organização. Tente novamente.' },
        { status: 500 }
      );
    }

    // 4. Criar Profile (vinculado ao Auth user e ao Tenant)
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        tenant_id: tenant.id,
        full_name: fullName,
        email: email,
        role: 'owner',
      });

    if (profileError) {
      // Rollback
      await supabase.from('tenants').delete().eq('id', tenant.id);
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: 'Erro ao criar perfil. Tente novamente.' },
        { status: 500 }
      );
    }

    // 5. Criar Tenant Config padrão
    await supabase
      .from('tenant_config')
      .insert({
        tenant_id: tenant.id,
      });

    return NextResponse.json({
      message: 'Conta criada com sucesso!',
      user: {
        id: authData.user.id,
        email: email,
        name: fullName,
      },
      tenant: {
        id: tenant.id,
        name: storeName,
        slug: finalSlug,
      },
    }, { status: 201 });

  } catch (err) {
    console.error('Register error:', err);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
