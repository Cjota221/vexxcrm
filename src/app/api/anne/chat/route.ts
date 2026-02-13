import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { chat } from '@/lib/services/anne.service';

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
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
    }

    // ── Buscar config do tenant ────────────────
    const { data: tenant } = await supabase
      .from('tenants')
      .select('openai_api_key, name')
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
    const defaultPrompt = `Você é Anne, a assistente virtual inteligente da loja "${tenant.name || 'VEXX CRM'}".
Você ajuda os atendentes a gerenciar vendas, entender clientes e tomar decisões comerciais.
Responda sempre em português brasileiro, de forma objetiva e útil.
Use emojis quando apropriado para deixar a comunicação mais amigável.
Se tiver dados do cliente no contexto, use-os para dar respostas personalizadas.`;

    const systemPrompt = defaultPrompt;

    // ── Chamar IA ──────────────────────────────
    const response = await chat(
      {
        apiKey: tenant.openai_api_key,
        model: 'gpt-4o-mini',
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
