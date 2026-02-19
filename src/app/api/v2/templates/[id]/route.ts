import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

type Params = Promise<{ id: string }>;

/**
 * GET /api/v2/templates/[id]
 */
export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const { id } = await params;

    const { data, error } = await supabase
      .from('message_templates')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('id', id)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 });
    return NextResponse.json({ template: data });
  } catch (err) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/**
 * PATCH /api/v2/templates/[id]
 * Body: campos parciais do template
 */
export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const { id } = await params;

    const body = await request.json() as Record<string, unknown>;

    // Re-detectar variáveis se blocos foram alterados
    if (Array.isArray(body.blocos)) {
      const textoBlocos = (body.blocos as Array<{ tipo: string; conteudo?: { texto_raw?: string } }>)
        .filter(b => b.tipo === 'texto')
        .map(b => b.conteudo?.texto_raw ?? '')
        .join(' ');
      body.variaveis = [...new Set((textoBlocos.match(/\{\{[^}]+\}\}/g) ?? []))];
    }

    // Proteger campos somente-leitura
    delete body.id;
    delete body.tenant_id;
    delete body.created_by;
    delete body.created_at;
    delete body.uso_count;
    delete body.ultima_vez_usado;

    const { data, error } = await supabase
      .from('message_templates')
      .update(body)
      .eq('tenant_id', profile.tenant_id)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[TEMPLATE_UPDATE_ERROR]', error);
      return NextResponse.json({ error: error.message, hint: error.hint }, { status: 400 });
    }

    return NextResponse.json({ template: data });
  } catch (err) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/**
 * DELETE /api/v2/templates/[id]
 * Soft delete — altera status para 'arquivado'
 */
export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const { id } = await params;

    const { error } = await supabase
      .from('message_templates')
      .update({ status: 'arquivado' })
      .eq('tenant_id', profile.tenant_id)
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
