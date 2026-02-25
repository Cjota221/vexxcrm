/**
 * POST /api/extension/client/[id]/note
 * 
 * Salva uma nota rápida sobre um cliente, feita pelo atendente via extensão Chrome.
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
  { params }: { params: Promise<{ id: string }> }
) {
  const headers = corsHeaders(req);

  try {
    const { id: clientId } = await params;

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

    const body = await req.json();
    const note = (body.note || '').trim();

    if (!note) {
      return NextResponse.json({ error: 'Nota não pode estar vazia' }, { status: 400, headers });
    }

    // Verificar que o cliente pertence ao tenant
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .eq('id', clientId)
      .single();

    if (!client) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404, headers });
    }

    // Salvar nota
    const { data: savedNote, error: noteError } = await supabase
      .from('client_notes')
      .insert({
        tenant_id:  profile.tenant_id,
        client_id:  clientId,
        content:    note,
        created_by: user.id,
        source:     'extension',  // Marcar que veio da extensão
      })
      .select()
      .single();

    if (noteError) {
      return NextResponse.json({ error: 'Erro ao salvar nota' }, { status: 500, headers });
    }

    return NextResponse.json({ ok: true, note: savedNote }, { headers });

  } catch (error) {
    console.error('[Extension API] /note error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500, headers });
  }
}
