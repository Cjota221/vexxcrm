/**
 * JARVIS — Planejador inteligente de campanhas.
 * Recebe criativos selecionados e distribui entre conjuntos com justificativa.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase';

const JARVIS_MODEL = process.env.JARVIS_MODEL ?? 'claude-haiku-4-5-20251001';

function getAnthropicClient(apiKey?: string): Anthropic {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY não configurada.');
  return new Anthropic({ apiKey: key });
}

/* ─── Tipos públicos ─────────────────────────────────────────────────────── */

export interface CriativoSelecionado {
  id: string;
  nome: string;
  tipo: 'video' | 'imagem';
  meta_video_id?: string;
  meta_image_hash?: string;
  url_preview?: string;
  classificacao?: {
    adequacao_publico_frio: number;
    adequacao_publico_quente: number;
    adequacao_whatsapp: number;
    tipo_conteudo: string;
    tom: string;
    tem_cta: boolean;
    resumo?: string;
  } | null;
}

export interface PlanoConjunto {
  tipo: 'frio' | 'quente' | 'whatsapp' | 'catalogo';
  label: string;
  criativos: CriativoSelecionado[];
  justificativa: string;
  orcamento_sugerido: number;
}

export interface PlanoCampanha {
  objetivo: string;
  nome_sugerido: string;
  orcamento_total: number;
  conjuntos: PlanoConjunto[];
  resumo_estrategia: string;
  copy_por_conjunto: Record<string, {
    headline: string;
    texto: string;
    cta: string;
  }>;
  /** Aviso exibido ao usuário na tela de aprovação do plano */
  aviso?: string;
}

/* ─── Resposta bruta do Jarvis ───────────────────────────────────────────── */

interface JarvisResposta {
  nome_sugerido: string;
  resumo_estrategia: string;
  conjuntos: Array<{
    tipo: 'frio' | 'quente' | 'whatsapp' | 'catalogo';
    label: string;
    criativo_ids: string[];
    justificativa: string;
    orcamento_sugerido: number;
  }>;
  copy_por_conjunto: Record<string, {
    headline: string;
    texto: string;
    cta: string;
  }>;
}

/* ─── Contexto fixo do negócio CJ ───────────────────────────────────────── */

const NEGOCIO_CJ = `NEGÓCIO: CJ Rasteirinhas — atacado de rasteirinhas femininas, fabricação própria, Goiânia-GO.
PRODUTO: Rasteirinhas femininas. Pedido mínimo: 5 pares. Preço atacado: R$25 a R$49,90/par.
PÚBLICO: Mulheres 25-55 anos que querem renda extra revendendo. Empreendedoras e revendedoras.
SEM PROMOÇÕES ATIVAS no momento — não há descontos percentuais, frete grátis ou ofertas temporárias.
REGRA ANTI-ALUCINAÇÃO: NUNCA invente descontos, percentuais, condições de frete, cupons,
prazos de oferta ou qualquer informação que não foi fornecida explicitamente neste contexto.
Se não tem dados, não mencione. Use apenas fatos reais acima.`;

const REGRAS_CRIATIVOS = `REGRAS DE DISTRIBUIÇÃO CRIATIVO × PÚBLICO:
- FRIO (nunca viu a marca): use apresentacao_produto, catalogo, lifestyle.
  NUNCA use unboxing, depoimento ou prova_social em público frio — eles não conhecem a marca ainda.
- QUENTE (já engajou com a marca): use depoimento, prova_social, resultado_revendedora, unboxing.
- WHATSAPP: use vídeos curtos e diretos com CTA para conversa. prova_social e depoimento funcionam bem.

Match tipo_conteudo → conjunto permitido:
apresentacao_produto → frio
catalogo → frio
lifestyle → frio
depoimento → quente, whatsapp
unboxing → quente, whatsapp
prova_social → quente, whatsapp
outro/desconhecido → qualquer conjunto`;

const REGRAS_COPY = `REGRAS DE COPY:
- headline: máx 40 caracteres. Direto. Focado no benefício real (renda extra, revenda, qualidade).
- texto: máx 125 caracteres. Urgente mas real. Sem promoções inventadas.
- Frio: foque em apresentar o produto/oportunidade de negócio.
- Quente: foque em recomprar, novidades, expandir o negócio.
- WhatsApp: foque em conversa, atendimento, condições de atacado.`;

/* ─── Função principal ───────────────────────────────────────────────────── */

export async function jarvisPlanejarCampanha(
  tenantId: string,
  criativos: CriativoSelecionado[],
  objetivo: string,
  orcamentoTotal: number,
  tipos?: string[],
  anthropicApiKey?: string,
): Promise<PlanoCampanha> {
  // Tipos válidos (sem catálogo — catálogo não usa planner de criativos)
  const tiposParaPlanejar = (tipos ?? ['frio', 'quente', 'whatsapp'])
    .filter(t => t !== 'catalogo' && ['frio', 'quente', 'whatsapp'].includes(t));
  const tiposFinais = tiposParaPlanejar.length > 0
    ? tiposParaPlanejar
    : ['frio', 'quente', 'whatsapp'];

  console.log('[Jarvis Planner] INICIO — criativos:', criativos.length, 'objetivo:', objetivo, 'tipos:', tiposFinais);

  try {
    const supabase = createServerSupabaseClient();
    const client   = getAnthropicClient(anthropicApiKey);

    // Buscar base de conhecimento do tenant (jarvis_knowledge)
    const { data: knowledgeDocs } = await supabase
      .from('jarvis_knowledge')
      .select('titulo, conteudo, categoria')
      .eq('tenant_id', tenantId)
      .eq('ativo', true)
      .order('created_at', { ascending: false })
      .limit(15);

    const baseConhecimento = (knowledgeDocs && knowledgeDocs.length > 0)
      ? knowledgeDocs
          .map(k => `[${(k as Record<string, string>).categoria}] ${(k as Record<string, string>).titulo}: ${(k as Record<string, string>).conteudo}`)
          .join('\n')
          .slice(0, 2500)
      : null;

    console.log(`[Jarvis Planner] Base de conhecimento: ${knowledgeDocs?.length ?? 0} documentos`);

    // Payload com tipo_conteudo e tom — essencial para match criativo × público
    const criativosSimplificados = criativos.map(c => ({
      id:            c.id,
      nome:          c.nome.slice(0, 30),
      tipo:          c.tipo,
      tipo_conteudo: c.classificacao?.tipo_conteudo ?? 'desconhecido',
      tom:           c.classificacao?.tom ?? 'neutro',
      scores: c.classificacao ? {
        frio:     c.classificacao.adequacao_publico_frio,
        quente:   c.classificacao.adequacao_publico_quente,
        whatsapp: c.classificacao.adequacao_whatsapp,
        tem_cta:  c.classificacao.tem_cta,
      } : null,
    }));

    // Distribuição de orçamento por tipo
    const PESOS: Record<string, number> = { frio: 0.4, quente: 0.3, whatsapp: 0.3 };
    const pesoTotal = tiposFinais.reduce((acc, t) => acc + (PESOS[t] ?? 0.33), 0);
    const orcPorTipo = Object.fromEntries(
      tiposFinais.map(t => [t, Math.round(orcamentoTotal * (PESOS[t] ?? 0.33) / pesoTotal)])
    );

    const LABEL: Record<string, string> = { frio: 'Público Frio', quente: 'Público Quente', whatsapp: 'WhatsApp' };
    const CTA_DEFAULT: Record<string, string> = { whatsapp: 'WHATSAPP_MESSAGE' };

    // Descrição dinâmica dos conjuntos para o prompt
    const descConjuntos = tiposFinais.map(t => {
      const pct = Math.round(((PESOS[t] ?? 0.33) / pesoTotal) * 100);
      return `${LABEL[t] ?? t} (${pct}% orç)`;
    }).join(', ');

    // Template JSON dinâmico baseado nos tipos solicitados
    const jsonTemplate = JSON.stringify({
      nome_sugerido: '',
      resumo_estrategia: '',
      conjuntos: tiposFinais.map(t => ({
        tipo: t,
        label: LABEL[t] ?? t,
        criativo_ids: [] as string[],
        justificativa: '',
        orcamento_sugerido: orcPorTipo[t] ?? Math.round(orcamentoTotal / tiposFinais.length),
      })),
      copy_por_conjunto: Object.fromEntries(
        tiposFinais.map(t => [t, { headline: '', texto: '', cta: CTA_DEFAULT[t] ?? 'LEARN_MORE' }])
      ),
    });

    // System prompt completo com contexto real do negócio
    const systemPrompt = [
      `Você é o Jarvis, agente de tráfego da CJ Rasteirinhas.`,
      NEGOCIO_CJ,
      REGRAS_CRIATIVOS,
      REGRAS_COPY,
      baseConhecimento ? `BASE DE CONHECIMENTO ADICIONAL:\n${baseConhecimento}` : '',
      `Distribua os criativos nos seguintes conjuntos: ${descConjuntos}.`,
      `Mínimo 1 criativo por conjunto. Pode repetir entre conjuntos se necessário.`,
      `Responda APENAS JSON válido, sem markdown, sem texto extra.`,
    ].filter(Boolean).join('\n\n');

    const abortCtrl = new AbortController();
    const timeoutId = setTimeout(() => abortCtrl.abort(), 25000);

    console.log('[Jarvis Planner] Chamando Anthropic API...');
    const startAnthro = Date.now();

    let response: Awaited<ReturnType<typeof client.messages.create>>;
    try {
      response = await client.messages.create(
        {
          model:      JARVIS_MODEL,
          max_tokens: 2500,
          system:     systemPrompt,
          messages: [{
            role:    'user',
            content: `Criativos disponíveis: ${JSON.stringify(criativosSimplificados)}
Objetivo: ${objetivo} | Orçamento: R$${orcamentoTotal}/dia | Conjuntos: ${tiposFinais.join(', ')}

Retorne JSON com esta estrutura exata (apenas os conjuntos listados acima):
${jsonTemplate}`,
          }],
        },
        { signal: abortCtrl.signal },
      );
    } finally {
      clearTimeout(timeoutId);
    }

    console.log('[Jarvis Planner] Anthropic respondeu em', Date.now() - startAnthro, 'ms');
    console.log('[Jarvis Planner] stop_reason:', response!.stop_reason);

    const text  = response!.content[0].type === 'text' ? response!.content[0].text : '{}';
    const clean = text.replace(/```json|```/g, '').trim();

    console.log('[Jarvis Planner] Response body raw:', text.slice(0, 500));
    console.log('[Jarvis Planner] Parseando JSON...');

    let jarvisRaw: JarvisResposta;
    try {
      let jsonToParse = clean;

      // Se cortou no meio (max_tokens), tentar recuperar até o último } válido
      if (response!.stop_reason === 'max_tokens') {
        console.warn('[Jarvis Planner] Resposta cortada — tentando parsear parcialmente');
        const ultimoFechamento = clean.lastIndexOf('}');
        if (ultimoFechamento > 0) {
          jsonToParse = clean.slice(0, ultimoFechamento + 1);
          const abre  = (jsonToParse.match(/\{/g) ?? []).length;
          const fecha = (jsonToParse.match(/\}/g) ?? []).length;
          jsonToParse += '}'.repeat(Math.max(0, abre - fecha));
        }
      }

      jarvisRaw = JSON.parse(jsonToParse) as JarvisResposta;
      console.log('[Jarvis Planner] JSON parseado OK — conjuntos:', jarvisRaw.conjuntos?.length);
    } catch (parseErr) {
      console.warn('[Jarvis Planner] Falha no parse, usando fallback. Erro:', String(parseErr));
      jarvisRaw = fallbackDistribuicao(criativos, objetivo, orcamentoTotal, tiposFinais);
    }

    // Montar PlanoCampanha com criativos reais (não só IDs)
    const criativosMap = new Map(criativos.map(c => [c.id, c]));
    const conjuntos: PlanoConjunto[] = (jarvisRaw.conjuntos ?? []).map(cj => {
      const criativosDoConjunto = (cj.criativo_ids ?? [])
        .map(id => criativosMap.get(id))
        .filter((c): c is CriativoSelecionado => c != null);
      return {
        tipo:              cj.tipo,
        label:             cj.label ?? cj.tipo,
        criativos:         criativosDoConjunto,
        justificativa:     cj.justificativa ?? '',
        orcamento_sugerido: cj.orcamento_sugerido ?? Math.round(orcamentoTotal / 3),
      };
    });

    const plano: PlanoCampanha = {
      objetivo,
      nome_sugerido:      jarvisRaw.nome_sugerido ?? `Agente ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`,
      orcamento_total:    orcamentoTotal,
      conjuntos,
      resumo_estrategia:  jarvisRaw.resumo_estrategia ?? '',
      copy_por_conjunto:  jarvisRaw.copy_por_conjunto ?? {},
    };

    console.log('[Jarvis Planner] Plano montado — conjuntos:', conjuntos.length);

    // Salvar plano na memória — fire-and-forget
    supabase.from('jarvis_memoria').insert({
      tenant_id: tenantId,
      tipo:      'plano_campanha',
      titulo:    plano.nome_sugerido,
      contexto: {
        objetivo,
        orcamento_total: orcamentoTotal,
        total_criativos: criativos.length,
        usou_base_conhecimento: !!baseConhecimento,
        conjuntos: conjuntos.map(c => ({ tipo: c.tipo, total_criativos: c.criativos.length })),
      },
      resultado:   null,
      aprendizado: null,
    })
      .then(({ error }) => {
        if (error) console.warn('[Jarvis] Erro ao salvar plano:', error.message);
        else console.log('[Jarvis] Plano salvo');
      });

    return plano;

  } catch (err) {
    console.error('[Jarvis Planner] ERRO COMPLETO:', err);
    console.error('[Jarvis Planner] Stack:', err instanceof Error ? err.stack : String(err));
    throw err;
  }
}

/* ─── Fallback sem IA ────────────────────────────────────────────────────── */

function fallbackDistribuicao(
  criativos: CriativoSelecionado[],
  objetivo: string,
  orcamentoTotal: number,
  tipos?: string[],
): JarvisResposta {
  const tiposUsados = (tipos ?? ['frio', 'quente', 'whatsapp']).filter(t => t !== 'catalogo');

  // Fallback considera tipo_conteudo para match semântico
  const TIPOS_FRIO   = new Set(['apresentacao_produto', 'catalogo', 'lifestyle']);
  const TIPOS_QUENTE = new Set(['depoimento', 'prova_social', 'resultado_revendedora', 'unboxing']);

  const PESOS_FB: Record<string, number> = { frio: 0.4, quente: 0.3, whatsapp: 0.3 };
  const pesoTotal = tiposUsados.reduce((acc, t) => acc + (PESOS_FB[t] ?? 0.33), 0);

  function topIds(
    scoreKey: 'adequacao_publico_frio' | 'adequacao_publico_quente' | 'adequacao_whatsapp',
    preferTipos?: Set<string>,
    excludeTipos?: Set<string>,
  ): string[] {
    const candidatos = [...criativos]
      .filter(c => {
        const tc = c.classificacao?.tipo_conteudo ?? '';
        if (excludeTipos && excludeTipos.has(tc)) return false;
        return true;
      })
      .sort((a, b) => {
        const tcA = a.classificacao?.tipo_conteudo ?? '';
        const tcB = b.classificacao?.tipo_conteudo ?? '';
        const bonusA = preferTipos?.has(tcA) ? 2 : 0;
        const bonusB = preferTipos?.has(tcB) ? 2 : 0;
        const sa = (a.classificacao?.[scoreKey] ?? 5) + bonusA;
        const sb = (b.classificacao?.[scoreKey] ?? 5) + bonusB;
        return sb - sa;
      });

    const top = candidatos.slice(0, 3).map(c => c.id);
    while (top.length < 1 && criativos.length > 0) top.push(criativos[0].id);
    return top;
  }

  const CONJUNTOS_CFG: Record<string, {
    label: string;
    scoreKey: 'adequacao_publico_frio' | 'adequacao_publico_quente' | 'adequacao_whatsapp';
    preferTipos?: Set<string>;
    excludeTipos?: Set<string>;
    justificativa: string;
  }> = {
    frio:     { label: 'Público Frio',   scoreKey: 'adequacao_publico_frio',   preferTipos: TIPOS_FRIO,   excludeTipos: TIPOS_QUENTE, justificativa: 'Criativos de apresentação para público que não conhece a marca.' },
    quente:   { label: 'Público Quente', scoreKey: 'adequacao_publico_quente', preferTipos: TIPOS_QUENTE, excludeTipos: TIPOS_FRIO,   justificativa: 'Prova social e depoimentos para público que já engajou.' },
    whatsapp: { label: 'WhatsApp',       scoreKey: 'adequacao_whatsapp',       preferTipos: TIPOS_QUENTE, excludeTipos: undefined,    justificativa: 'Vídeos diretos com CTA para conversa no WhatsApp.' },
  };

  const COPY_FB: Record<string, { headline: string; texto: string; cta: string }> = {
    frio:     { headline: 'Rasteirinhas direto da fábrica', texto: 'Mínimo 5 pares, R$25 a R$49,90/par. Seja uma revendedora CJ.', cta: 'LEARN_MORE' },
    quente:   { headline: 'Você já nos conhece!',           texto: 'Novidades na coleção. Peça mínima: 5 pares.', cta: 'LEARN_MORE' },
    whatsapp: { headline: 'Fale com a gente agora',         texto: 'Condições de atacado direto da fábrica. Pedido mínimo: 5 pares.', cta: 'WHATSAPP_MESSAGE' },
  };

  const conjuntos = tiposUsados.map(t => {
    const cfg = CONJUNTOS_CFG[t];
    const orcPct = (PESOS_FB[t] ?? 0.33) / pesoTotal;
    return {
      tipo: t as 'frio' | 'quente' | 'whatsapp',
      label: cfg?.label ?? t,
      criativo_ids: cfg
        ? topIds(cfg.scoreKey, cfg.preferTipos, cfg.excludeTipos)
        : [criativos[0]?.id].filter(Boolean) as string[],
      justificativa: cfg?.justificativa ?? '',
      orcamento_sugerido: Math.round(orcamentoTotal * orcPct),
    };
  });

  const copy_por_conjunto = Object.fromEntries(
    tiposUsados.map(t => [t, COPY_FB[t] ?? { headline: 'CJ Rasteirinhas', texto: 'Rasteirinhas direto da fábrica.', cta: 'LEARN_MORE' }])
  );

  return {
    nome_sugerido:     `Agente ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`,
    resumo_estrategia: 'Distribuição automática com match semântico criativo × público.',
    conjuntos,
    copy_por_conjunto,
  };
}
