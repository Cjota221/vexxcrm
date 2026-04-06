import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * GET /api/trafego/publicos-aprovados
 * Lista públicos aprovados do tenant.
 * Query params: tipo, status, limit, offset
 */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const supabase = createServerSupabaseClient();

    const { searchParams } = new URL(req.url);
    const tipo   = searchParams.get('tipo');
    const status = searchParams.get('status');
    const limit  = Math.min(Number(searchParams.get('limit') ?? '50'), 100);
    const offset = Number(searchParams.get('offset') ?? '0');

    let query = supabase
      .from('meta_publicos_aprovados')
      .select('*', { count: 'exact' })
      .eq('tenant_id', profile.tenant_id)
      .neq('status', 'arquivado')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (tipo)   query = query.eq('tipo', tipo);
    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ data: data ?? [], total: count ?? 0 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * POST /api/trafego/publicos-aprovados
 * Registra um público no banco de dados local.
 *
 * Saved Audiences NÃO podem ser criadas via API Meta (apenas leitura).
 * Custom Audiences (quente, lookalike) devem ser criadas via /gerar-automatico.
 *
 * Use este endpoint para:
 * - Registrar um público criado manualmente no Meta Ads Manager (cole o meta_audience_id)
 * - Salvar um targeting de público frio (sem meta_audience_id — vai direto no adset)
 *
 * Body: {
 *   nome: string,
 *   tipo: 'frio' | 'quente' | 'whatsapp' | 'lookalike' | 'retargeting',
 *   descricao?: string,
 *   targeting: Record<string, unknown>,
 *   interest_ids?: string[],
 *   meta_audience_id?: string,  // ID de Custom Audience já criada no Meta Ads Manager
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as {
      nome: string;
      tipo: string;
      descricao?: string;
      targeting: Record<string, unknown>;
      interest_ids?: string[];
      meta_audience_id?: string;
    };

    if (!body.nome?.trim() || !body.tipo || !body.targeting) {
      return NextResponse.json(
        { error: 'nome, tipo e targeting são obrigatórios' },
        { status: 400 },
      );
    }

    const TIPOS_VALIDOS = ['frio', 'quente', 'whatsapp', 'lookalike', 'retargeting'];
    if (!TIPOS_VALIDOS.includes(body.tipo)) {
      return NextResponse.json(
        { error: `tipo inválido — use: ${TIPOS_VALIDOS.join(', ')}` },
        { status: 400 },
      );
    }

    const supabase = createServerSupabaseClient();

    const metaAudienceId = body.meta_audience_id?.trim() || null;
    // Se tem ID externo, o público já existe no Meta → 'publicado'
    // Se só tem targeting (frio), está 'publicado' localmente (vai no adset)
    const statusPublico = 'publicado';

    const { data: publico, error: insertErr } = await supabase
      .from('meta_publicos_aprovados')
      .insert({
        tenant_id:         profile.tenant_id,
        nome:              body.nome.trim(),
        tipo:              body.tipo,
        descricao:         body.descricao ?? null,
        targeting:         body.targeting,
        interest_ids:      body.interest_ids ?? [],
        meta_audience_id:  metaAudienceId,
        estimativa_alcance: null,
        status:            statusPublico,
        criado_por_ia:     false,
      })
      .select()
      .single();

    if (insertErr) throw new Error(insertErr.message);

    return NextResponse.json({ ok: true, publico });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
