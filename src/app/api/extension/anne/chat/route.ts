import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';
import { PhoneNormalizer } from '@/lib/phone-normalizer';
import { chat } from '@/lib/services/anne.service';
import { buildSystemPrompt } from '@/lib/anne-prompt';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import type { AIProvider } from '@/lib/services/anne.service';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-tenant-id',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/extension/anne/chat
 *
 * Chat com a Anne a partir da extensão Chrome.
 * Recebe o telefone do contato atual e resolve automaticamente o client_id.
 *
 * Body: {
 *   message: string          — pergunta do atendente
 *   phone?: string           — telefone do contato aberto no WhatsApp Web
 *   chat_history?: Array<{role, content}> — histórico da conversa com a Anne
 * }
 *
 * Responde: { data: { reply, usage, provider_used } }
 */
export async function POST(request: NextRequest) {
  try {
    // ── Autenticação ──────────────────────────────────────
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401, headers: CORS_HEADERS });
    }

    const supabaseAuth = createAuthenticatedClient(token);
    const supabase = createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401, headers: CORS_HEADERS });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id, full_name, role')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404, headers: CORS_HEADERS });
    }

    const tenantId = profile.tenant_id;

    // ── Rate limiting ──────────────────────────────────────
    const rl = checkRateLimit(`anne-ext:${tenantId}`, RATE_LIMITS.ANNE_CHAT);
    if (!rl.allowed) {
      return NextResponse.json({
        data: {
          reply: '⚠️ Muitas mensagens em pouco tempo. Aguarde alguns segundos.',
          actions: [],
        },
      }, { headers: CORS_HEADERS });
    }

    // ── Config do tenant ───────────────────────────────────
    const { data: tenant } = await supabase
      .from('tenants')
      .select('openai_api_key, openai_model, openai_system_prompt, openai_provider, openai_base_url, name')
      .eq('id', tenantId)
      .single();

    if (!tenant?.openai_api_key) {
      return NextResponse.json({
        data: {
          reply: '⚠️ A Anne não está configurada. Vá em **Configurações → Anne (IA)** no CRM e adicione sua API Key.',
          actions: [],
        },
      }, { headers: CORS_HEADERS });
    }

    // ── Body ───────────────────────────────────────────────
    const { message, phone, chat_history } = await request.json();
    if (!message) {
      return NextResponse.json({ error: 'Mensagem é obrigatória' }, { status: 400, headers: CORS_HEADERS });
    }

    // ── Resolver cliente pelo telefone ─────────────────────
    const extraContext: Record<string, unknown> = {};
    let clientName: string | undefined;
    let rfmSegment: string | undefined;

    if (phone) {
      const phoneNormalized = PhoneNormalizer.canonical(phone);

      const { data: client } = await supabase
        .from('clients')
        .select('id, name, phone, email, total_orders, ltv, rfm_segment, last_order_at, tags, status')
        .eq('tenant_id', tenantId)
        .eq('phone_normalized', phoneNormalized)
        .maybeSingle();

      if (client) {
        clientName = client.name;
        rfmSegment = client.rfm_segment;

        extraContext.cliente = {
          nome: client.name,
          telefone: client.phone,
          email: client.email,
          total_pedidos: client.total_orders,
          total_gasto: `R$ ${((client.ltv as number) || 0).toFixed(2)}`,
          segmento_rfm: client.rfm_segment,
          status: client.status,
          ultimo_pedido: client.last_order_at,
          tags: client.tags,
        };

        // Últimos 5 pedidos para contexto
        const { data: orders } = await supabase
          .from('orders')
          .select('id, status, total, created_at, items_count, tracking_code, order_number')
          .eq('client_id', client.id)
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(5);

        if (orders?.length) {
          extraContext.ultimos_pedidos = orders.map(o => ({
            numero: o.order_number,
            status: o.status,
            total: `R$ ${(o.total || 0).toFixed(2)}`,
            data: o.created_at,
            itens: o.items_count,
            rastreio: o.tracking_code || null,
          }));
        }

        // Análises pendentes da Anne (Sentinela) — contexto adicional
        const { data: analyses } = await supabase
          .from('sentinela_analyses')
          .select('type, urgency, title, description')
          .eq('tenant_id', tenantId)
          .eq('client_id', client.id)
          .eq('status', 'pending')
          .order('urgency', { ascending: false })
          .limit(3);

        if (analyses?.length) {
          extraContext.alertas_sentinela = analyses.map(a => ({
            tipo: a.type,
            urgencia: a.urgency,
            titulo: a.title,
            descricao: a.description,
          }));
        }
      }
    }

    // ── Histórico de chat (últimas 10 mensagens) ───────────
    const rawHistory = (chat_history || []) as Array<{ role: string; content: string }>;
    const chatHistory = rawHistory
      .slice(-10)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // ── System Prompt ──────────────────────────────────────
    const systemPrompt = buildSystemPrompt(
      {
        nome_loja: tenant.name || 'VEXX CRM',
        nome_atendente: profile.full_name || 'Atendente',
        nome_cliente: clientName,
        segmento_rfm: rfmSegment,
      },
      tenant.openai_system_prompt
    );

    // ── Cadeia de fallback de provedores ───────────────────
    const aiProvider = (tenant.openai_provider || 'openai') as AIProvider;
    const aiModel = tenant.openai_model || 'gpt-4o-mini';
    const aiBaseUrl = tenant.openai_base_url || undefined;

    const FALLBACK_CHAIN = [
      { provider: aiProvider, model: aiModel, useCustomBaseUrl: true },
      ...(aiProvider !== 'openai'
        ? [{ provider: 'openai' as AIProvider, model: 'gpt-4o-mini', useCustomBaseUrl: false }]
        : []),
    ];

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
          },
        }, { headers: CORS_HEADERS });

      } catch (err) {
        lastError = err as Error;
        const msg = lastError.message || '';

        if (msg.includes('Incorrect API key') || msg.includes('invalid_api_key') || msg.includes('authentication')) {
          return NextResponse.json({
            data: { reply: '⚠️ API Key inválida. Verifique em **Configurações → Anne (IA)** no CRM.' },
          }, { headers: CORS_HEADERS });
        }

        if (msg.includes('quota') || msg.includes('insufficient_quota')) {
          return NextResponse.json({
            data: { reply: '⚠️ Saldo da API esgotado. Verifique seu plano de IA no CRM.' },
          }, { headers: CORS_HEADERS });
        }

        console.warn(`[Ext Anne] Falha no provedor ${attempt.provider}: ${msg}. Tentando fallback...`);
      }
    }

    console.error('[Ext Anne] Todos os provedores falharam.', lastError?.message);
    return NextResponse.json({
      data: { reply: '❌ Não consegui processar agora. Tente novamente em instantes.' },
    }, { headers: CORS_HEADERS });

  } catch (error) {
    console.error('[Ext Anne] Erro fatal:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500, headers: CORS_HEADERS });
  }
}
