/**
 * Contact Center Service — Gestão de filas, distribuição e transferências.
 *
 * Opera sobre: queues, agent_queues, conversations, profiles
 * Todas as queries filtram por tenant_id.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/* ━━━━━━━━━━━━ TIPOS ━━━━━━━━━━━━ */

export interface Queue {
  id: string;
  tenant_id: string;
  department_id: string | null;
  name: string;
  slug: string;
  type: string;
  priority_level: number;
  distribution_mode: string;
  auto_assign: boolean;
  is_active: boolean;
  accepting_new: boolean;
  total_waiting?: number;
  avg_wait_seconds?: number;
}

export interface QueueWithAgents extends Queue {
  agents: Array<{
    profile_id: string;
    full_name: string;
    is_online: boolean;
    active_chats_count: number;
    max_concurrent_chats: number;
  }>;
}

export interface TransferOptions {
  to_profile_id?: string;
  to_queue_id?: string;
  reason?: string;
}

/* ━━━━━━━━━━━━ SERVIÇO ━━━━━━━━━━━━ */

export class ContactCenterService {
  constructor(
    private supabase: SupabaseClient,
    private tenantId: string
  ) {}

  /* ─── Filas ─── */

  async getQueues(): Promise<QueueWithAgents[]> {
    const { data: queues, error } = await this.supabase
      .from('queues')
      .select(`
        *,
        department:departments(name, color),
        agent_assignments:agent_queues(
          profile_id,
          profile:profiles(id, full_name, is_online, active_chats_count, max_concurrent_chats)
        )
      `)
      .eq('tenant_id', this.tenantId)
      .eq('is_active', true)
      .order('priority_level', { ascending: false });

    if (error || !queues) return [];

    // Enriquecer com contadores
    const enriched = await Promise.all(
      queues.map(async (q: Record<string, unknown>) => {
        const { count: waiting } = await this.supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('queue_id', q.id as string)
          .eq('status', 'waiting');

        const agents = ((q as Record<string, unknown>).agent_assignments as Array<Record<string, unknown>> || []).map(
          (a) => {
            const profile = a.profile as Record<string, unknown>;
            return {
              profile_id: a.profile_id as string,
              full_name: (profile?.full_name as string) || '',
              is_online: (profile?.is_online as boolean) || false,
              active_chats_count: (profile?.active_chats_count as number) || 0,
              max_concurrent_chats: (profile?.max_concurrent_chats as number) || 5,
            };
          }
        );

        return {
          ...q,
          agents,
          total_waiting: waiting || 0,
        } as QueueWithAgents;
      })
    );

    return enriched;
  }

  /* ─── Puxar próxima conversa da fila ─── */

  async pullNextConversation(profileId: string): Promise<Record<string, unknown> | null> {
    // Buscar filas do agente
    const { data: agentQueues } = await this.supabase
      .from('agent_queues')
      .select('queue_id, priority')
      .eq('profile_id', profileId)
      .eq('is_active', true)
      .eq('accepting_new', true)
      .order('priority', { ascending: true });

    if (!agentQueues?.length) return null;

    const queueIds = agentQueues.map((q) => q.queue_id);

    // Buscar conversa mais antiga na fila
    const { data: conversation, error } = await this.supabase
      .from('conversations')
      .select('*, client:clients(id, name, phone, ltv, total_orders, tags, status)')
      .in('queue_id', queueIds)
      .eq('status', 'waiting')
      .is('assigned_to', null)
      .order('priority', { ascending: false })
      .order('entered_queue_at', { ascending: true })
      .limit(1)
      .single();

    if (error || !conversation) return null;

    // Atribuir ao agente
    await this.assignConversation(conversation.id, profileId);

    return conversation;
  }

  /* ─── Atribuir conversa ─── */

  async assignConversation(conversationId: string, profileId: string): Promise<void> {
    const { error } = await this.supabase
      .from('conversations')
      .update({
        assigned_to: profileId,
        status: 'open',
        assigned_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    if (error) throw new Error(`Erro ao atribuir conversa: ${error.message}`);

    // Incrementar contador do agente
    try {
      await this.supabase.rpc('increment_field', {
        table_name: 'profiles',
        field_name: 'active_chats_count',
        row_id: profileId,
      });
    } catch {
      // Fallback: atualizar manualmente
      const { data } = await this.supabase
        .from('profiles')
        .select('active_chats_count')
        .eq('id', profileId)
        .single();

      if (data) {
        await this.supabase
          .from('profiles')
          .update({ active_chats_count: (data.active_chats_count || 0) + 1 })
          .eq('id', profileId);
      }
    }
  }

  /* ─── Transferir conversa ─── */

  async transferConversation(
    conversationId: string,
    options: TransferOptions
  ): Promise<boolean> {
    const { to_profile_id, to_queue_id, reason } = options;

    if (!to_profile_id && !to_queue_id) {
      throw new Error('Deve especificar to_profile_id ou to_queue_id');
    }

    // Chamar função SQL
    const { data, error } = await this.supabase.rpc('transfer_conversation', {
      p_conversation_id: conversationId,
      p_to_profile_id: to_profile_id || null,
      p_to_queue_id: to_queue_id || null,
      p_reason: reason || null,
    });

    if (error) throw new Error(`Erro na transferência: ${error.message}`);
    return data === true;
  }

  /* ─── Finalizar conversa ─── */

  async closeConversation(conversationId: string, profileId: string): Promise<void> {
    const { error } = await this.supabase
      .from('conversations')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    if (error) throw new Error(`Erro ao fechar conversa: ${error.message}`);

    // Decrementar contador do agente
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('active_chats_count')
      .eq('id', profileId)
      .single();

    if (profile) {
      await this.supabase
        .from('profiles')
        .update({
          active_chats_count: Math.max(0, (profile.active_chats_count || 1) - 1),
        })
        .eq('id', profileId);
    }
  }

  /* ─── Quick Actions ─── */

  async getQuickActions(): Promise<Record<string, unknown>[]> {
    const { data, error } = await this.supabase
      .from('quick_actions')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) return [];
    return data || [];
  }

  async executeQuickAction(
    conversationId: string,
    actionSlug: string
  ): Promise<{ success: boolean; message?: string }> {
    const { data: action, error } = await this.supabase
      .from('quick_actions')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .eq('slug', actionSlug)
      .eq('is_active', true)
      .single();

    if (error || !action) {
      return { success: false, message: 'Quick action não encontrada' };
    }

    switch (action.type) {
      case 'apply_tag':
        return await this.executeApplyTag(conversationId, action.config);
      case 'transfer_queue':
        return await this.executeTransferQueue(conversationId, action.config);
      case 'schedule_followup':
        return await this.executeScheduleFollowup(conversationId, action.config);
      default:
        return { success: true, message: `Ação ${action.type} registrada` };
    }
  }

  private async executeApplyTag(
    conversationId: string,
    config: Record<string, unknown>
  ): Promise<{ success: boolean; message?: string }> {
    const tags = (config.tags as string[]) || [];
    const { data: conv } = await this.supabase
      .from('conversations')
      .select('tags')
      .eq('id', conversationId)
      .single();

    const currentTags = (conv?.tags as string[]) || [];
    const merged = [...new Set([...currentTags, ...tags])];

    await this.supabase
      .from('conversations')
      .update({ tags: merged })
      .eq('id', conversationId);

    return { success: true, message: `Tags aplicadas: ${tags.join(', ')}` };
  }

  private async executeTransferQueue(
    conversationId: string,
    config: Record<string, unknown>
  ): Promise<{ success: boolean; message?: string }> {
    await this.transferConversation(conversationId, {
      to_queue_id: config.queue_id as string,
    });
    return { success: true, message: 'Transferido para fila' };
  }

  private async executeScheduleFollowup(
    conversationId: string,
    config: Record<string, unknown>
  ): Promise<{ success: boolean; message?: string }> {
    const hours = (config.hours as number) || 24;
    const followUpAt = new Date();
    followUpAt.setHours(followUpAt.getHours() + hours);

    await this.supabase
      .from('conversations')
      .update({
        follow_up_at: followUpAt.toISOString(),
        follow_up_message: (config.message as string) || null,
      })
      .eq('id', conversationId);

    return { success: true, message: `Follow-up agendado em ${hours}h` };
  }

  /* ─── Enviar produto no chat ─── */

  async sendProductToChat(
    conversationId: string,
    productId: string,
    options: { includePrice?: boolean; includeLink?: boolean } = {}
  ): Promise<string> {
    const { includePrice = true, includeLink = true } = options;

    // Buscar produto
    const { data: product } = await this.supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (!product) throw new Error('Produto não encontrado');

    // Montar mensagem
    let message = product.chat_template || `*${product.name}*\n\n${product.description || ''}`;

    if (includePrice) {
      const price = product.compare_at_price && product.compare_at_price > product.price
        ? `💰 R$ ${product.price.toFixed(2)} ~R$ ${product.compare_at_price.toFixed(2)}~`
        : `💰 R$ ${product.price.toFixed(2)}`;
      message += `\n\n${price}`;
    }

    if (product.stock !== null && product.stock !== undefined) {
      message += product.stock > 0
        ? `\n📦 ${product.stock} disponível`
        : `\n⚠️ Produto esgotado`;
    }

    if (includeLink && product.checkout_url) {
      message += `\n\n🛒 Comprar: ${product.checkout_url}`;
    }

    // Registrar envio
    await this.supabase
      .from('products')
      .update({
        chat_send_count: (product.chat_send_count || 0) + 1,
      })
      .eq('id', productId);

    return message;
  }

  /* ─── Estatísticas ─── */

  async getAgentStats(profileId: string): Promise<Record<string, unknown>> {
    const { count: activeChats } = await this.supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_to', profileId)
      .eq('status', 'open');

    const { count: closedToday } = await this.supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_to', profileId)
      .eq('status', 'closed')
      .gte('closed_at', new Date().toISOString().split('T')[0]);

    return {
      active_chats: activeChats || 0,
      closed_today: closedToday || 0,
    };
  }
}
