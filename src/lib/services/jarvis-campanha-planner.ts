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
  tipo: 'frio' | 'quente' | 'whatsapp';
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
}

/* ─── Resposta bruta do Jarvis ───────────────────────────────────────────── */

interface JarvisResposta {
  nome_sugerido: string;
  resumo_estrategia: string;
  conjuntos: Array<{
    tipo: 'frio' | 'quente' | 'whatsapp';
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

/* ─── Função principal ───────────────────────────────────────────────────── */

export async function jarvisPlanejarCampanha(
  tenantId: string,
  criativos: CriativoSelecionado[],
  objetivo: string,
  orcamentoTotal: number,
  anthropicApiKey?: string,
): Promise<PlanoCampanha> {
  const client = getAnthropicClient(anthropicApiKey);
  const criativosResumidos = criativos.map(c => ({
    id: c.id,
    nome: c.nome,
    tipo: c.tipo,
    scores: c.classificacao ? {
      frio:     c.classificacao.adequacao_publico_frio,
      quente:   c.classificacao.adequacao_publico_quente,
      whatsapp: c.classificacao.adequacao_whatsapp,
      tem_cta:  c.classificacao.tem_cta,
      resumo:   c.classificacao.resumo ?? '',
    } : null,
  }));

  const response = await client.messages.create({
    model: JARVIS_MODEL,
    max_tokens: 2000,
    system: `Você é o Jarvis, o agente de tráfego da CJ Rasteirinhas.
CJ Rasteirinhas é uma fábrica de rasteirinhas femininas em Goiânia.
Público: revendedoras mulheres, 25-55 anos, Brasil.
Sua tarefa: distribuir criativos entre conjuntos de anúncios de forma inteligente.

Regras:
- Cada conjunto precisa de no mínimo 3 criativos
- Sempre criar 3 conjuntos: frio, quente e whatsapp
- Público FRIO: criativos com alto score frio — vídeos com hooks fortes
- Público QUENTE: criativos com alto score quente — vídeos de prova social
- WhatsApp: criativos com alto score whatsapp — vídeos diretos com CTA claro
- Criativos podem ser usados em mais de um conjunto
- Se tiver menos de 9 criativos, duplicar os melhores para completar os conjuntos
- Distribuir orçamento: 40% frio, 30% quente, 30% whatsapp

Responda APENAS em JSON válido, sem markdown, sem explicação fora do JSON.`,
    messages: [{
      role: 'user',
      content: `Criativos disponíveis: ${JSON.stringify(criativosResumidos)}
Objetivo: ${objetivo}
Orçamento total: R$${orcamentoTotal}/dia

Retorne um JSON com esta estrutura exata:
{
  "nome_sugerido": "string",
  "resumo_estrategia": "string — 2-3 frases explicando a estratégia",
  "conjuntos": [
    {
      "tipo": "frio",
      "label": "Público Frio",
      "criativo_ids": ["id1", "id2", "id3"],
      "justificativa": "string — por que esses criativos para este público",
      "orcamento_sugerido": ${Math.round(orcamentoTotal * 0.4)}
    },
    {
      "tipo": "quente",
      "label": "Público Quente",
      "criativo_ids": ["id1", "id2", "id3"],
      "justificativa": "string",
      "orcamento_sugerido": ${Math.round(orcamentoTotal * 0.3)}
    },
    {
      "tipo": "whatsapp",
      "label": "WhatsApp",
      "criativo_ids": ["id1", "id2", "id3"],
      "justificativa": "string",
      "orcamento_sugerido": ${Math.round(orcamentoTotal * 0.3)}
    }
  ],
  "copy_por_conjunto": {
    "frio":     { "headline": "string", "texto": "string", "cta": "LEARN_MORE" },
    "quente":   { "headline": "string", "texto": "string", "cta": "LEARN_MORE" },
    "whatsapp": { "headline": "string", "texto": "string", "cta": "WHATSAPP_MESSAGE" }
  }
}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  const clean = text.replace(/```json|```/g, '').trim();

  let jarvisRaw: JarvisResposta;
  try {
    jarvisRaw = JSON.parse(clean) as JarvisResposta;
  } catch {
    // Fallback: distribuição automática por score
    jarvisRaw = fallbackDistribuicao(criativos, objetivo, orcamentoTotal);
  }

  // Montar PlanoCampanha com criativos reais (não só IDs)
  const criativosMap = new Map(criativos.map(c => [c.id, c]));
  const conjuntos: PlanoConjunto[] = (jarvisRaw.conjuntos ?? []).map(cj => {
    const criativosDoConjunto = (cj.criativo_ids ?? [])
      .map(id => criativosMap.get(id))
      .filter((c): c is CriativoSelecionado => c != null);
    return {
      tipo: cj.tipo,
      label: cj.label ?? cj.tipo,
      criativos: criativosDoConjunto,
      justificativa: cj.justificativa ?? '',
      orcamento_sugerido: cj.orcamento_sugerido ?? Math.round(orcamentoTotal / 3),
    };
  });

  const plano: PlanoCampanha = {
    objetivo,
    nome_sugerido: jarvisRaw.nome_sugerido ?? `Agente ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`,
    orcamento_total: orcamentoTotal,
    conjuntos,
    resumo_estrategia: jarvisRaw.resumo_estrategia ?? '',
    copy_por_conjunto: jarvisRaw.copy_por_conjunto ?? {},
  };

  // Salvar plano na memória do Jarvis (fire-and-forget)
  const supabase = createServerSupabaseClient();
  supabase.from('jarvis_memoria').insert({
    tenant_id: tenantId,
    tipo: 'plano_campanha',
    titulo: plano.nome_sugerido,
    contexto: {
      objetivo,
      orcamento_total: orcamentoTotal,
      total_criativos: criativos.length,
      conjuntos: conjuntos.map(c => ({ tipo: c.tipo, total_criativos: c.criativos.length })),
    },
    resultado: null,
    aprendizado: null,
  }).then(({ error }) => { if (error) console.warn('[Jarvis] Erro ao salvar plano:', error.message); });

  return plano;
}

/* ─── Fallback sem IA ────────────────────────────────────────────────────── */

function fallbackDistribuicao(
  criativos: CriativoSelecionado[],
  objetivo: string,
  orcamentoTotal: number,
): JarvisResposta {
  function topIds(scoreKey: 'adequacao_publico_frio' | 'adequacao_publico_quente' | 'adequacao_whatsapp'): string[] {
    const sorted = [...criativos].sort((a, b) => {
      const sa = a.classificacao?.[scoreKey] ?? 5;
      const sb = b.classificacao?.[scoreKey] ?? 5;
      return sb - sa;
    });
    const top = sorted.slice(0, 3).map(c => c.id);
    // Completar com duplicatas se necessário
    while (top.length < 3 && criativos.length > 0) top.push(criativos[0].id);
    return top;
  }

  return {
    nome_sugerido: `Agente ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`,
    resumo_estrategia: 'Distribuição automática baseada nos scores de classificação dos criativos.',
    conjuntos: [
      { tipo: 'frio',     label: 'Público Frio',    criativo_ids: topIds('adequacao_publico_frio'),    justificativa: 'Melhores scores para público frio.',    orcamento_sugerido: Math.round(orcamentoTotal * 0.4) },
      { tipo: 'quente',   label: 'Público Quente',  criativo_ids: topIds('adequacao_publico_quente'),  justificativa: 'Melhores scores para público quente.',  orcamento_sugerido: Math.round(orcamentoTotal * 0.3) },
      { tipo: 'whatsapp', label: 'WhatsApp',         criativo_ids: topIds('adequacao_whatsapp'),        justificativa: 'Melhores scores para WhatsApp.',        orcamento_sugerido: Math.round(orcamentoTotal * 0.3) },
    ],
    copy_por_conjunto: {
      frio:     { headline: 'Rasteirinhas direto da fábrica', texto: 'Mínimo 5 pares. Entrega para todo o Brasil. Seja uma revendedora CJ.', cta: 'LEARN_MORE' },
      quente:   { headline: 'Você já nos conhece!',           texto: 'Aproveite as novidades da coleção. Novas cores, novos modelos.', cta: 'LEARN_MORE' },
      whatsapp: { headline: 'Fale com a gente agora',         texto: 'Condições especiais de atacado. Entrega garantida para revendedoras.', cta: 'WHATSAPP_MESSAGE' },
    },
  };
}
