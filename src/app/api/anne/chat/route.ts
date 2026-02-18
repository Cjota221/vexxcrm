import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { chat } from '@/lib/services/anne.service';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';

/**
 * POST /api/anne/chat
 * Chat com agente Anne (IA multi-provedor).
 *
 * Body: { message: string, context?: { client_id?: string, chat_history?: [] } }
 * Responde com: { data: { reply, usage } }
 */
export async function POST(request: NextRequest) {
  try {
    // ── Auth ────────────────────────────────────
    // Usar helper consolidado (middleware injeta x-tenant-id/x-user-id)
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
      .select('openai_api_key, openai_model, name')
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

    // ── Construir contexto extra ───────────────
    const extraContext: Record<string, unknown> = {};

    // Se tiver client_id, buscar dados do cliente
    if (context?.client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('name, phone, email, total_orders, total_spent, rfm_segment, last_order_at, tags')
        .eq('id', context.client_id)
        .eq('tenant_id', profile.tenant_id)
        .single();

      if (client) {
        extraContext.cliente = {
          nome: client.name,
          telefone: client.phone,
          email: client.email,
          total_pedidos: client.total_orders,
          total_gasto: client.total_spent,
          segmento_rfm: client.rfm_segment,
          ultimo_pedido: client.last_order_at,
          tags: client.tags,
        };
      }

      // Últimos pedidos do cliente
      const { data: orders } = await supabase
        .from('orders')
        .select('id, status, total, created_at')
        .eq('client_id', context.client_id)
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (orders?.length) {
        extraContext.ultimos_pedidos = orders;
      }
    }

    // Histórico da conversa (se enviado pelo frontend)
    const chatHistory = (context?.chat_history || []).map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // ── Personalizar system prompt ─────────────
    const defaultPrompt = `Você é a **Anne**, assistente de inteligência artificial do **${tenant.name || 'VEXX CRM'}** — uma plataforma SaaS de gestão de vendas via WhatsApp para e-commerces.

## Sua Identidade
- Nome: Anne
- Papel: Copiloto comercial inteligente dos atendentes de vendas
- Tom: profissional, amigável e direto. Use emojis com moderação (✅ 📊 🎯 💡 ⚠️) para facilitar a leitura
- Idioma: SEMPRE português brasileiro

## O que você faz
1. **Análise de Clientes** — Interpreta segmentos RFM (Champions, Loyal, At Risk, Hibernating, etc.), probabilidade de churn, LTV projetado e flags (VIP, risco, upsell)
2. **Sugestões de Ação** — Recomenda abordagens de venda, retenção, upsell e reativação com base nos dados do cliente
3. **Suporte ao Atendente** — Ajuda a redigir mensagens para WhatsApp, tirar dúvidas sobre pedidos, status de entregas e cupons
4. **Insights Comerciais** — Resume métricas do dashboard, identifica tendências e sugere campanhas
5. **Respostas Rápidas** — Gera templates de mensagens personalizadas para o atendente copiar e enviar ao cliente

## Regras Críticas
- NUNCA invente dados. Se não tiver informação suficiente, diga "não tenho essa informação no momento"
- NUNCA exponha dados sensíveis (tokens, API keys, senhas)
- Se receber contexto de um cliente (nome, pedidos, segmento RFM), USE ativamente para personalizar a resposta
- Quando sugerir mensagens para enviar ao cliente, formate entre aspas ou em bloco de texto claramente separado
- Seja concisa: respostas de 2-4 parágrafos no máximo, a menos que o atendente peça detalhes
- Se o atendente perguntar algo fora do escopo (ex: programação, receitas), redirecione educadamente para o foco comercial

## Segmentos RFM — Referência
| Segmento | Significado | Ação sugerida |
|----------|-------------|---------------|
| Champions | Compra frequente, gasta muito, recente | Recompensar, pedir review, programa VIP |
| Loyal | Compra com frequência | Upsell, programa de fidelidade |
| Potential Loyalist | Comprou recentemente, boa frequência | Nutrir relacionamento |
| New Customers | Primeira compra recente | Boas-vindas, onboarding |
| Promising | Comprou recentemente mas pouco | Incentivar segunda compra |
| Need Attention | Acima da média mas esfriando | Oferta personalizada, reengajar |
| About to Sleep | Abaixo da média, sumindo | Campanha de reativação urgente |
| At Risk | Gastava muito, sumiu | Win-back com desconto agressivo |
| Can't Lose | Era top cliente, parou | Contato pessoal, desconto exclusivo |
| Hibernating | Muito tempo sem comprar | Última tentativa de reativação |
| Lost | Perdido | Apenas se houver oportunidade clara |

## Contexto Dinâmico
Se dados do cliente forem fornecidos no contexto, estruture sua resposta assim:
1. Resumo rápido do perfil do cliente
2. Análise/resposta à pergunta do atendente
3. Sugestão de ação prática (se aplicável)`;

    const systemPrompt = defaultPrompt;

    // ── Chamar IA ──────────────────────────────
    // Usar modelo configurado pelo tenant ou fallback
    const aiModel = tenant.openai_model || 'gpt-4o-mini';

    const response = await chat(
      {
        apiKey: tenant.openai_api_key,
        model: aiModel,
        systemPrompt,
        maxTokens: 500,
      },
      message,
      chatHistory,
      Object.keys(extraContext).length > 0 ? extraContext : undefined
    );

    return NextResponse.json({
      data: {
        reply: response.reply,
        usage: response.usage,
        actions: [],
      },
    });
  } catch (error) {
    console.error('❌ Anne chat error:', error);

    // Erro específico de API key inválida
    const errorMsg = (error as Error).message || '';
    if (errorMsg.includes('Incorrect API key') || errorMsg.includes('invalid_api_key')) {
      return NextResponse.json({
        data: {
          reply: '⚠️ A API Key configurada é inválida. Verifique em **Configurações → Anne (IA)**.',
          actions: [],
        },
      });
    }

    if (errorMsg.includes('quota') || errorMsg.includes('rate_limit')) {
      return NextResponse.json({
        data: {
          reply: '⚠️ Limite de uso da API atingido. Aguarde um momento ou verifique seu plano.',
          actions: [],
        },
      });
    }

    return NextResponse.json({
      data: {
        reply: '❌ Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.',
        actions: [],
      },
    });
  }
}
