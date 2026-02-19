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
import { processarFilaCampanha, criarJobsCampanha } from '@/lib/services/campaign-dispatcher';

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

      // ── Verificar campanhas recorrentes (diárias) que precisam ser clonadas ──
      const agora = new Date();
      const horaAtual = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
      const hojeISO = agora.toISOString().slice(0, 10); // YYYY-MM-DD

      const { data: recorrentes } = await supabase
        .from('campaigns')
        .select('id, tenant_id, name, blocos_snapshot, config_antiban, tipo_destinatario, origem, origem_grupo_nome, recurrence_time, created_by')
        .eq('is_recurring', true)
        .eq('recurrence_active', true)
        .eq('recurrence_type', 'daily');

      if (recorrentes && recorrentes.length > 0) {
        const recorrenciasClonadas: string[] = [];

        for (const camp of recorrentes) {
          // Verificar se o horário já passou e se ainda não disparou hoje
          const horaCamp = (camp.recurrence_time as string)?.slice(0, 5) ?? '09:00';
          if (horaAtual < horaCamp) continue; // ainda não chegou a hora

          // Checar last_recurrence_at para não clonar mais de uma vez no dia
          const { data: original } = await supabase
            .from('campaigns')
            .select('last_recurrence_at')
            .eq('id', camp.id)
            .single();

          if (original?.last_recurrence_at) {
            const lastDate = new Date(original.last_recurrence_at).toISOString().slice(0, 10);
            if (lastDate === hojeISO) continue; // já disparou hoje
          }

          // Buscar jobs da campanha original para recriar destinatários
          const { data: jobsOriginais } = await supabase
            .from('campaign_jobs')
            .select('telefone, nome_contato, blocos_snapshot')
            .eq('campaign_id', camp.id)
            .limit(500);

          if (!jobsOriginais || jobsOriginais.length === 0) continue;

          const destinatarios = jobsOriginais.map(j => ({
            id: j.telefone,
            telefone: j.telefone,
            nome: j.nome_contato ?? '',
          }));

          // Criar campanha clone
          const { data: clone, error: errClone } = await supabase
            .from('campaigns')
            .insert({
              tenant_id: camp.tenant_id,
              created_by: camp.created_by,
              name: `${camp.name} (${hojeISO})`,
              type: 'broadcast',
              status: 'running',
              blocos_snapshot: camp.blocos_snapshot,
              destinatarios: destinatarios.length,
              tipo_destinatario: camp.tipo_destinatario ?? 'grupos',
              config_antiban: camp.config_antiban,
              origem: camp.origem,
              origem_grupo_nome: camp.origem_grupo_nome,
              status_detalhe: `Recorrência automática de #${camp.id.slice(0, 8)}`,
              messages: camp.blocos_snapshot,
            })
            .select('id')
            .single();

          if (errClone || !clone) {
            console.error(`[DISPATCHER_CRON] Erro ao clonar recorrência ${camp.id}:`, errClone);
            continue;
          }

          // Criar jobs do clone
          await criarJobsCampanha(
            supabase,
            clone.id,
            camp.tenant_id,
            destinatarios,
            camp.blocos_snapshot as any[]
          );

          // Atualizar last_recurrence_at na campanha original
          await supabase
            .from('campaigns')
            .update({ last_recurrence_at: agora.toISOString() })
            .eq('id', camp.id);

          recorrenciasClonadas.push(clone.id);
          console.log(`[DISPATCHER_CRON] Recorrência clonada: ${camp.name} → ${clone.id}`);
        }

        if (recorrenciasClonadas.length > 0) {
          return NextResponse.json({
            ok: true,
            recorrencias_clonadas: recorrenciasClonadas,
            running: [],
          });
        }
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
