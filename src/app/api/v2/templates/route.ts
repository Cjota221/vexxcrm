import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * GET /api/v2/templates
 * Query: status?, tags?, busca?, limit?, page?
 */
export async function GET(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = profile.tenant_id;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? 'ativo';
    const busca  = searchParams.get('busca') ?? '';
    const tags   = searchParams.get('tags')?.split(',').filter(Boolean) ?? [];
    const limit  = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);
    const page   = Math.max(parseInt(searchParams.get('page') ?? '1'), 1);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('message_templates')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('uso_count', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== 'todos') query = query.eq('status', status);
    if (busca)              query = query.ilike('nome', `%${busca}%`);
    if (tags.length)        query = query.overlaps('tags', tags);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ templates: data ?? [], total: count ?? 0, page, limit });
  } catch (err) {
    console.error('[GET /api/v2/templates]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/**
 * POST /api/v2/templates
 * Body: { nome, descricao?, tags?, tipo, blocos, status? }
 */
export async function POST(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = profile.tenant_id;

    const body = await request.json() as {
      nome: string;
      descricao?: string;
      tags?: string[];
      tipo: 'texto' | 'midia' | 'composto';
      blocos: unknown[];
      status?: 'ativo' | 'rascunho';
    };

    if (!body.nome?.trim()) {
      return NextResponse.json({ error: 'Campo "nome" é obrigatório' }, { status: 400 });
    }
    if (!['texto', 'midia', 'composto'].includes(body.tipo)) {
      return NextResponse.json({ error: 'Tipo inválido. Use: texto | midia | composto' }, { status: 400 });
    }

    // Detectar variáveis automaticamente dos blocos de texto
    const textoBlocos = (body.blocos as Array<{ tipo: string; conteudo?: { texto_raw?: string; texto_formatado?: string } }>)
      .filter(b => b.tipo === 'texto')
      .map(b => b.conteudo?.texto_raw ?? b.conteudo?.texto_formatado ?? '')
      .join(' ');
    const variaveis = [...new Set((textoBlocos.match(/\{\{[^}]+\}\}/g) ?? []))];

    const { data, error } = await supabase
      .from('message_templates')
      .insert({
        tenant_id:  tenantId,
        created_by: profile.id,
        nome:       body.nome.trim(),
        descricao:  body.descricao ?? null,
        tags:       body.tags ?? [],
        tipo:       body.tipo,
        blocos:     body.blocos ?? [],
        variaveis,
        status:     body.status ?? 'ativo',
      })
      .select()
      .single();

    if (error) {
      console.error('[TEMPLATE_CREATE_ERROR]', { code: error.code, message: error.message, details: error.details, hint: error.hint });
      return NextResponse.json({ error: error.message, code: error.code, hint: error.hint }, { status: 400 });
    }

    return NextResponse.json({ template: data }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/v2/templates]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
