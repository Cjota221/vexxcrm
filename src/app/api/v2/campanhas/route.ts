import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { criarJobsCampanha, Bloco, ContatoJob } from '@/lib/services/campaign-dispatcher';

// ─── POST /api/v2/campanhas ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    const body = await request.json() as {
      nome: string;
      tipo?: string;
      template_id?: string;
      blocos: Bloco[];
      destinatarios: ContatoJob[];
      tipo_destinatario?: string;
      scheduled_at?: string;
      config_antiban?: Record<string, number>;
      origem?: string;
      origem_grupo_nome?: string;
    };

    // Validações básicas
    if (!body.nome?.trim()) {
      return NextResponse.json({ error: 'Nome da campanha é obrigatório' }, { status: 400 });
    }
    if (!Array.isArray(body.blocos) || body.blocos.length === 0) {
      return NextResponse.json({ error: 'Ao menos um bloco de conteúdo é obrigatório' }, { status: 400 });
    }
    if (!Array.isArray(body.destinatarios) || body.destinatarios.length === 0) {
      return NextResponse.json({ error: 'Ao menos um destinatário é obrigatório' }, { status: 400 });
    }

    // Calcula ETA com base no delay médio e cooloffs
    const antiban = body.config_antiban ?? {};
    const delayMedio = ((antiban.delay_min_ms ?? 15_000) + (antiban.delay_max_ms ?? 45_000)) / 2;
    const cooloffACada = antiban.cooloff_a_cada ?? 20;
    const cooloffDuracao = antiban.cooloff_duracao_ms ?? 120_000;
    const total = body.destinatarios.length;
    const cooloffs = Math.floor(total / cooloffACada);
    const etaMs = total * delayMedio + cooloffs * cooloffDuracao;
    const etaMinutes = Math.ceil(etaMs / 60_000);

    // Criar campanha
    const statusInicial = body.scheduled_at ? 'scheduled' : 'draft';
    const { data: campanha, error: errCampanha } = await supabase
      .from('campaigns')
      .insert({
        tenant_id: profile.tenant_id,
        created_by: profile.id,
        name: body.nome.trim(),
        type: body.tipo ?? 'broadcast',
        status: statusInicial,
        template_id: body.template_id ?? null,
        blocos_snapshot: body.blocos,
        destinatarios: total,
        tipo_destinatario: body.tipo_destinatario ?? 'contatos',
        config_antiban: body.config_antiban ?? null,
        origem: body.origem ?? null,
        origem_grupo_nome: body.origem_grupo_nome ?? null,
        scheduled_at: body.scheduled_at ?? null,
        messages: body.blocos, // manter compat com schema legado
      })
      .select('id, status')
      .single();

    if (errCampanha || !campanha) {
      console.error('[CAMPANHAS_CREATE]', errCampanha);
      return NextResponse.json({ error: errCampanha?.message }, { status: 400 });
    }

    // Criar jobs em lote
    const { total: totalJobs, error: errJobs } = await criarJobsCampanha(
      supabase,
      campanha.id,
      profile.tenant_id,
      body.destinatarios,
      body.blocos
    );

    if (errJobs) {
      // Rollback: cancelar campanha
      await supabase.from('campaigns').update({ status: 'cancelled' }).eq('id', campanha.id);
      return NextResponse.json({ error: `Falha ao criar jobs: ${errJobs}` }, { status: 500 });
    }

    // Incrementar uso do template se referenciado
    if (body.template_id) {
      await supabase.rpc('incrementar_uso_template', { template_id: body.template_id });
    }

    return NextResponse.json({
      campanha_id: campanha.id,
      status: campanha.status,
      total_jobs: totalJobs,
      eta_minutes: etaMinutes,
    }, { status: 201 });

  } catch (err) {
    console.error('[CAMPANHAS_POST_UNEXPECTED]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// ─── GET /api/v2/campanhas ───────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const limit = Math.min(50, Number(searchParams.get('limit') ?? '20'));
    const offset = (page - 1) * limit;

    let query = supabase
      .from('campaigns')
      .select('*, jobs_count:campaign_jobs(count)', { count: 'exact' })
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({
      campanhas: data ?? [],
      total: count ?? 0,
      page,
      limit,
    });

  } catch (err) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
