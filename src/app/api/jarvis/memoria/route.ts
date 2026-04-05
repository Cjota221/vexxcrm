/**
 * GET  /api/jarvis/memoria          → lista memórias do tenant
 * POST /api/jarvis/memoria          → registra nova memória
 * PATCH /api/jarvis/memoria?id=...  → atualiza resultado/aprendizado
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(req);
    const supabase = createServerSupabaseClient();
    const { searchParams } = req.nextUrl;
    const tipo = searchParams.get('tipo');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);

    let query = supabase
      .from('jarvis_memoria')
      .select('id, tipo, referencia_id, titulo, contexto, resultado, aprendizado, criado_em')
      .eq('tenant_id', tenantId)
      .order('criado_em', { ascending: false })
      .limit(limit);

    if (tipo) query = query.eq('tipo', tipo);

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
      tipo: string;
      referencia_id?: string;
      titulo: string;
      contexto: Record<string, unknown>;
      resultado?: Record<string, unknown> | null;
      aprendizado?: string | null;
    };

    if (!body.tipo || !body.titulo || !body.contexto) {
      return NextResponse.json({ error: 'tipo, titulo e contexto são obrigatórios' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from('jarvis_memoria')
      .insert({
        tenant_id: tenantId,
        tipo: body.tipo,
        referencia_id: body.referencia_id ?? null,
        titulo: body.titulo,
        contexto: body.contexto,
        resultado: body.resultado ?? null,
        aprendizado: body.aprendizado ?? null,
      })
      .select('id, tipo, titulo')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(req);
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });

    const body = await req.json() as {
      resultado?: Record<string, unknown>;
      aprendizado?: string;
    };

    const supabase = createServerSupabaseClient();

    const updates: Record<string, unknown> = {};
    if (body.resultado !== undefined) updates.resultado = body.resultado;
    if (body.aprendizado !== undefined) updates.aprendizado = body.aprendizado;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
    }

    const { error } = await supabase
      .from('jarvis_memoria')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
