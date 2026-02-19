import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { estimateTokens } from '@/lib/services/agent-executor';

const VALID_SLUGS = ['comercial', 'logistica', 'faq', 'triagem'];

const DEFAULT_AGENTS = [
  {
    slug:        'comercial',
    name:        'Agente Comercial Atacado',
    description: 'Responde perguntas sobre preços, grades, MOQ, descontos e condições de pagamento B2B.',
    system_prompt: `Você é o Agente Comercial especializado em atacado B2B de calçados.
Você responde APENAS perguntas sobre: tabela de preços, grade fechada, pedido mínimo (MOQ), 
desconto por tier de cliente e condições de pagamento.
Nunca revele margens internas. Nunca prometa condição fora da tabela.
Contextualize respostas em termos de lucro do lojista: giro, markup, reposição.`,
  },
  {
    slug:        'logistica',
    name:        'Agente de Logística',
    description: 'Vincula códigos de rastreio, atualiza status de pedidos e informa prazos de entrega.',
    system_prompt: `Você é o Agente de Logística. Sua única missão: rastreio, status e prazos.
Extraia códigos de rastreio (Correios, Jadlog, Total Express) de mensagens.
Vincule ao pedido correspondente. Nunca opine sobre produtos ou condições comerciais.`,
  },
  {
    slug:        'faq',
    name:        'Agente FAQ & Institucional',
    description: 'Responde perguntas sobre endereço, horário, formas de pagamento e políticas gerais.',
    system_prompt: `Você é o Agente Institucional. Responda APENAS com base na base de conhecimento configurada.
Se a pergunta não estiver coberta: retorne INCAPAZ — nunca invente resposta.
Respostas máximo 3 linhas. Nunca especule sobre estoque.`,
  },
  {
    slug:        'triagem',
    name:        'Agente de Triagem & Onboarding',
    description: 'Recebe novos contatos, coleta nome, perfil do lojista e qualifica o lead.',
    system_prompt: `Você é o Agente de Triagem. Primeiro a falar com todo cliente novo.
Colete: nome preferido → perfil (já cliente/novo lead) → canal de venda (físico/online/ambos).
Máximo 3 perguntas. Nunca responda perguntas comerciais durante o onboarding.`,
  },
];

/**
 * GET /api/v2/agentes/:slug/knowledge
 * Retorna a base de conhecimento e stats do agente.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = profile.tenant_id;
    const { slug } = await params;

    if (!VALID_SLUGS.includes(slug)) {
      return NextResponse.json({ error: `Agente inválido: ${slug}` }, { status: 400 });
    }

    // Buscar agente — criar se não existir (seed)
    let { data: agent } = await supabase
      .from('anne_agents')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('slug', slug)
      .single();

    if (!agent) {
      const defaults = DEFAULT_AGENTS.find(a => a.slug === slug)!;
      const { data: newAgent } = await supabase
        .from('anne_agents')
        .insert({
          tenant_id:     tenantId,
          slug:          defaults.slug,
          name:          defaults.name,
          description:   defaults.description,
          system_prompt: defaults.system_prompt,
          enabled:       true,
        })
        .select('*')
        .single();
      agent = newAgent;
    }

    return NextResponse.json({ agent });

  } catch (err) {
    console.error('[agentes/knowledge GET] Erro:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/**
 * POST /api/v2/agentes/:slug/knowledge
 * Salva/atualiza a base de conhecimento do agente.
 * Body: { knowledge_base: string, enabled?: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = profile.tenant_id;
    const { slug } = await params;

    if (!VALID_SLUGS.includes(slug)) {
      return NextResponse.json({ error: `Agente inválido: ${slug}` }, { status: 400 });
    }

    const body = await request.json() as { knowledge_base?: string; enabled?: boolean };

    const tokens = body.knowledge_base ? estimateTokens(body.knowledge_base) : 0;

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.knowledge_base !== undefined) {
      update.knowledge_base   = body.knowledge_base;
      update.knowledge_tokens = tokens;
    }
    if (body.enabled !== undefined) {
      update.enabled = body.enabled;
    }

    // Upsert — cria se não existir
    const defaults = DEFAULT_AGENTS.find(a => a.slug === slug)!;
    const { data: agent, error } = await supabase
      .from('anne_agents')
      .upsert({
        tenant_id:       tenantId,
        slug,
        name:            defaults.name,
        description:     defaults.description,
        system_prompt:   defaults.system_prompt,
        ...update,
      }, { onConflict: 'tenant_id,slug' })
      .select('id, slug, knowledge_tokens, enabled')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success:          true,
      agent_id:         agent?.id,
      slug,
      knowledge_tokens: tokens,
      enabled:          agent?.enabled,
    });

  } catch (err) {
    console.error('[agentes/knowledge POST] Erro:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
