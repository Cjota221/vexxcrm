import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import type { TemplateBlock } from '@/types';

/**
 * GET /api/templates
 * Lista todos os templates compostos do tenant.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';

    let query = supabase
      .from('composite_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (q) {
      query = query.ilike('name', `%${q}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error: any) {
    console.error('[GET /api/templates]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/templates
 * Cria um novo template composto.
 * Body: { name, description?, blocks: TemplateBlock[] }
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId, userId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    const body = await request.json();
    const { name, description, blocks } = body as {
      name: string;
      description?: string;
      blocks: TemplateBlock[];
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 });
    }
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return NextResponse.json({ error: 'Template precisa ter ao menos 1 bloco' }, { status: 400 });
    }

    // Extrair variáveis {{var}} de todos os blocos de texto
    const allText = blocks.map(b => b.content || '').join(' ');
    const variables = [...new Set([...allText.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))];

    // Garantir ordem e delay padrão
    const normalizedBlocks = blocks.map((b, i) => ({
      ...b,
      order: b.order ?? i,
      delay_ms: b.delay_ms ?? (i === 0 ? 0 : 1000),
    }));

    const { data, error } = await supabase
      .from('composite_templates')
      .insert({
        tenant_id: tenantId,
        name: name.trim(),
        description: description?.trim() || null,
        blocks: normalizedBlocks,
        variables,
        created_by: userId,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (error: any) {
    console.error('[POST /api/templates]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
