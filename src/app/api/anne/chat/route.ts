import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import { buildSystemPrompt } from '@/lib/anne-prompt';
import type { AIProvider } from '@/lib/services/anne.service';
import {
  ANNE_TOOLS,
  ANNE_TOOLS_SYSTEM_ADDENDUM,
  executeAnneTool,
  type AnneTool,
} from '@/lib/anne/tools';

/** Máximo de mensagens do histórico enviadas à IA (controla custo de tokens) */
const MAX_HISTORY = 10;

const OPENAI_COMPATIBLE_PROVIDERS: AIProvider[] = ['openai', 'groq'];

const PROVIDER_BASE_URLS: Record<AIProvider, string> = {
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
};

/* ─────────────────────────────────────────────────────────────────────────
   TIPOS DO PROTOCOLO OPENAI TOOL CALLING
   ───────────────────────────────────────────────────────────────────────── */

interface OAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

type OAIMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OAIToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

/* ─────────────────────────────────────────────────────────────────────────
   LOOP DE TOOL CALLING (OpenAI-compatible)
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Executa uma conversa com tools habilitadas num loop até obter resposta final.
 * Suporta múltiplas rodadas: chamada → execução de tool → chamada → ... → resposta.
 *
 * Timeout: para campanhas com muitos clientes, configure maxDuration na rota.
 * Limite de iterações: 5 (evita loops infinitos).
 */
async function runWithTools(opts: {
  apiKey: string;
  model: string;
  baseUrl: string;
  systemPrompt: string;
  chatHistory: Array<{ role: string; content: string }>;
  userMessage: string;
  tools: AnneTool[];
  tenantId: string;
}): Promise<{
  reply: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}> {
  const { apiKey, model, baseUrl, systemPrompt, chatHistory, userMessage, tools, tenantId } = opts;

  const messages: OAIMessage[] = [
    { role: 'system', content: systemPrompt },
    ...chatHistory.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ];

  let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  for (let iter = 0; iter < 5; iter++) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 2000,
        temperature: 0.7,
        tools,
        tool_choice: 'auto',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        (err as { error?: { message?: string } }).error?.message ||
          `HTTP ${response.status}`
      );
    }

    const data = await response.json() as {
      choices: Array<{
        finish_reason: string;
        message: {
          content: string | null;
          tool_calls?: OAIToolCall[];
        };
      }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const choice = data.choices[0];

    // Acumular usage de todas as iterações
    if (data.usage) {
      totalUsage.prompt_tokens += data.usage.prompt_tokens || 0;
      totalUsage.completion_tokens += data.usage.completion_tokens || 0;
      totalUsage.total_tokens += data.usage.total_tokens || 0;
    }

    // ── Modelo quer executar tools ───────────────────────────────────────
    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
      // Adicionar mensagem do assistente com os tool_calls
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: choice.message.tool_calls,
      });

      // Segurança: prevenir busca + disparo na mesma iteração.
      // Se o modelo tentar buscar clientes E disparar ao mesmo tempo, bloqueamos
      // o disparo — ele precisa primeiro mostrar a lista, aguardar confirmação
      // da operadora e só então disparar na próxima rodada.
      const toolNames = choice.message.tool_calls.map((tc) => tc.function.name);
      const temBusca = toolNames.includes('buscar_clientes_pedido_alto');
      const temDisparo = toolNames.includes('disparar_campanha_whatsapp');

      if (temBusca && temDisparo) {
        // Bloquear o disparo nesta iteração: retornar erro para todas as tools
        // para que o modelo entenda que precisa agir de forma sequencial.
        for (const tc of choice.message.tool_calls) {
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({
              error:
                'Não execute busca e disparo na mesma chamada. ' +
                'Protocolo obrigatório: (1) chame buscar_clientes_pedido_alto, ' +
                '(2) apresente a lista à operadora, ' +
                '(3) aguarde confirmação explícita, ' +
                '(4) só então chame disparar_campanha_whatsapp.',
            }),
          });
        }
        continue;
      }

      // Executar cada tool call em paralelo
      const toolResults = await Promise.all(
        choice.message.tool_calls.map(async (tc) => {
          let result: string;
          try {
            const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
            result = await executeAnneTool(tc.function.name, args, tenantId);
          } catch (e) {
            result = JSON.stringify({
              error: e instanceof Error ? e.message : 'Erro ao executar tool',
            });
          }
          return { id: tc.id, result };
        })
      );

      // Adicionar resultados das tools ao histórico
      for (const tr of toolResults) {
        messages.push({ role: 'tool', tool_call_id: tr.id, content: tr.result });
      }

      // Continuar loop para o modelo processar os resultados
      continue;
    }

    // ── Resposta final em texto ───────────────────────────────────────────
    const reply =
      choice.message.content || 'Desculpe, não consegui processar sua mensagem.';
    return { reply, usage: totalUsage };
  }

  // Limite de iterações atingido — retornar o que tiver
  throw new Error('Limite de iterações de tool calling atingido');
}

/* ─────────────────────────────────────────────────────────────────────────
   ROUTE HANDLER
   ───────────────────────────────────────────────────────────────────────── */

/**
 * POST /api/anne/chat
 * Chat com agente Anne (IA multi-provedor + tool calling para campanhas).
 *
 * Body: { message: string, context?: { client_id?: string, chat_history?: [] } }
 * Responde com: { data: { reply, usage, provider_used, actions } }
 *
 * maxDuration = 300s para acomodar disparos de campanhas com muitos clientes.
 */
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { tenantId, profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    // ── Rate limiting ──────────────────────────
    const rl = checkRateLimit(`anne-chat:${tenantId}`, RATE_LIMITS.ANNE_CHAT);
    if (!rl.allowed) {
      return NextResponse.json({
        data: {
          reply: '⚠️ Muitas mensagens em pouco tempo. Aguarde alguns segundos e tente novamente.',
          actions: [],
        },
      });
    }

    // ── Buscar config do tenant ────────────────
    const { data: tenant } = await supabase
      .from('tenants')
      .select('openai_api_key, openai_model, openai_system_prompt, openai_provider, openai_base_url, name')
      .eq('id', profile.tenant_id)
      .single();

    if (!tenant?.openai_api_key) {
      return NextResponse.json({
        data: {
          reply: '⚠️ A Anne ainda não está configurada. Vá em **Configurações → Anne (IA)** e adicione sua API Key para ativar a IA.',
          actions: [],
        },
      });
    }

    // ── Body ───────────────────────────────────
    const { message, context } = await request.json();
    if (!message) {
      return NextResponse.json({ error: 'Mensagem é obrigatória' }, { status: 400 });
    }

    // ── Construir contexto extra do cliente ────
    const extraContext: Record<string, unknown> = {};
    let clientName: string | undefined;
    let rfmSegment: string | undefined;

    if (context?.client_id) {
      // Parallelizar as duas queries de contexto para reduzir latência (~50-100ms)
      const [clientResult, ordersResult] = await Promise.all([
        supabase
          .from('clients')
          // email omitido intencionalmente — dado pessoal sensível desnecessário para a Anne
          .select('name, phone, total_orders, ltv, rfm_segment, last_order_at, tags')
          .eq('id', context.client_id)
          .eq('tenant_id', profile.tenant_id)
          .single(),
        supabase
          .from('orders')
          .select('id, status, total, created_at, items_count')
          .eq('client_id', context.client_id)
          .eq('tenant_id', profile.tenant_id)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      const client = clientResult.data;
      if (client) {
        clientName = client.name;
        rfmSegment = client.rfm_segment;
        extraContext.cliente = {
          nome: client.name,
          telefone: client.phone,
          total_pedidos: client.total_orders,
          total_gasto: `R$ ${((client as Record<string, unknown>).ltv as number || 0).toFixed(2)}`,
          segmento_rfm: client.rfm_segment,
          ultimo_pedido: client.last_order_at,
          tags: client.tags,
        };
      }

      const orders = ordersResult.data;
      if (orders?.length) {
        extraContext.ultimos_pedidos = orders.map(o => ({
          id: o.id,
          status: o.status,
          total: `R$ ${(o.total || 0).toFixed(2)}`,
          data: o.created_at,
          itens: o.items_count,
        }));
      }
    }

    // ── Histórico — máximo MAX_HISTORY mensagens ──
    const rawHistory = (context?.chat_history || []) as Array<{ role: string; content: string }>;
    const chatHistory = rawHistory
      .slice(-MAX_HISTORY)
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    // ── System Prompt ────────────────────────────
    const tenantName = tenant.name || 'VEXX CRM';
    const attendantName = profile.full_name || 'Atendente';

    const baseSystemPrompt = buildSystemPrompt(
      {
        nome_loja: tenantName,
        nome_atendente: attendantName,
        nome_cliente: clientName,
        segmento_rfm: rfmSegment,
      },
      tenant.openai_system_prompt
    );

    // Injetar contexto de dados do cliente (se houver)
    let systemPrompt = baseSystemPrompt;
    if (Object.keys(extraContext).length > 0) {
      systemPrompt += `\n\n## Dados disponíveis para esta consulta:\n\`\`\`json\n${JSON.stringify(extraContext, null, 2)}\n\`\`\``;
    }

    // Modo Operadora: quando não há cliente específico, a conversa é interna.
    // Deixar explícito evita que o modelo aja como atendente de cliente e
    // responda "não tenho acesso" ou invente dados em vez de usar as tools.
    if (!context?.client_id) {
      systemPrompt += `\n\n---\n\n## 🔧 Modo Operadora (Uso Interno)\nVocê está conversando com uma **operadora da loja** — uma funcionária, não um cliente.\nNeste modo você tem acesso a ferramentas de inteligência comercial.\n⛔ NUNCA invente dados de clientes, pedidos ou valores.\n⛔ NUNCA diga "não tenho acesso a essa informação" se houver uma ferramenta disponível para buscar.\n✅ SEMPRE use as ferramentas abaixo para responder perguntas sobre clientes ou pedidos.`;
    }

    // Adicionar instruções das ferramentas ao system prompt
    systemPrompt += ANNE_TOOLS_SYSTEM_ADDENDUM;

    // ── Provedor e modelo ────────────────────────
    const aiModel = tenant.openai_model || 'gpt-4o-mini';
    const aiProvider = (tenant.openai_provider || 'openai') as AIProvider;
    const aiBaseUrl = tenant.openai_base_url?.trim() || PROVIDER_BASE_URLS[aiProvider];

    // ── Roteamento: ambos os provedores (openai, groq) usam tool calling ──
    if (OPENAI_COMPATIBLE_PROVIDERS.includes(aiProvider)) {
      try {
        const response = await runWithTools({
          apiKey: tenant.openai_api_key,
          model: aiModel,
          baseUrl: aiBaseUrl,
          systemPrompt,
          chatHistory,
          userMessage: message,
          tools: ANNE_TOOLS,
          tenantId: profile.tenant_id,
        });

        return NextResponse.json({
          data: {
            reply: response.reply,
            usage: response.usage,
            provider_used: aiProvider,
            actions: [],
          },
        });
      } catch (err) {
        const msg = (err as Error).message || '';

        if (msg.includes('Incorrect API key') || msg.includes('invalid_api_key') || msg.includes('authentication')) {
          return NextResponse.json({
            data: {
              reply: '⚠️ A API Key configurada é inválida. Verifique em **Configurações → Anne (IA)**.',
              actions: [],
            },
          });
        }

        if (msg.includes('quota') || msg.includes('insufficient_quota')) {
          return NextResponse.json({
            data: {
              reply: '⚠️ Saldo da API esgotado. Verifique seu plano em **Configurações → Anne (IA)**.',
              actions: [],
            },
          });
        }

        // Outros erros: tentar fallback para OpenAI padrão (se provider não for openai)
        if (aiProvider !== 'openai') {
          console.warn(`[Anne] Falha no provedor ${aiProvider}/${aiModel}: ${msg}. Tentando fallback OpenAI...`);
          try {
            const fallback = await runWithTools({
              apiKey: tenant.openai_api_key,
              model: 'gpt-4o-mini',
              baseUrl: PROVIDER_BASE_URLS.openai,
              systemPrompt,
              chatHistory,
              userMessage: message,
              tools: ANNE_TOOLS,
              tenantId: profile.tenant_id,
            });
            return NextResponse.json({
              data: {
                reply: fallback.reply,
                usage: fallback.usage,
                provider_used: 'openai',
                actions: [],
              },
            });
          } catch {
            // Fallback também falhou
          }
        }

        console.error('❌ Anne chat (tool calling): todos os provedores falharam.', msg);
        return NextResponse.json({
          data: {
            reply: '❌ Não consegui processar sua mensagem agora. Por favor, tente novamente em alguns instantes.',
            actions: [],
          },
        });
      }
    }

  } catch (error) {
    console.error('❌ Anne chat error (fatal):', error);
    return NextResponse.json({
      data: {
        reply: '❌ Ocorreu um erro interno. Tente novamente.',
        actions: [],
      },
    });
  }
}
