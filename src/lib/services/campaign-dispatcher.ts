import { SupabaseClient } from '@supabase/supabase-js';
import {
  getTenantEvolutionConfig,
  sendTextMessage,
  sendMediaMessage,
  sendButtonsMessage,
} from '@/lib/services/evolution.service';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface BlocoConteudo {
  url?: string;
  storage_path?: string;
  texto_raw?: string;
  texto_formatado?: string;
  variaveis_detectadas?: string[];
  texto_botao?: string;
  url_destino?: string;
  caption?: string;
  // copy_code
  copy_code?: string;   // Código que será copiado pelo cliente
  copy_code_footer?: string; // Rodapé opcional da mensagem
}

export interface Bloco {
  id: string;
  ordem: number;
  tipo: 'imagem' | 'video' | 'audio' | 'texto' | 'cta' | 'copy_code';
  conteudo: BlocoConteudo;
}

export interface AntibanConfig {
  delay_min_ms: number;
  delay_max_ms: number;
  cooloff_a_cada: number;
  cooloff_duracao_ms: number;
  max_tentativas: number;
  janela_horaria_inicio: number;
  janela_horaria_fim: number;
}

export interface ContatoJob {
  id: string;
  telefone: string;
  nome?: string;
  cidade?: string;
  estado?: string;
  ultimo_pedido?: string;
  valor_ltv?: number;
}

// ─── Configuração padrão ────────────────────────────────────────────────────

/**
 * ═══════════════════════════════════════════════════════════════
 * REGRA DA CAROL — Hardcoded anti-ban safety
 * 
 * • 15 segundos de intervalo FIXO entre contatos
 * • 60 segundos de pausa obrigatória a cada 10 envios
 * • Máximo 200 contatos por período de 24h (com alerta)
 * • Janela horária: 8h–20h
 * 
 * Esses valores são o PISO de segurança. O usuário pode
 * aumentar (mais lento), mas NUNCA diminuir abaixo disso.
 * ═══════════════════════════════════════════════════════════════
 */
export const REGRA_DA_CAROL = {
  DELAY_MIN_MS: 15_000,            // 15s mínimo entre contatos
  COOLOFF_A_CADA: 10,               // pausa a cada 10 envios
  COOLOFF_DURACAO_MS: 60_000,       // 60s de pausa
  MAX_ENVIOS_24H: 200,              // trava de volume diário
  JANELA_INICIO: 8,                 // início às 8h
  JANELA_FIM: 20,                   // fim às 20h
} as const;

export const CONFIG_PADRAO: AntibanConfig = {
  delay_min_ms: REGRA_DA_CAROL.DELAY_MIN_MS,
  delay_max_ms: 45_000,
  cooloff_a_cada: REGRA_DA_CAROL.COOLOFF_A_CADA,
  cooloff_duracao_ms: REGRA_DA_CAROL.COOLOFF_DURACAO_MS,
  max_tentativas: 3,
  janela_horaria_inicio: REGRA_DA_CAROL.JANELA_INICIO,
  janela_horaria_fim: REGRA_DA_CAROL.JANELA_FIM,
};

/**
 * Aplica a Regra da Carol: garante que os valores nunca fiquem
 * abaixo do piso de segurança, mesmo que o usuário tente.
 */
export function aplicarRegraCarol(config: Partial<AntibanConfig>): AntibanConfig {
  return {
    ...CONFIG_PADRAO,
    ...config,
    // Enforce mínimos — NUNCA abaixo da Regra da Carol
    delay_min_ms: Math.max(config.delay_min_ms ?? CONFIG_PADRAO.delay_min_ms, REGRA_DA_CAROL.DELAY_MIN_MS),
    delay_max_ms: Math.max(config.delay_max_ms ?? CONFIG_PADRAO.delay_max_ms, REGRA_DA_CAROL.DELAY_MIN_MS + 1_000),
    cooloff_a_cada: Math.min(config.cooloff_a_cada ?? CONFIG_PADRAO.cooloff_a_cada, REGRA_DA_CAROL.COOLOFF_A_CADA),
    cooloff_duracao_ms: Math.max(config.cooloff_duracao_ms ?? CONFIG_PADRAO.cooloff_duracao_ms, REGRA_DA_CAROL.COOLOFF_DURACAO_MS),
    janela_horaria_inicio: Math.max(config.janela_horaria_inicio ?? CONFIG_PADRAO.janela_horaria_inicio, REGRA_DA_CAROL.JANELA_INICIO),
    janela_horaria_fim: Math.min(config.janela_horaria_fim ?? CONFIG_PADRAO.janela_horaria_fim, REGRA_DA_CAROL.JANELA_FIM),
  };
}

// ─── Utilitários de delay ────────────────────────────────────────────────────

/** Distribuição aproximada normal usando Box-Muller simplificado */
function gerarDelayHumanizado(min: number, max: number): number {
  const r1 = Math.random();
  const r2 = Math.random();
  const media = (min + max) / 2;
  const desvio = (max - min) / 6;
  const normal = ((r1 + r2) / 2) * desvio * 2 - desvio + media;
  return Math.max(min, Math.min(max, Math.round(normal)));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Verificação de janela horária ───────────────────────────────────────────

function dentroJanelaHoraria(inicio: number, fim: number): boolean {
  const hora = new Date().getHours();
  return hora >= inicio && hora < fim;
}

/** Espera até a janela horária abrir (máx 12h) */
async function aguardarJanelaHoraria(inicio: number): Promise<void> {
  const agora = new Date();
  const horaAtual = agora.getHours();
  if (horaAtual < inicio) {
    const msAteInicio = (inicio - horaAtual) * 60 * 60 * 1000
      - agora.getMinutes() * 60_000
      - agora.getSeconds() * 1000;
    await sleep(Math.min(msAteInicio, 12 * 60 * 60 * 1000));
  }
}

// ─── Resolução de variáveis ──────────────────────────────────────────────────

export function resolverVariaveis(texto: string, contato: ContatoJob): string {
  return texto
    .replace(/\{\{nome\}\}/gi, contato.nome ?? 'cliente')
    .replace(/\{\{cidade\}\}/gi, contato.cidade ?? '')
    .replace(/\{\{estado\}\}/gi, contato.estado ?? '')
    .replace(/\{\{ultimo_pedido\}\}/gi, contato.ultimo_pedido ?? 'sem pedidos')
    .replace(/\{\{valor_ltv\}\}/gi,
      contato.valor_ltv != null
        ? `R$ ${contato.valor_ltv.toFixed(2).replace('.', ',')}`
        : 'R$ 0,00'
    );
}

/** Aplica variáveis em todos os blocos de texto/cta/copy_code/caption de mídia */
export function resolverBlocos(blocos: Bloco[], contato: ContatoJob): Bloco[] {
  return blocos.map(bloco => {
    // Mídia: só precisa resolver caption e (legado) texto_raw
    if (bloco.tipo === 'imagem' || bloco.tipo === 'video' || bloco.tipo === 'audio') {
      return {
        ...bloco,
        conteudo: {
          ...bloco.conteudo,
          caption: bloco.conteudo.caption
            ? resolverVariaveis(bloco.conteudo.caption, contato)
            : undefined,
          // compatibilidade legada — caso caption não exista mas texto_raw sim
          texto_raw: bloco.conteudo.texto_raw
            ? resolverVariaveis(bloco.conteudo.texto_raw, contato)
            : undefined,
        },
      };
    }
    return {
      ...bloco,
      conteudo: {
        ...bloco.conteudo,
        texto_raw: bloco.conteudo.texto_raw
          ? resolverVariaveis(bloco.conteudo.texto_raw, contato)
          : undefined,
        texto_formatado: bloco.conteudo.texto_formatado
          ? resolverVariaveis(bloco.conteudo.texto_formatado, contato)
          : undefined,
        texto_botao: bloco.conteudo.texto_botao
          ? resolverVariaveis(bloco.conteudo.texto_botao, contato)
          : undefined,
        // Resolve variáveis dentro do código de cópia (ex: {{cupom_cliente}})
        copy_code: bloco.conteudo.copy_code
          ? resolverVariaveis(bloco.conteudo.copy_code, contato)
          : undefined,
      },
    };
  });
}

// ─── Criação de jobs em lote ─────────────────────────────────────────────────

export async function criarJobsCampanha(
  supabase: SupabaseClient,
  campanhaId: string,
  tenantId: string,
  destinatarios: ContatoJob[],
  blocos: Bloco[]
): Promise<{ total: number; error?: string }> {
  // UUID v4 regex — IDs de grupo WhatsApp (ex: "120363396867760724@g.us") não são UUIDs válidos
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const agora = new Date().toISOString();
  const jobs = destinatarios.map((c, i) => ({
    campanha_id: campanhaId,
    tenant_id: tenantId,
    // Grupos WhatsApp têm id no formato "120363396867760724@g.us" — não é UUID.
    // Nesses casos, contato_id deve ser null (coluna aceita null).
    contato_id: c.id && UUID_RE.test(c.id) ? c.id : null,
    contato_telefone: c.telefone,
    contato_nome: c.nome ?? null,
    blocos,
    ordem: i + 1,
    status: 'pendente',
    proximo_envio_em: agora, // IMPORTANTE: sem isso o dispatcher não encontra os jobs
  }));

  // Inserção em chunks de 500 para evitar limite de payload
  const CHUNK = 500;
  for (let i = 0; i < jobs.length; i += CHUNK) {
    const { error } = await supabase
      .from('campaign_jobs')
      .insert(jobs.slice(i, i + CHUNK));
    if (error) return { total: i, error: error.message };
  }

  return { total: jobs.length };
}

// ─── Envio de blocos compostos ───────────────────────────────────────────────

/**
 * Envia um bloco individual via Evolution API.
 * Suporta: texto, imagem, vídeo, áudio e CTA (link como texto).
 */
async function enviarBlocoViaWhatsApp(
  telefone: string,
  bloco: Bloco,
  tenantId: string
): Promise<void> {
  const config = getTenantEvolutionConfig(tenantId);

  switch (bloco.tipo) {
    case 'texto': {
      const texto = bloco.conteudo.texto_formatado ?? bloco.conteudo.texto_raw ?? '';
      if (texto.trim()) {
        await sendTextMessage(config, telefone, texto);
      }
      break;
    }

    case 'imagem': {
      const url = bloco.conteudo.url;
      if (url) {
        // caption tem prioridade; texto_raw como fallback legado
        const caption = bloco.conteudo.caption || bloco.conteudo.texto_raw || undefined;
        await sendMediaMessage(config, telefone, url, caption, 'image');
      }
      break;
    }

    case 'video': {
      const url = bloco.conteudo.url;
      if (url) {
        const caption = bloco.conteudo.caption || bloco.conteudo.texto_raw || undefined;
        await sendMediaMessage(config, telefone, url, caption, 'video');
      }
      break;
    }

    case 'audio': {
      const url = bloco.conteudo.url;
      if (url) {
        await sendMediaMessage(config, telefone, url, undefined, 'audio');
      }
      break;
    }

    case 'cta': {
      // WhatsApp não tem botão nativo fora do Business API — enviar como texto + link
      const texto = bloco.conteudo.texto_botao ?? '';
      const link = bloco.conteudo.url_destino ?? '';
      if (texto || link) {
        await sendTextMessage(config, telefone, [texto, link].filter(Boolean).join('\n'));
      }
      break;
    }

    case 'copy_code': {
      const texto = bloco.conteudo.texto_formatado ?? bloco.conteudo.texto_raw ?? '';
      const code = bloco.conteudo.copy_code ?? '';
      if (code.trim()) {
        // Grupos WhatsApp não suportam sendButtons — usar texto formatado como fallback
        const isGrupo = telefone.includes('@g.us');
        if (isGrupo) {
          const partes: string[] = [];
          if (texto) partes.push(texto);
          partes.push(`📋 *Código para copiar:*\n\`${code}\``);
          if (bloco.conteudo.copy_code_footer) partes.push(`_${bloco.conteudo.copy_code_footer}_`);
          await sendTextMessage(config, telefone, partes.join('\n\n'));
        } else {
          await sendButtonsMessage(
            config,
            telefone,
            texto || '📋 Toque para copiar seu código:',
            code,
            bloco.conteudo.copy_code_footer,
          );
        }
      }
      break;
    }

    default:
      console.warn(`[DISPATCHER] Tipo de bloco desconhecido: ${(bloco as Bloco).tipo}`);
  }
}

async function enviarBlocoComposto(
  telefone: string,
  blocos: Bloco[],
  tenantId: string
): Promise<void> {
  const ordenados = [...blocos].sort((a, b) => a.ordem - b.ordem);
  for (const bloco of ordenados) {
    await enviarBlocoViaWhatsApp(telefone, bloco, tenantId);
    if (bloco !== ordenados[ordenados.length - 1]) {
      await sleep(500); // 500ms entre blocos do mesmo contato
    }
  }
}

// ─── Processador principal da fila ──────────────────────────────────────────

export async function processarFilaCampanha(
  supabase: SupabaseClient,
  campanhaId: string,
  configOverride?: Partial<AntibanConfig>
): Promise<void> {
  const config = aplicarRegraCarol({ ...CONFIG_PADRAO, ...configOverride });

  // Carrega campanha
  const { data: campanha, error: errCampanha } = await supabase
    .from('campaigns')
    .select('id, tenant_id, status, config_antiban, cool_off_ate, sent_count')
    .eq('id', campanhaId)
    .single();

  if (errCampanha || !campanha) {
    console.error(`[DISPATCHER] Campanha ${campanhaId} não encontrada`);
    return;
  }

  const tenantId: string = campanha.tenant_id;
  const cfgAntiban: AntibanConfig = aplicarRegraCarol({ ...config, ...(campanha.config_antiban ?? {}) });

  // CRÍTICO: msgEnviadas deve ser persistente entre invocações do cron (Netlify timeout 26s).
  // Usar sent_count do banco garante que o cooloff é calculado corretamente mesmo após restart.
  let msgEnviadas: number = campanha.sent_count ?? 0;

  // ─── Loop principal ────────────────────────────────────────────────────────
  while (true) {
    // Verificar cancelamento
    const { data: statusCheck } = await supabase
      .from('campaigns')
      .select('status')
      .eq('id', campanhaId)
      .single();

    if (!statusCheck || ['cancelado', 'completed', 'cancelled'].includes(statusCheck.status)) {
      console.log(`[DISPATCHER] Campanha ${campanhaId} encerrada com status: ${statusCheck?.status}`);
      break;
    }

    if (statusCheck.status === 'paused') {
      await sleep(10_000); // aguarda 10s e re-verifica
      continue;
    }

    // Verificar janela horária
    if (!dentroJanelaHoraria(cfgAntiban.janela_horaria_inicio, cfgAntiban.janela_horaria_fim)) {
      console.log(`[DISPATCHER] Fora da janela horária. Aguardando...`);
      await aguardarJanelaHoraria(cfgAntiban.janela_horaria_inicio);
      continue;
    }

    // Buscar próximo job pendente
    // Usar .or() para incluir jobs com proximo_envio_em NULL (jobs antigos sem esse campo)
    const agora = new Date().toISOString();
    const { data: job, error: errJob } = await supabase
      .from('campaign_jobs')
      .select('*')
      .eq('campanha_id', campanhaId)
      .eq('status', 'pendente')
      .or(`proximo_envio_em.is.null,proximo_envio_em.lte.${agora}`)
      .order('ordem', { ascending: true })
      .limit(1)
      .single();

    if (errJob || !job) {
      // Nenhum job disponível agora — pode estar em cooloff ou concluída
      const { count: pendentesTotal } = await supabase
        .from('campaign_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('campanha_id', campanhaId)
        .eq('status', 'pendente');

      if (!pendentesTotal || pendentesTotal === 0) {
        // Campanha concluída
        await supabase
          .from('campaigns')
          .update({ status: 'completed', status_detalhe: 'Todos os envios concluídos' })
          .eq('id', campanhaId);
        console.log(`[DISPATCHER] Campanha ${campanhaId} concluída!`);
      } else {
        // Ainda tem jobs mas todos estão com proximo_envio_em no futuro (cooloff)
        console.log(`[DISPATCHER] Campanha ${campanhaId} em cooloff — ${pendentesTotal} jobs aguardando`);
      }
      break;
    }

    // Se havia cool_off_ate e o job já está disponível, limpar o flag
    if (campanha.cool_off_ate && new Date(campanha.cool_off_ate) <= new Date()) {
      await supabase
        .from('campaigns')
        .update({ status_detalhe: 'enviando', cool_off_ate: null })
        .eq('id', campanhaId);
    }

    // Marcar como enviando
    await supabase
      .from('campaign_jobs')
      .update({ status: 'enviando', iniciado_em: new Date().toISOString() })
      .eq('id', job.id);

    // Resolver variáveis nos blocos
    const contatoInfo: ContatoJob = {
      id: job.contato_id,
      telefone: job.contato_telefone,
      nome: job.contato_nome,
    };

    const blocosResolvidos = resolverBlocos(job.blocos as Bloco[], contatoInfo);

    // Tentar envio com retry
    let sucesso = false;
    let erroMsg = '';
    let erroCodigo = '';

    for (let tentativa = 1; tentativa <= cfgAntiban.max_tentativas; tentativa++) {
      try {
        await enviarBlocoComposto(job.contato_telefone, blocosResolvidos, tenantId);
        sucesso = true;
        break;
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string; code?: string };
        erroMsg = e?.message ?? 'Erro desconhecido';
        erroCodigo = String(e?.code ?? e?.status ?? '');

        // Rate limit → pausa de emergência 5min
        if (e?.status === 429 || erroCodigo === '429') {
          console.warn(`[DISPATCHER] Rate limit! Pausando 5 min...`);
          await supabase
            .from('campaigns')
            .update({ status: 'paused', status_detalhe: 'Rate limit ativo — aguardando 5min' })
            .eq('id', campanhaId);
          await sleep(5 * 60_000);
          await supabase
            .from('campaigns')
            .update({ status: 'running', status_detalhe: 'Retomado após rate limit' })
            .eq('id', campanhaId);
          break; // re-tenta na próxima iteração do loop externo
        }

        if (tentativa < cfgAntiban.max_tentativas) {
          const backoff = 30_000 * tentativa;
          console.log(`[DISPATCHER] Tentativa ${tentativa} falhou. Backoff ${backoff}ms`);
          await sleep(backoff);
        }
      }
    }

    if (sucesso) {
      await supabase
        .from('campaign_jobs')
        .update({ status: 'enviado', enviado_em: new Date().toISOString(), tentativas: 1 })
        .eq('id', job.id);

      // Atualizar contadores
      await supabase.rpc('increment_campaign_sent', { campanha_id: campanhaId });

      msgEnviadas++;

      // Cooloff a cada N mensagens — usando proximo_envio_em para não bloquear o cron
      // (Netlify timeout 26s: sleep(60s) seria morto antes de terminar)
      if (msgEnviadas % cfgAntiban.cooloff_a_cada === 0) {
        const coolOffMs = cfgAntiban.cooloff_duracao_ms;
        const coolOffAte = new Date(Date.now() + coolOffMs).toISOString();
        console.log(`[DISPATCHER] Cooloff ativado — próximo job em ${coolOffMs}ms (${coolOffAte})`);
        await supabase
          .from('campaigns')
          .update({ status_detalhe: 'cool_off', cool_off_ate: coolOffAte })
          .eq('id', campanhaId);
        // Agendar todos os jobs pendentes para depois do cooloff
        await supabase
          .from('campaign_jobs')
          .update({ proximo_envio_em: coolOffAte })
          .eq('campanha_id', campanhaId)
          .eq('status', 'pendente');
        // Encerrar essa invocação — o cron seguinte pegará os jobs quando o horário chegar
        break;
      }

      // Delay humanizado antes do próximo envio
      const delay = gerarDelayHumanizado(cfgAntiban.delay_min_ms, cfgAntiban.delay_max_ms);
      await sleep(delay);
    } else {
      // Esgotou tentativas
      await supabase
        .from('campaign_jobs')
        .update({
          status: 'erro',
          tentativas: cfgAntiban.max_tentativas,
          erro_mensagem: erroMsg,
          erro_codigo: erroCodigo,
        })
        .eq('id', job.id);

      await supabase.rpc('increment_campaign_failed', { campanha_id: campanhaId });
    }
  }
}
