import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { chat } from '@/lib/services/anne.service';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import { buildSystemPrompt } from '@/lib/anne-prompt';
import type { AIProvider } from '@/lib/services/anne.service';

/** Máximo de mensagens do histórico enviadas à IA (controla custo de tokens) */
const MAX_HISTORY = 10;

/**
 * POST /api/anne/chat
 * Chat com agente Anne (IA multi-provedor com fallback automático).
 *
 * Body: { message: string, context?: { client_id?: string, chat_history?: [] } }
 * Responde com: { data: { reply, usage, provider_used } }
 */
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
      const { data: client } = await supabase
        .from('clients')
        .select('name, phone, email, total_orders, ltv, rfm_segment, last_order_at, tags')
        .eq('id', context.client_id)
        .eq('tenant_id', profile.tenant_id)
        .single();

      if (client) {
        clientName = client.name;
        rfmSegment = client.rfm_segment;
        extraContext.cliente = {
          nome: client.name,
          telefone: client.phone,
          email: client.email,
          total_pedidos: client.total_orders,
          total_gasto: `R$ ${((client as Record<string, unknown>).ltv as number || 0).toFixed(2)}`,
          segmento_rfm: client.rfm_segment,
          ultimo_pedido: client.last_order_at,
          tags: client.tags,
        };
      }

      // Últimos 5 pedidos com status — Anne orienta pagamentos pendentes
      const { data: orders } = await supabase
        .from('orders')
        .select('id, status, total, created_at, items_count')
        .eq('client_id', context.client_id)
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false })
        .limit(5);

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
    // Slica pelo final: garante as mensagens mais recentes e limita tokens.
    const rawHistory = (context?.chat_history || []) as Array<{ role: string; content: string }>;
    const chatHistory = rawHistory
      .slice(-MAX_HISTORY)
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    // ── System Prompt via DNA centralizado ────────
    // buildSystemPrompt injeta {{nome_loja}}, {{nome_atendente}}, etc.
    // Se openai_system_prompt for null → usa DEFAULT_ANNE_PROMPT (Prompt de Fábrica).
    const tenantName = tenant.name || 'VEXX CRM';
    const attendantName = profile.full_name || 'Atendente';

    const systemPrompt = buildSystemPrompt(
      {
        nome_loja: tenantName,
        nome_atendente: attendantName,
        nome_cliente: clientName,
        segmento_rfm: rfmSegment,
      },
      tenant.openai_system_prompt   // null → Prompt de Fábrica
    );

    // ── Config do provedor principal ────────────
    const aiModel = tenant.openai_model || 'gpt-4o-mini';
    const aiProvider = (tenant.openai_provider || 'openai') as AIProvider;
    const aiBaseUrl = tenant.openai_base_url || undefined;

    // ── Cadeia de fallback ──────────────────────
    // 1º: provedor configurado pelo tenant
    // 2º: OpenAI gpt-4o-mini (só se o provedor principal não for OpenAI)
    const FALLBACK_CHAIN: Array<{ provider: AIProvider; model: string; useCustomBaseUrl: boolean }> = [
      { provider: aiProvider, model: aiModel, useCustomBaseUrl: true },
    ];
    if (aiProvider !== 'openai') {
      FALLBACK_CHAIN.push({ provider: 'openai', model: 'gpt-4o-mini', useCustomBaseUrl: false });
    }

    let lastError: Error | null = null;

    for (const attempt of FALLBACK_CHAIN) {
      try {
        const response = await chat(
          {
            apiKey: tenant.openai_api_key,
            model: attempt.model,
            systemPrompt,
            maxTokens: 600,
            provider: attempt.provider,
            baseUrl: attempt.useCustomBaseUrl ? aiBaseUrl : undefined,
          },
          message,
          chatHistory,
          Object.keys(extraContext).length > 0 ? extraContext : undefined
        );

        return NextResponse.json({
          data: {
            reply: response.reply,
            usage: response.usage,
            provider_used: attempt.provider,
            actions: [],
          },
        });

      } catch (err) {
        lastError = err as Error;
        const msg = lastError.message || '';

        // Erros de autenticação — configuração errada, fallback não resolve
        if (msg.includes('Incorrect API key') || msg.includes('invalid_api_key') || msg.includes('authentication')) {
          return NextResponse.json({
            data: {
              reply: '⚠️ A API Key configurada é inválida. Verifique em **Configurações → Anne (IA)**.',
              actions: [],
            },
          });
        }

        // Saldo esgotado — fallback não resolve o mesmo problema
        if (msg.includes('quota') || msg.includes('insufficient_quota')) {
          return NextResponse.json({
            data: {
              reply: '⚠️ Saldo da API esgotado. Verifique seu plano em **Configurações → Anne (IA)**.',
              actions: [],
            },
          });
        }

        // Outros erros (timeout, 5xx, rate_limit transitório) → tenta próximo
        console.warn(`[Anne] Falha no provedor ${attempt.provider}/${attempt.model}: ${msg}. Tentando fallback...`);
      }
    }

    // Todos os provedores da cadeia falharam
    console.error('❌ Anne chat: todos os provedores falharam.', lastError?.message);
    return NextResponse.json({
      data: {
        reply: '❌ Não consegui processar sua mensagem agora. Por favor, tente novamente em alguns instantes.',
        actions: [],
      },
    });

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