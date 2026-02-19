import { SupabaseClient } from '@supabase/supabase-js';
import {
  getTenantEvolutionConfig,
  sendTextMessage,
  sendMediaMessage,
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
}

export interface Bloco {
  id: string;
  ordem: number;
  tipo: 'imagem' | 'video' | 'audio' | 'texto' | 'cta';
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

export const CONFIG_PADRAO: AntibanConfig = {
  delay_min_ms: 15_000,
  delay_max_ms: 45_000,
  cooloff_a_cada: 20,
  cooloff_duracao_ms: 120_000,
  max_tentativas: 3,
  janela_horaria_inicio: 8,
  janela_horaria_fim: 20,
};

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

/** Aplica variáveis em todos os blocos de texto/cta */
export function resolverBlocos(blocos: Bloco[], contato: ContatoJob): Bloco[] {
  return blocos.map(bloco => {
    if (bloco.tipo === 'imagem' || bloco.tipo === 'video' || bloco.tipo === 'audio') return bloco;
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
  const jobs = destinatarios.map((c, i) => ({
    campanha_id: campanhaId,
    tenant_id: tenantId,
    contato_id: c.id,
    contato_telefone: c.telefone,
    contato_nome: c.nome ?? null,
    blocos,
    ordem: i + 1,
    status: 'pendente',
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
        const caption = bloco.conteudo.texto_raw || undefined;
        await sendMediaMessage(config, telefone, url, caption, 'image');
      }
      break;
    }

    case 'video': {
      const url = bloco.conteudo.url;
      if (url) {
        const caption = bloco.conteudo.texto_raw || undefined;
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
  const config = { ...CONFIG_PADRAO, ...configOverride };

  // Carrega campanha
  const { data: campanha, error: errCampanha } = await supabase
    .from('campaigns')
    .select('id, tenant_id, status, config_antiban, cool_off_ate')
    .eq('id', campanhaId)
    .single();

  if (errCampanha || !campanha) {
    console.error(`[DISPATCHER] Campanha ${campanhaId} não encontrada`);
    return;
  }

  const tenantId: string = campanha.tenant_id;
  const cfgAntiban: AntibanConfig = { ...config, ...(campanha.config_antiban ?? {}) };

  let msgEnviadas = 0;

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
    const { data: job, error: errJob } = await supabase
      .from('campaign_jobs')
      .select('*')
      .eq('campanha_id', campanhaId)
      .eq('status', 'pendente')
      .lte('proximo_envio_em', new Date().toISOString())
      .order('ordem', { ascending: true })
      .limit(1)
      .single();

    if (errJob || !job) {
      // Nenhum job pendente → campanha concluída
      await supabase
        .from('campaigns')
        .update({ status: 'completed', status_detalhe: 'Todos os envios concluídos' })
        .eq('id', campanhaId);
      console.log(`[DISPATCHER] Campanha ${campanhaId} concluída!`);
      break;
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

      // Cooloff a cada N mensagens
      if (msgEnviadas % cfgAntiban.cooloff_a_cada === 0) {
        const coolOffAte = new Date(Date.now() + cfgAntiban.cooloff_duracao_ms).toISOString();
        console.log(`[DISPATCHER] Cooloff ativado por ${cfgAntiban.cooloff_duracao_ms}ms`);
        await supabase
          .from('campaigns')
          .update({ status_detalhe: 'cool_off', cool_off_ate: coolOffAte })
          .eq('id', campanhaId);
        await sleep(cfgAntiban.cooloff_duracao_ms);
        await supabase
          .from('campaigns')
          .update({ status_detalhe: 'enviando', cool_off_ate: null })
          .eq('id', campanhaId);
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
