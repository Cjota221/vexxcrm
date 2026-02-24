/**
 * POST /api/auth/extension-login
 * 
 * Endpoint de login para a extensão Chrome.
 * Recebe email + senha, retorna JWT token do Supabase.
 * 
 * O token é armazenado no chrome.storage.local (isolado por extensão).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';

function corsHeaders(req: NextRequest) {
  const origin = req.headers.get('origin') || '';
  const allowed = origin.startsWith('chrome-extension://') || origin.includes('vexxcrm') || origin.includes('localhost');
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);

  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400, headers });
    }

    // Autenticar via Supabase Auth
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });

    if (error || !data.user || !data.session) {
      return NextResponse.json(
        { error: 'Credenciais inválidas. Verifique seu email e senha.' },
        { status: 401, headers }
      );
    }

    // Buscar tenant_id do usuário
    const supabase = createServerSupabaseClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id, full_name, role')
      .eq('id', data.user.id)
      .single();

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: 'Conta sem tenant configurado' }, { status: 403, headers });
    }

    // Retornar token e dados mínimos
    return NextResponse.json({
      token:    data.session.access_token,
      tenantId: profile.tenant_id,
      user: {
        id:       data.user.id,
        email:    data.user.email,
        name:     profile.full_name,
        role:     profile.role,
      },
    }, { headers });

  } catch (error) {
    console.error('[Extension Login] Erro:', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500, headers });
  }
}
