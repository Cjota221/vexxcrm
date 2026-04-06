import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { META_BASE } from '@/lib/meta-config';

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
 * Cria um público aprovado no Supabase e opcionalmente publica como saved_audience na Meta API.
 * Body: {
 *   nome: string,
 *   tipo: 'frio' | 'quente' | 'whatsapp' | 'lookalike' | 'retargeting',
 *   descricao?: string,
 *   targeting: Record<string, unknown>,    // objeto targeting completo
 *   interest_ids?: string[],
 *   publicar_meta?: boolean,               // se true, cria saved_audience na Meta API
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
      publicar_meta?: boolean;
    };

    if (!body.nome?.trim() || !body.tipo || !body.targeting) {
      return NextResponse.json({ error: 'nome, tipo e targeting são obrigatórios' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    let metaAudienceId: string | null = null;
    let estimativaAlcance: number | null = null;
    let statusPublico: string = 'rascunho';
    let erroMsg: string | null = null;

    // Publicar na Meta API se solicitado
    if (body.publicar_meta) {
      const { data: config } = await supabase
        .from('ai_provider_config')
        .select('meta_access_token, meta_ad_account_id')
        .eq('tenant_id', profile.tenant_id)
        .single();

      if (!config?.meta_access_token || !config?.meta_ad_account_id) {
        return NextResponse.json({ error: 'Meta não configurado' }, { status: 400 });
      }

      const token = config.meta_access_token;
      const accountId = config.meta_ad_account_id.startsWith('act_')
        ? config.meta_ad_account_id
        : `act_${config.meta_ad_account_id}`;

      try {
        // Criar saved_audience na Meta API
        const metaUrl = new URL(`${META_BASE}/${accountId}/saved_audiences`);
        metaUrl.searchParams.set('access_token', token);

        const metaRes = await fetch(metaUrl.toString(), {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            name:      body.nome,
            targeting: body.targeting,
          }),
        });

        const metaData = await metaRes.json() as {
          id?: string;
          error?: { message: string; error_user_msg?: string };
        };

        if (!metaRes.ok || !metaData.id) {
          throw new Error(metaData.error?.error_user_msg ?? metaData.error?.message ?? `Meta HTTP ${metaRes.status}`);
        }

        metaAudienceId = metaData.id;
        statusPublico = 'publicado';

        // Buscar estimativa de alcance
        try {
          const reachRes = await fetch(
            `${META_BASE}/${accountId}/reachestimate?targeting_spec=${encodeURIComponent(JSON.stringify(body.targeting))}&access_token=${token}`
          );
          if (reachRes.ok) {
            const reachData = await reachRes.json() as { users?: number; data?: { users: number } };
            estimativaAlcance = reachData.users ?? (reachData.data as { users: number } | undefined)?.users ?? null;
          }
        } catch {
          // Estimativa é opcional — não falha o fluxo
        }
      } catch (metaErr) {
        erroMsg = String(metaErr);
        statusPublico = 'erro';
      }
    }

    // Salvar no Supabase
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
        estimativa_alcance: estimativaAlcance,
        status:            statusPublico,
        erro_msg:          erroMsg,
        criado_por_ia:     false,
      })
      .select()
      .single();

    if (insertErr) throw new Error(insertErr.message);

    return NextResponse.json({
      ok:     true,
      publico,
      ...(erroMsg ? { aviso: `Salvo localmente, mas Meta retornou erro: ${erroMsg}` } : {}),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
