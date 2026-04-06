import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { META_BASE } from '@/lib/meta-config';

/**
 * GET /api/trafego/interests/biblioteca
 * Lista interesses da biblioteca com filtros opcionais.
 * Query params: categoria, aprovado_jarvis, q (busca por nome), limit, offset
 */
export async function GET(req: NextRequest) {
  try {
    await getTenantFromRequest(req); // autenticação
    const supabase = createServerSupabaseClient();

    const { searchParams } = new URL(req.url);
    const categoria = searchParams.get('categoria');
    const aprovado = searchParams.get('aprovado_jarvis');
    const q = searchParams.get('q');
    const limit = Math.min(Number(searchParams.get('limit') ?? '100'), 200);
    const offset = Number(searchParams.get('offset') ?? '0');

    let query = supabase
      .from('meta_interests_biblioteca')
      .select('*', { count: 'exact' })
      .eq('ativo', true)
      .order('nome', { ascending: true })
      .range(offset, offset + limit - 1);

    if (categoria) query = query.eq('categoria', categoria);
    if (aprovado === 'true')  query = query.eq('aprovado_jarvis', true);
    if (aprovado === 'false') query = query.eq('aprovado_jarvis', false);
    if (aprovado === 'null')  query = query.is('aprovado_jarvis', null);
    if (q) query = query.ilike('nome', `%${q}%`);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ data: data ?? [], total: count ?? 0 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * POST /api/trafego/interests/biblioteca
 * Busca interesses na Meta API por keyword e salva na biblioteca.
 * Body: { keyword: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as { keyword: string };

    if (!body.keyword?.trim()) {
      return NextResponse.json({ error: 'keyword obrigatório' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token) {
      return NextResponse.json({ error: 'Meta não configurado' }, { status: 400 });
    }

    const token = config.meta_access_token;
    const metaUrl = `${META_BASE}/search?type=adinterest&q=${encodeURIComponent(body.keyword.trim())}&locale=pt_BR&limit=30&access_token=${token}`;
    const metaRes = await fetch(metaUrl);

    if (!metaRes.ok) {
      const errData = await metaRes.json() as { error?: { message: string } };
      throw new Error(errData.error?.message ?? `Meta HTTP ${metaRes.status}`);
    }

    const metaData = await metaRes.json() as {
      data: Array<{
        id: string;
        name: string;
        audience_size_lower_bound?: number;
        audience_size_upper_bound?: number;
        path?: string[];
        topic?: string;
      }>;
    };

    const interests = metaData.data ?? [];
    if (interests.length === 0) {
      return NextResponse.json({ saved: 0, data: [] });
    }

    // Upsert na biblioteca (ID é PK — não duplica)
    const rows = interests.map(i => ({
      id:              i.id,          // TEXT — nunca converter para number
      nome:            i.name,
      categoria:       i.topic ?? i.path?.[0] ?? null,
      audiencia_global: i.audience_size_upper_bound ?? null,
      sincronizado_em: new Date().toISOString(),
    }));

    const { error: upsertErr } = await supabase
      .from('meta_interests_biblioteca')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: false });

    if (upsertErr) throw new Error(upsertErr.message);

    return NextResponse.json({ saved: rows.length, data: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
