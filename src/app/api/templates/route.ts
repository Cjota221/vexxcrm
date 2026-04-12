import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * GET /api/templates
 * Lista todos os templates ativos do tenant.
 * Retorna no formato { templates: [{ id, name, variables }] }
 * compatível com o EmbeddedCampaignPanel.
 */
export async function GET(request: NextRequest) {
  console.warn('[DEPRECATED] Esta rota v1 será removida. Use /api/v2/templates');
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';

    let query = supabase
      .from('message_templates')
      .select('id, nome, variaveis, blocos, descricao, tags, uso_count, status')
      .eq('tenant_id', tenantId)
      .eq('status', 'ativo')
      .order('uso_count', { ascending: false });

    if (q) {
      query = query.ilike('nome', `%${q}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Mapear para o formato esperado pelo EmbeddedCampaignPanel
    const templates = (data || []).map(t => ({
      id: t.id,
      name: t.nome,
      variables: t.variaveis ?? [],
      description: t.descricao,
      tags: t.tags ?? [],
      uso_count: t.uso_count ?? 0,
      // blocos inclusos para quem precisar renderizar preview
      blocks: t.blocos ?? [],
    }));

    return NextResponse.json({ templates, data: templates });
  } catch (error: any) {
    console.error('[GET /api/templates]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/templates
 * Cria um novo template de mensagem.
 * Body: { name, description?, blocks: Array<{ tipo, conteudo, ... }> }
 */
export async function POST(request: NextRequest) {
  console.warn('[DEPRECATED] Esta rota v1 será removida. Use /api/v2/templates');
  try {
    const { tenantId, userId } = await getTenantFromRequest(request);
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

    // Extrair variáveis {{var}} de todos os blocos de texto
    const allText = blocks.map(b => (b.content as string) || (b.conteudo as string) || '').join(' ');
    const variaveis = [...new Set([...allText.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))];

    // Detectar tipo do template
    const hasImage = blocks.some(b => b.tipo === 'imagem' || b.type === 'image');
    const tipo = hasImage ? 'composto' : 'texto';

    // Garantir ordem
    const normalizedBlocks = blocks.map((b, i) => ({
      ...b,
      order: (b.order as number) ?? i,
    }));

    const { data, error } = await supabase
      .from('message_templates')
      .insert({
        tenant_id: tenantId,
        nome: name.trim(),
        descricao: description?.trim() || null,
        blocos: normalizedBlocks,
        variaveis,
        tipo,
        created_by: userId,
        status: 'ativo',
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
