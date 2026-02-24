/**
 * GET /api/extension/quick-replies
 * 
 * Endpoint exclusivo para a extensão Chrome do VEXX CRM.
 * Retorna as respostas rápidas do tenant autenticado.
 * 
 * Auth: Bearer token (JWT do Supabase) via Authorization header
 * CORS: Permite origem da extensão Chrome
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

// Headers CORS para a extensão Chrome
function corsHeaders(req: NextRequest) {
  const origin = req.headers.get('origin') || '';
  // Permitir extensões Chrome (chrome-extension://) e o próprio app
  const allowed =
    origin.startsWith('chrome-extension://') ||
    origin.includes('vexxcrm.netlify.app') ||
    origin.includes('localhost');

  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-tenant-id',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function GET(req: NextRequest) {
  const headers = corsHeaders(req);

  try {
    // 1. Extrair token JWT do header Authorization
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401, headers });
    }
    const token = authHeader.replace('Bearer ', '');

    // 2. Validar token via Supabase Auth
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido ou expirado' }, { status: 401, headers });
    }

    // 3. Buscar tenant_id do usuário
    const supabase = createServerSupabaseClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404, headers });
    }

    const tenantId = profile.tenant_id;

    // 4. Buscar respostas rápidas do tenant
    const { data: quickReplies, error: qrError } = await supabase
      .from('quick_replies')
      .select('id, shortcut, title, content, category, use_count')
      .eq('tenant_id', tenantId)
      .order('use_count', { ascending: false })  // Mais usadas primeiro
      .order('title');

    if (qrError) {
      return NextResponse.json({ error: 'Erro ao buscar respostas rápidas' }, { status: 500, headers });
    }

    return NextResponse.json({
      quickReplies: quickReplies || [],
      total: quickReplies?.length || 0,
    }, { headers });

  } catch (error) {
    console.error('[Extension API] Erro:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500, headers });
  }
}
