/**
 * POST /api/extension/quick-replies/[id]/use
 * 
 * Incrementa o contador de uso de uma resposta rápida.
 * Usado pela extensão ao inserir uma resposta no WhatsApp.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

function corsHeaders(req: NextRequest) {
  const origin = req.headers.get('origin') || '';
  const allowed = origin.startsWith('chrome-extension://') || origin.includes('vexxcrm') || origin.includes('localhost');
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-tenant-id',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const headers = corsHeaders(req);

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401, headers });
    }
    const token = authHeader.replace('Bearer ', '');

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401, headers });
    }

    const supabase = createServerSupabaseClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404, headers });
    }

    // Incrementar use_count
    await supabase.rpc('increment_quick_reply_use', {
      p_id: params.id,
      p_tenant_id: profile.tenant_id,
    });

    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ ok: true }, { headers }); // Falha silenciosa — não crítico
  }
}
