/**
 * Jarvis — Seleção autônoma de públicos Meta.
 * Busca custom audiences da conta, consulta regras de negócio na jarvis_knowledge,
 * chama Claude Haiku para decidir e retorna os IDs e a justificativa.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { META_BASE } from '@/lib/meta-config';

const JARVIS_MODEL = process.env.JARVIS_MODEL ?? 'claude-haiku-4-5-20251001';

export interface AudienceSelectorResult {
  ids: string[];             // IDs dos custom audiences escolhidos (pode ser vazio)
  justificativa: string;     // Explicação da escolha para salvar no jarvis_log
}

interface MetaAudience {
  id: string;
  name: string;
  subtype?: string;
  approximate_count_lower_bound?: number;
  description?: string;
}

/** Busca todos os custom audiences da conta Meta. */
async function buscarAudiencesMeta(token: string, actId: string): Promise<MetaAudience[]> {
  try {
    const res = await fetch(
      `${META_BASE}/${actId}/customaudiences?fields=id,name,subtype,approximate_count_lower_bound,description&limit=50&access_token=${token}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return [];
    const json = await res.json() as { data?: MetaAudience[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

/** Busca regras de segmentação da jarvis_knowledge. */
async function buscarRegraSegmentacao(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  tenantId: string,
): Promise<string> {
  const { data } = await supabase
    .from('jarvis_knowledge')
    .select('conteudo')
    .eq('tenant_id', tenantId)
    .eq('categoria', 'segmentacao')
    .order('created_at', { ascending: false })
    .limit(5);

  if (!data?.length) return '';
  return data.map((r: { conteudo: string }) => r.conteudo).join('\n---\n');
}

/**
 * Seleciona autonomamente quais custom audiences usar para uma campanha.
 *
 * @param supabase  - cliente Supabase server-side
 * @param tenantId  - UUID do tenant
 * @param token     - Meta access token
 * @param actId     - Meta ad account ID (ex: "act_1244920119465862")
 * @param tipo      - tipo de campanha (ex: "whatsapp", "catalogo", "video", "leads")
 * @returns { ids, justificativa }
 */
export async function escolherPublicos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  tenantId: string,
  token: string,
  actId: string,
  tipo: string,
): Promise<AudienceSelectorResult> {
  // ── 1. Buscar dados em paralelo ─────────────────────────────────────────
  const [audiences, regras] = await Promise.all([
    buscarAudiencesMeta(token, actId),
    buscarRegraSegmentacao(supabase, tenantId),
  ]);

  // ── 2. Se não há públicos, retornar vazio com justificativa ─────────────
  if (audiences.length === 0) {
    return {
      ids: [],
      justificativa: 'Nenhum custom audience encontrado na conta. Usando targeting por interesse/demografia padrão.',
    };
  }

  // ── 3. Chamar Claude Haiku ──────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // fallback sem IA: escolhe os 2 primeiros públicos com "lookalike" ou "revendedora" no nome
    const fallback = audiences
      .filter(a => /lookalike|revendedora|clientes/i.test(a.name))
      .slice(0, 2)
      .map(a => a.id);
    return {
      ids: fallback,
      justificativa: `Anthropic key ausente — fallback por nome: ${fallback.length ? audiences.filter(a => fallback.includes(a.id)).map(a => a.name).join(', ') : 'nenhum selecionado'}`,
    };
  }

  const audiencesResumo = audiences.map(a =>
    `- ID: ${a.id} | Nome: ${a.name} | Tipo: ${a.subtype ?? '?'} | Tamanho: ~${a.approximate_count_lower_bound ?? '?'}`,
  ).join('\n');

  const prompt = `Você é o JARVIS, especialista em tráfego pago para CJ Rasteirinhas (atacado de rasteirinhas femininas, Brasil).

TIPO DE CAMPANHA: ${tipo}

PÚBLICOS DISPONÍVEIS NA CONTA META:
${audiencesResumo}

REGRAS DE NEGÓCIO (jarvis_knowledge):
${regras || 'Sem regras cadastradas. Use bom senso: prefira lookalikes de clientes e remarketing de engajamento.'}

TAREFA: Escolha os IDs dos públicos mais adequados para esta campanha do tipo "${tipo}".
- Retorne NO MÁXIMO 3 IDs
- Prefira lookalikes de compradores/clientes para campanhas de aquisição
- Prefira remarketing de engajamento para campanhas de conversão
- Se nenhum público for adequado, retorne array vazio
- Retorne APENAS JSON válido, sem texto adicional

Formato esperado:
{"ids": ["123", "456"], "justificativa": "Escolhi X porque..."}`;

  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: JARVIS_MODEL,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = resp.content[0].type === 'text' ? resp.content[0].text.trim() : '';
    // Extrair JSON mesmo se vier com markdown fences
    const jsonStr = text.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr) as { ids?: string[]; justificativa?: string };

    return {
      ids: Array.isArray(parsed.ids) ? parsed.ids : [],
      justificativa: parsed.justificativa ?? 'Seleção automática pelo Jarvis.',
    };
  } catch (err) {
    console.error('[jarvis-audience-selector] Erro ao chamar Haiku:', err);
    return {
      ids: [],
      justificativa: `Erro na seleção automática: ${String(err)}. Sem custom audiences aplicados.`,
    };
  }
}
