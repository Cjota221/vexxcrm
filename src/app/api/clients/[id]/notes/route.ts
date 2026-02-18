import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';

/**
 * GET /api/clients/[id]/notes
 * Lista notas de um cliente.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authorization.replace('Bearer ', '');
    const supabaseAuth = createAuthenticatedClient(token);
    const supabase = createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 403 });
    }

    const { id } = await params;

    const { data: notes, error } = await supabase
      .from('client_notes')
      .select('id, content, type, created_by, created_at')
      .eq('tenant_id', profile.tenant_id)
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('❌ Notes API error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: notes || [] });
  } catch (error: any) {
    console.error('❌ Notes API error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/**
 * POST /api/clients/[id]/notes
 * Cria uma nova nota para o cliente.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authorization.replace('Bearer ', '');
    const supabaseAuth = createAuthenticatedClient(token);
    const supabase = createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { content, type = 'note' } = body;

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Conteúdo é obrigatório' }, { status: 400 });
    }

    const { data: note, error } = await supabase
      .from('client_notes')
      .insert({
        tenant_id: profile.tenant_id,
        client_id: id,
        content: content.trim(),
        type,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Notes API insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: note }, { status: 201 });
  } catch (error: any) {
    console.error('❌ Notes API error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/**
 * DELETE /api/clients/[id]/notes?noteId=xxx
 * Deleta uma nota.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authorization.replace('Bearer ', '');
    const supabaseAuth = createAuthenticatedClient(token);
    const supabase = createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 403 });
    }

    const { id } = await params;
    const noteId = new URL(request.url).searchParams.get('noteId');

    if (!noteId) {
      return NextResponse.json({ error: 'noteId é obrigatório' }, { status: 400 });
    }

    const { error } = await supabase
      .from('client_notes')
      .delete()
      .eq('id', noteId)
      .eq('tenant_id', profile.tenant_id)
      .eq('client_id', id);

    if (error) {
      console.error('❌ Notes API delete error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Notes API error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
