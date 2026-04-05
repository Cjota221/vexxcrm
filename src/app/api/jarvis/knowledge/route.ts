/**
 * GET  /api/jarvis/knowledge          → lista documentos ativos do tenant
 * POST /api/jarvis/knowledge          → adiciona novo documento
 * DELETE /api/jarvis/knowledge?id=... → remove documento por ID
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { CONHECIMENTO_INICIAL } from '@/lib/jarvis/seed-knowledge';

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(req);
    const supabase = createServerSupabaseClient();
    const { searchParams } = req.nextUrl;
    const categoria = searchParams.get('categoria');

    let query = supabase
      .from('jarvis_knowledge')
      .select('id, titulo, conteudo, categoria, fonte, ativo, criado_em, atualizado_em')
      .eq('tenant_id', tenantId)
      .eq('ativo', true)
      .order('criado_em', { ascending: false });

    if (categoria) query = query.eq('categoria', categoria);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(req);
    const body = await req.json() as {
      titulo?: string;
      conteudo?: string;
      categoria?: string;
      fonte?: string;
      seed?: boolean; // true = popular com seed inicial
    };

    const supabase = createServerSupabaseClient();

    // Modo seed: popular base de conhecimento inicial
    if (body.seed) {
      const rows = CONHECIMENTO_INICIAL.map((k) => ({
        tenant_id: tenantId,
        titulo: k.titulo,
        conteudo: k.conteudo,
        categoria: k.categoria,
        fonte: k.fonte ?? 'seed_inicial',
        ativo: true,
      }));

      const { data, error } = await supabase
        .from('jarvis_knowledge')
        .upsert(rows, { onConflict: 'tenant_id,titulo' })
        .select('id, titulo, categoria');

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, seeded: data?.length ?? rows.length });
    }

    if (!body.titulo || !body.conteudo || !body.categoria) {
      return NextResponse.json({ error: 'titulo, conteudo e categoria são obrigatórios' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('jarvis_knowledge')
      .insert({
        tenant_id: tenantId,
        titulo: body.titulo,
        conteudo: body.conteudo,
        categoria: body.categoria,
        fonte: body.fonte ?? null,
        ativo: true,
      })
      .select('id, titulo, categoria')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(req);
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });

    const supabase = createServerSupabaseClient();

    // Soft delete
    const { error } = await supabase
      .from('jarvis_knowledge')
      .update({ ativo: false, atualizado_em: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
