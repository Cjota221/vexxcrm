import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { PhoneNormalizer } from '@/lib/phone-normalizer';
import {
  resolverBlocos,
  Bloco,
  ContatoJob,
  REGRA_DA_CAROL,
} from '@/lib/services/campaign-dispatcher';
import {
  getTenantEvolutionConfig,
  sendTextMessage,
  sendMediaMessage,
} from '@/lib/services/evolution.service';

type Params = Promise<{ id: string }>;

/**
 * POST /api/v2/campanhas/[id]/dispatch-batch
 *
 * Processa um lote de jobs de uma campanha. Cada chamada envia até `batchSize`
 * mensagens (default 5). O front-end controla o delay entre chamadas para
 * funcionar como anti-ban.
 *
 * FLOW:
 * 1. Front-end chama POST com { batch_size?: number }
 * 2. Endpoint processa N jobs sequencialmente (sem delay longo)
 * 3. Retorna { enviados, falhas, restantes, concluida }
 * 4. Front-end espera delay (15-45s) e chama de novo se restantes > 0
 */
export async function POST(request: NextRequest, { params }: { params: Params }) {
  const started = Date.now();
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const { id: campanhaId } = await params;

    let body: { batch_size?: number } = {};
    try { body = await request.json(); } catch { /* vazio OK */ }

    const batchSize = Math.min(body.batch_size ?? 5, 10); // max 10 por chamada

    // Verificar campanha
    const { data: campanha, error: errC } = await supabase
      .from('campaigns')
      .select('id, tenant_id, status, name, sent_count, failed_count')
      .eq('id', campanhaId)
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (errC || !campanha) {
      return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });
    }

    if (campanha.status !== 'running') {
      return NextResponse.json({
        error: `Campanha com status "${campanha.status}" — não está em execução`,
        status: campanha.status,
      }, { status: 400 });
    }

    // ━━━ REGRA DA CAROL: Verificar trava de volume 24h ━━━
    try {
      const { data: enviadosHoje } = await supabase.rpc('get_daily_send_count', {
        p_tenant_id: profile.tenant_id,
      });
      if ((enviadosHoje ?? 0) >= REGRA_DA_CAROL.MAX_ENVIOS_24H) {
        return NextResponse.json({
          error: `Limite diário de ${REGRA_DA_CAROL.MAX_ENVIOS_24H} envios atingido. Aguarde 24h para continuar.`,
          enviados_hoje: enviadosHoje,
          limite: REGRA_DA_CAROL.MAX_ENVIOS_24H,
          bloqueado: true,
        }, { status: 429 });
      }
    } catch {
      // Se a RPC não existir ainda, continua normalmente
      console.warn('[DISPATCH_BATCH] Falha ao verificar volume diário — continuando');
    }

    // Buscar próximos jobs pendentes
    const agora = new Date().toISOString();
    const { data: jobs, error: errJobs } = await supabase
      .from('campaign_jobs')
      .select('*')
      .eq('campanha_id', campanhaId)
      .eq('status', 'pendente')
      .or(`proximo_envio_em.is.null,proximo_envio_em.lte.${agora}`)
      .order('ordem', { ascending: true })
      .limit(batchSize);

    if (errJobs) {
      console.error('[DISPATCH_BATCH] Erro ao buscar jobs:', errJobs);
      return NextResponse.json({ error: errJobs.message }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      // Nenhum job pendente → campanha concluída
      await supabase
        .from('campaigns')
        .update({ status: 'completed', status_detalhe: 'Todos os envios concluídos' })
        .eq('id', campanhaId);

      return NextResponse.json({
        enviados: 0,
        falhas: 0,
        restantes: 0,
        concluida: true,
        elapsed_ms: Date.now() - started,
      });
    }

    const tenantId = campanha.tenant_id;
    let enviados = 0;
    let falhas = 0;

    for (const job of jobs) {
      // Safety: não ultrapassar 20s nesta request
      if (Date.now() - started > 18_000) {
        console.log(`[DISPATCH_BATCH] Timeout de segurança — ${enviados} enviados, parando`);
        break;
      }

      // Marcar como enviando
      await supabase
        .from('campaign_jobs')
        .update({ status: 'enviando', iniciado_em: new Date().toISOString() })
        .eq('id', job.id);

      const contatoInfo: ContatoJob = {
        id: job.contato_id,
        telefone: job.contato_telefone,
        nome: job.contato_nome,
      };

      const blocosResolvidos = resolverBlocos(job.blocos as Bloco[], contatoInfo);

      try {
        await enviarBlocos(job.contato_telefone, blocosResolvidos, tenantId);

        await supabase
          .from('campaign_jobs')
          .update({ status: 'enviado', enviado_em: new Date().toISOString(), tentativas: 1 })
          .eq('id', job.id);

        // ━━━ UPSERT CONTATO + GRAVAR MENSAGEM NO BANCO ━━━
        // Garante que o contato existe e a mensagem enviada aparece no painel
        try {
          const phoneNorm = PhoneNormalizer.canonical(job.contato_telefone);
          const phoneDisplay = PhoneNormalizer.normalize(job.contato_telefone);

          // Upsert cliente
          const { data: client } = await supabase
            .from('clients')
            .upsert(
              {
                tenant_id: tenantId,
                phone: phoneDisplay,
                phone_normalized: phoneNorm,
                name: job.contato_nome || phoneDisplay,
              },
              { onConflict: 'tenant_id,phone_normalized', ignoreDuplicates: false }
            )
            .select('id')
            .single();

          if (client) {
            // Buscar ou criar conversa
            let convId: string | null = null;
            const { data: conv } = await supabase
              .from('conversations')
              .select('id')
              .eq('tenant_id', tenantId)
              .eq('client_id', client.id)
              .eq('channel', 'whatsapp')
              .single();

            if (conv) {
              convId = conv.id;
            } else {
              const { data: newConv } = await supabase
                .from('conversations')
                .insert({ tenant_id: tenantId, client_id: client.id, channel: 'whatsapp', status: 'open' })
                .select('id')
                .single();
              convId = newConv?.id || null;
            }

            if (convId) {
              // Extrair conteúdo resumido dos blocos para salvar
              const textoResumo = blocosResolvidos
                .filter(b => b.tipo === 'texto' || b.tipo === 'cta')
                .map(b => b.conteudo.texto_formatado || b.conteudo.texto_raw || b.conteudo.texto_botao || '')
                .filter(Boolean)
                .join('\n')
                .substring(0, 500) || `[Campanha: ${campanha.name}]`;

              const primeiraMedia = blocosResolvidos.find(b => ['imagem', 'video', 'audio'].includes(b.tipo));
              const msgType = primeiraMedia ? primeiraMedia.tipo === 'imagem' ? 'image' : primeiraMedia.tipo : 'text';

              await supabase
                .from('messages')
                .insert({
                  tenant_id: tenantId,
                  conversation_id: convId,
                  client_id: client.id,
                  direction: 'outbound',
                  sender_name: 'Campanha',
                  content: textoResumo,
                  type: msgType,
                  media_url: primeiraMedia?.conteudo.url || null,
                  status: 'sent',
                  created_at: new Date().toISOString(),
                });
            }
          }
        } catch (upsertErr) {
          // Não falhar o envio se o upsert/gravação falhar
          console.warn(`[DISPATCH_BATCH] Upsert/DB para ${job.contato_telefone}:`, upsertErr);
        }

        // Atualizar contadores (RPC ou fallback direto)
        try {
          await supabase.rpc('increment_campaign_sent', { campanha_id: campanhaId });
        } catch {
          // Fallback: update direto se RPC não existir
          await supabase
            .from('campaigns')
            .update({ sent_count: (campanha.sent_count ?? 0) + enviados + 1 })
            .eq('id', campanhaId);
        }

        // ━━━ REGRA DA CAROL: Incrementar contador diário ━━━
        try {
          await supabase.rpc('increment_daily_send_count', {
            p_tenant_id: tenantId,
            p_count: 1,
          });
        } catch {
          // Silencia se RPC não existir
        }

        enviados++;

        console.log(`[DISPATCH_BATCH] ✅ Enviado para ${job.contato_telefone} (${job.contato_nome || 'sem nome'})`);
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string; code?: string };
        const erroMsg = e?.message ?? 'Erro desconhecido';
        const erroCodigo = String(e?.code ?? e?.status ?? '');

        console.error(`[DISPATCH_BATCH] ❌ Falha para ${job.contato_telefone}: ${erroMsg}`);

        await supabase
          .from('campaign_jobs')
          .update({
            status: 'erro',
            tentativas: 1,
            erro_mensagem: erroMsg,
            erro_codigo: erroCodigo,
          })
          .eq('id', job.id);

        // Atualizar contadores (RPC ou fallback direto)
        try {
          await supabase.rpc('increment_campaign_failed', { campanha_id: campanhaId });
        } catch {
          await supabase
            .from('campaigns')
            .update({ failed_count: (campanha.failed_count ?? 0) + falhas + 1 })
            .eq('id', campanhaId);
        }
        falhas++;

        // Rate limit → parar imediatamente
        if (e?.status === 429 || erroCodigo === '429') {
          console.warn('[DISPATCH_BATCH] Rate limit detectado — parando batch');
          break;
        }
      }
    }

    // Contar restantes
    const { count: restantes } = await supabase
      .from('campaign_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('campanha_id', campanhaId)
      .eq('status', 'pendente');

    const concluida = (restantes ?? 0) === 0;
    if (concluida) {
      await supabase
        .from('campaigns')
        .update({ status: 'completed', status_detalhe: 'Todos os envios concluídos' })
        .eq('id', campanhaId);
    }

    console.log(`[DISPATCH_BATCH] Campanha ${campanhaId}: ${enviados} enviados, ${falhas} falhas, ${restantes ?? 0} restantes — ${Date.now() - started}ms`);

    return NextResponse.json({
      enviados,
      falhas,
      restantes: restantes ?? 0,
      concluida,
      elapsed_ms: Date.now() - started,
    });

  } catch (err) {
    console.error('[DISPATCH_BATCH_UNEXPECTED]', err);
    return NextResponse.json({ error: 'Erro interno no dispatch' }, { status: 500 });
  }
}

// ─── Envio de blocos ──────────────────────────────────────────────────────────

async function enviarBlocos(telefone: string, blocos: Bloco[], tenantId: string): Promise<void> {
  const config = getTenantEvolutionConfig(tenantId);
  const ordenados = [...blocos].sort((a, b) => a.ordem - b.ordem);

  for (const bloco of ordenados) {
    switch (bloco.tipo) {
      case 'texto': {
        const texto = bloco.conteudo.texto_formatado ?? bloco.conteudo.texto_raw ?? '';
        if (texto.trim()) await sendTextMessage(config, telefone, texto);
        break;
      }
      case 'imagem': {
        if (bloco.conteudo.url) {
          await sendMediaMessage(config, telefone, bloco.conteudo.url, bloco.conteudo.caption || bloco.conteudo.texto_raw || undefined, 'image');
        }
        break;
      }
      case 'video': {
        if (bloco.conteudo.url) {
          await sendMediaMessage(config, telefone, bloco.conteudo.url, bloco.conteudo.caption || bloco.conteudo.texto_raw || undefined, 'video');
        }
        break;
      }
      case 'audio': {
        if (bloco.conteudo.url) {
          await sendMediaMessage(config, telefone, bloco.conteudo.url, undefined, 'audio');
        }
        break;
      }
      case 'cta': {
        const texto = bloco.conteudo.texto_botao ?? '';
        const link = bloco.conteudo.url_destino ?? '';
        if (texto || link) {
          await sendTextMessage(config, telefone, [texto, link].filter(Boolean).join('\n'));
        }
        break;
      }
    }
  }
}
