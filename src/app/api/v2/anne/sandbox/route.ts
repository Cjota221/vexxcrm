import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { detectPipelineEvent } from '@/lib/services/pipeline-triggers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v2/anne/sandbox
 *
 * Simula o que a Anne faria com uma mensagem, sem alterar o banco.
 * Usado no Sandbox da página de configuração.
 *
 * Body: { text: string; from_me?: boolean }
 * Response: {
 *   event: PipelineEvent | null;
 *   action_preview: string;
 *   kanban_move: string | null;
 *   message_suggestion: string | null;
 *   chain_of_thought: string[];
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = auth.tenantId;
    const body = await request.json() as { text: string; from_me?: boolean };
    const { text, from_me = false } = body;

    if (!text?.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    const chain: string[] = [];
    chain.push(`📥 Mensagem recebida: "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}"`);
    chain.push(`🔍 Origem: ${from_me ? 'Bot/Atendente' : 'Cliente'}`);

    // Detectar evento de pipeline
    const event = detectPipelineEvent(text, from_me);

    if (!event) {
      chain.push('💭 Nenhum padrão reconhecido — mensagem ignorada pelo motor de pipeline.');
      return NextResponse.json({
        event: null,
        action_preview: 'Nenhuma ação — mensagem fora dos padrões configurados.',
        kanban_move: null,
        message_suggestion: null,
        chain_of_thought: chain,
      });
    }

    chain.push(`✅ Padrão detectado: ${event.trigger} (score: ${Math.round(event.score * 100)}%)`);
    chain.push(`🎯 Coluna destino: ${event.targetColumn}`);
    chain.push(`📝 Motivo: ${event.motivo}`);

    if (event.trackingCode) {
      chain.push(`📦 Código de rastreio extraído: ${event.trackingCode}`);
    }
    if (event.orderNumber) {
      chain.push(`🧾 Número do pedido extraído: ${event.orderNumber}`);
    }
    if (event.extractedName) {
      chain.push(`👤 Nome extraído da mensagem: ${event.extractedName}`);
    }

    // Buscar automação correspondente para sugestão de mensagem
    let messageSuggestion: string | null = null;
    const ruleMap: Record<string, string> = {
      pedido_recebido: 'payment_confirm',
      pagamento_aprovado: 'payment_confirm',
      primeiro_contato: 'welcome_lead',
    };
    const ruleKey = ruleMap[event.trigger];
    if (ruleKey) {
      const { data: automation } = await supabase
        .from('anne_automations')
        .select('message_template, send_mode, enabled')
        .eq('tenant_id', tenantId)
        .eq('rule_key', ruleKey)
        .eq('enabled', true)
        .single();

      if (automation?.message_template) {
        messageSuggestion = automation.message_template;
        chain.push(`💬 Sugestão de mensagem da regra '${ruleKey}' (modo: ${automation.send_mode})`);
      }
    }

    // Verificar modo de envio global
    const { data: tenant } = await supabase
      .from('tenants')
      .select('anne_send_mode')
      .eq('id', tenantId)
      .single();

    const sendMode = (tenant as { anne_send_mode?: string } | null)?.anne_send_mode ?? 'suggest';
    chain.push(`⚙️  Modo de envio global: ${sendMode === 'auto' ? '🤖 Automático' : '🤝 Sugerir para humano'}`);

    const actionPreview = sendMode === 'auto'
      ? `Anne moveria o card para ${event.targetColumn} e ${messageSuggestion ? 'enviaria a mensagem automaticamente.' : 'não dispararia mensagem.'}`
      : `Anne moveria o card para ${event.targetColumn} e ${messageSuggestion ? 'colocaria a mensagem em amarelo aguardando aprovação.' : 'registraria o evento.'}`;

    return NextResponse.json({
      event,
      action_preview: actionPreview,
      kanban_move: event.targetColumn,
      message_suggestion: messageSuggestion,
      chain_of_thought: chain,
    });
  } catch (err) {
    console.error('[anne/sandbox]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
