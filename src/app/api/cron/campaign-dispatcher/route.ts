/**
 * POST /api/cron/campaign-dispatcher
 *
 * Motor de disparo de campanhas. Pode ser chamado de duas formas:
 *
 * 1. Netlify Scheduled Function (cron "* * * * *") — processa TODAS as campanhas
 *    running de TODOS os tenants (sem body).
 *
 * 2. Chamada interna pelo /api/v2/campanhas/[id]/iniciar (fire-and-forget)
 *    com body { campanha_id, tenant_id } para processar uma campanha específica.
 *
 * IMPORTANTE: O processarFilaCampanha é síncrono e bloqueia até a campanha
 * terminar. No Netlify Free o timeout é 26s — por isso o dispatcher processa
 * um job por invocação e delega o próximo ao cron agendado.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { processarFilaCampanha } from '@/lib/services/campaign-dispatcher';

// ─── Validação do secret ──────────────────────────────────────────────────────
const CRON_SECRET = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_KEY;

function autorizado(request: NextRequest): boolean {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.replace('Bearer ', '').trim();
  return !!CRON_SECRET && token === CRON_SECRET;
}

// ─── Handler principal ────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const started = Date.now();

  // Limite de tempo seguro: 20s (Netlify timeout é 26s)
  const TIMEOUT_MS = 20_000;

  try {
    let body: { campanha_id?: string; tenant_id?: string } = {};
    try {
      body = await request.json();
    } catch {
      // body vazio é válido (chamada do cron)
    }

    // ── Modo 1: campanha específica (chamada pelo /iniciar) ──────────────────
    if (body.campanha_id) {
      console.log(`[DISPATCHER_CRON] Processando campanha específica: ${body.campanha_id}`);

      // Roda o dispatcher com timeout de segurança
      const dispatchPromise = processarFilaCampanha(supabase, body.campanha_id);
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
      );

      try {
        await Promise.race([dispatchPromise, timeoutPromise]);
        console.log(`[DISPATCHER_CRON] Campanha ${body.campanha_id} finalizada em ${Date.now() - started}ms`);
      } catch (err) {
        if ((err as Error).message === 'TIMEOUT') {
          // Timeout não é erro — o cron seguinte continua do ponto que parou
          console.log(`[DISPATCHER_CRON] Timeout seguro após ${TIMEOUT_MS}ms — cron seguinte continuará`);
        } else {
          throw err;
        }
      }

      return NextResponse.json({
        ok: true,
        campanha_id: body.campanha_id,
        elapsed_ms: Date.now() - started,
      });
    }

    // ── Modo 2: processar todas as campanhas running (chamada do cron) ───────
    const { data: campanhasRunning, error } = await supabase
      .from('campaigns')
      .select('id, tenant_id, name')
      .eq('status', 'running')
      .order('created_at', { ascending: true })
      .limit(5); // no máximo 5 simultâneas por invocação

    if (error) {
      console.error('[DISPATCHER_CRON] Erro ao buscar campanhas:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!campanhasRunning || campanhasRunning.length === 0) {
      // Verificar campanhas scheduled cujo scheduled_at já passou
      const { data: agendadas } = await supabase
        .from('campaigns')
        .select('id, tenant_id, name, scheduled_at')
        .eq('status', 'scheduled')
        .lte('scheduled_at', new Date().toISOString())
        .limit(5);

      if (agendadas && agendadas.length > 0) {
        // Ativar campanhas agendadas
        const ids = agendadas.map(c => c.id);
        await supabase
          .from('campaigns')
          .update({ status: 'running', status_detalhe: 'Iniciado pelo agendador' })
          .in('id', ids);

        console.log(`[DISPATCHER_CRON] ${agendadas.length} campanhas agendadas ativadas`);
        return NextResponse.json({ ok: true, ativadas: ids, running: [] });
      }

      return NextResponse.json({ ok: true, mensagem: 'Nenhuma campanha ativa no momento', running: [] });
    }

    // Processar cada campanha em paralelo com timeout individual
    console.log(`[DISPATCHER_CRON] Processando ${campanhasRunning.length} campanhas running`);

    const resultados = await Promise.allSettled(
      campanhasRunning.map(async (campanha) => {
        const dispatchPromise = processarFilaCampanha(supabase, campanha.id);
        const timeoutPromise = new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
        );
        try {
          await Promise.race([dispatchPromise, timeoutPromise]);
          return { id: campanha.id, ok: true };
        } catch (err) {
          const msg = (err as Error).message;
          if (msg !== 'TIMEOUT') throw err;
          return { id: campanha.id, ok: true, timeout: true };
        }
      })
    );

    const resumo = resultados.map((r, i) => ({
      id: campanhasRunning[i].id,
      name: campanhasRunning[i].name,
      ok: r.status === 'fulfilled',
      erro: r.status === 'rejected' ? (r.reason as Error).message : undefined,
    }));

    console.log('[DISPATCHER_CRON] Resumo:', JSON.stringify(resumo));

    return NextResponse.json({
      ok: true,
      elapsed_ms: Date.now() - started,
      campanhas: resumo,
    });

  } catch (err) {
    console.error('[DISPATCHER_CRON_UNEXPECTED]', err);
    return NextResponse.json({ error: 'Erro interno no dispatcher' }, { status: 500 });
  }
}

// Netlify Scheduled Functions chama GET para verificar se o endpoint existe
export async function GET() {
  return NextResponse.json({ ok: true, service: 'campaign-dispatcher' });
}
