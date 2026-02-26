import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';

type Params = { params: Promise<{ id: string }> };

/**
 * PUT /api/templates/[id]
 * Atualiza nome, descrição e blocos de um template existente.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const { id } = await params;
    const supabase = createServerSupabaseClient();

    const body = await request.json();
    const { name, description, blocks } = body as {
      name: string;
      description?: string;
      blocks: Array<Record<string, unknown>>;
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 });
    }
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return NextResponse.json({ error: 'Template precisa ter ao menos 1 bloco' }, { status: 400 });
    }

    // Extrair variáveis dos blocos de texto
    const allText = blocks.map(b => (b.content as string) || '').join(' ');
    const variaveis = [...new Set([...allText.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))];

    const hasImage = blocks.some(b => b.type === 'image');
    const tipo = hasImage ? 'composto' : 'texto';

    const normalizedBlocks = blocks.map((b, i) => ({
      ...b,
      order: (b.order as number) ?? i,
    }));

    const { data, error } = await supabase
      .from('message_templates')
      .update({
        nome: name.trim(),
        descricao: description?.trim() || null,
        blocos: normalizedBlocks,
        variaveis,
        tipo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 });

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('[PUT /api/templates/[id]]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/templates/[id]
 * Arquiva (soft-delete) um template alterando status para 'inativo'.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const { id } = await params;
    const supabase = createServerSupabaseClient();

    const { error } = await supabase
      .from('message_templates')
      .update({ status: 'inativo', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[DELETE /api/templates/[id]]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
