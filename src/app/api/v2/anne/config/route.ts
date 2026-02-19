import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

/** Regras padrão da Anne — criadas na primeira consulta se não existirem */
const DEFAULT_RULES = [
  {
    rule_key: 'cart_recovery',
    name: 'Recuperação Automática de Carrinho',
    description: 'Envia mensagem de recuperação se o cliente entrar em Negociação e não pagar em X minutos.',
    enabled: true,
    delay_minutes: 120,
    send_mode: 'suggest',
    message_template:
      'Oi {{nome}}! 👋 Notamos que suas peças ainda estão te esperando no carrinho 🛒\nFicou alguma dúvida sobre frete ou tamanho? Estou aqui para te ajudar a finalizar! 💛',
  },
  {
    rule_key: 'welcome_lead',
    name: 'Boas-vindas a Novos Leads',
    description: 'Move automaticamente para Primeiro Contato ao detectar saudação sem carrinho.',
    enabled: true,
    delay_minutes: 0,
    send_mode: 'suggest',
    message_template:
      'Olá, {{nome}}! 😊 Seja bem-vinda à {{loja}}! Posso te ajudar a encontrar o par perfeito hoje? 👠',
  },
  {
    rule_key: 'payment_confirm',
    name: 'Identificação de Pagamento',
    description: 'Move para Pago e envia mensagem de agradecimento ao confirmar pagamento.',
    enabled: true,
    delay_minutes: 0,
    send_mode: 'auto',
    message_template:
      'Pagamento confirmado! ✅ Obrigada, {{nome}}! Seu pedido já está sendo separado com carinho. 📦',
  },
  {
    rule_key: 'tracking_reply',
    name: 'Resposta Automática de Rastreio',
    description: 'Ao detectar pergunta sobre rastreio, consulta o banco e responde automaticamente.',
    enabled: true,
    delay_minutes: 0,
    send_mode: 'auto',
    message_template:
      'Oi {{nome}}! 🚚 Seu código de rastreio é: *{{codigo_rastreio}}*\nAcompanhe em: {{link_rastreio}}',
  },
];

/**
 * GET /api/v2/anne/config
 * Retorna prompt mestre + automações do tenant.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = auth.tenantId;

    // Buscar prompt mestre do tenant
    const { data: tenant } = await supabase
      .from('tenants')
      .select('openai_system_prompt, openai_model, openai_provider, anne_send_mode')
      .eq('id', tenantId)
      .single();

    // Buscar automações
    const { data: automations } = await supabase
      .from('anne_automations')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });

    // Seed automações padrão se ainda não existirem
    if (!automations || automations.length === 0) {
      const seeds = DEFAULT_RULES.map(r => ({ ...r, tenant_id: tenantId }));
      const { data: inserted } = await supabase
        .from('anne_automations')
        .upsert(seeds, { onConflict: 'tenant_id,rule_key' })
        .select();
      return NextResponse.json({
        system_prompt: tenant?.openai_system_prompt ?? null,
        model: tenant?.openai_model ?? 'gpt-4o-mini',
        provider: tenant?.openai_provider ?? 'openai',
        send_mode: tenant?.anne_send_mode ?? 'suggest',
        automations: inserted ?? seeds,
      });
    }

    return NextResponse.json({
      system_prompt: tenant?.openai_system_prompt ?? null,
      model: tenant?.openai_model ?? 'gpt-4o-mini',
      provider: tenant?.openai_provider ?? 'openai',
      send_mode: tenant?.anne_send_mode ?? 'suggest',
      automations,
    });
  } catch (err) {
    console.error('[anne/config GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/v2/anne/config
 * Atualiza prompt mestre e/ou automações do tenant.
 *
 * Body: {
 *   system_prompt?: string;
 *   send_mode?: 'auto' | 'suggest';
 *   automations?: Array<{
 *     rule_key: string;
 *     enabled?: boolean;
 *     delay_minutes?: number;
 *     send_mode?: string;
 *     message_template?: string;
 *   }>;
 * }
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = auth.tenantId;
    const body = await request.json() as {
      system_prompt?: string | null;
      send_mode?: string;
      automations?: Array<{
        rule_key: string;
        enabled?: boolean;
        delay_minutes?: number;
        send_mode?: string;
        message_template?: string;
        name?: string;
        description?: string;
      }>;
    };

    const updates: Record<string, unknown> = {};

    // Atualizar prompt mestre no tenant
    if ('system_prompt' in body) {
      updates.openai_system_prompt = body.system_prompt ?? null;
    }
    if (body.send_mode) {
      updates.anne_send_mode = body.send_mode;
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from('tenants').update(updates).eq('id', tenantId);
    }

    // Atualizar automações individualmente
    if (body.automations?.length) {
      for (const rule of body.automations) {
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if ('enabled'          in rule) patch.enabled          = rule.enabled;
        if ('delay_minutes'    in rule) patch.delay_minutes    = rule.delay_minutes;
        if ('send_mode'        in rule) patch.send_mode        = rule.send_mode;
        if ('message_template' in rule) patch.message_template = rule.message_template;
        if ('name'             in rule) patch.name             = rule.name;
        if ('description'      in rule) patch.description      = rule.description;

        await supabase
          .from('anne_automations')
          .update(patch)
          .eq('tenant_id', tenantId)
          .eq('rule_key', rule.rule_key);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[anne/config PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
