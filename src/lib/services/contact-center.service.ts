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
    options: { includePrice?: boolean; includeLink?: boolean; clientName?: string } = {}
  ): Promise<string> {
    const { includePrice = true, includeLink = true, clientName } = options;

    // Buscar produto
    const { data: product } = await this.supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (!product) throw new Error('Produto não encontrado');

    // ── Buscar variações ──────────────────────────────────────────────────
    // FONTE 1 (preferencial): custom_fields.variations — salvo no sync via /produtos FacilZap
    // Contém { id, name, sku, stock, price, is_active }
    // FONTE 2 (fallback): order_items.metadata.variacao — pedidos anteriores
    let variacoes: { nome: string; stock?: number }[] = [];

    try {
      const customFields = (product.custom_fields as Record<string, unknown>) || {};
      const savedVariations = customFields.variations as Array<{
        id: number; name: string; sku: string; stock: number; price: number; is_active: boolean;
      }> | undefined;

      if (savedVariations && savedVariations.length > 0) {
        // Usar variações salvas pelo sync — ordenar numericamente (grades de calçados/roupas)
        variacoes = savedVariations
          .filter(v => v.is_active !== false || v.stock > 0 || v.is_active === undefined)
          .map(v => ({ nome: v.name, stock: v.stock }))
          .sort((a, b) => {
            const na = parseFloat(a.nome), nb = parseFloat(b.nome);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return a.nome.localeCompare(b.nome);
          });
      } else {
        // Fallback: buscar nos order_items mais recentes
        const { data: recentItems } = await this.supabase
          .from('order_items')
          .select('metadata, quantity')
          .eq('tenant_id', this.tenantId)
          .or(`product_sku.eq.${product.sku || '__none__'},product_name.ilike.%${product.name}%`)
          .order('created_at' as any, { ascending: false })
          .limit(200);

        if (recentItems && recentItems.length > 0) {
          const varSet = new Set<string>();
          for (const item of recentItems) {
            const meta = (item.metadata as Record<string, unknown>) || {};
            const v = String(meta.variacao || meta.variation || '').trim();
            if (v) varSet.add(v);
          }
          variacoes = Array.from(varSet)
            .map(nome => ({ nome }))
            .sort((a, b) => {
              const na = parseFloat(a.nome), nb = parseFloat(b.nome);
              if (!isNaN(na) && !isNaN(nb)) return na - nb;
              return a.nome.localeCompare(b.nome);
            });
        }
      }
    } catch {
      // ignorar — não impede o envio
    }

    // Montar mensagem formatada estilo WhatsApp
    let message = '';

    if (product.chat_template) {
      // Template customizado — substituir variáveis se existirem
      message = product.chat_template
        .replace('{{nome}}', clientName || 'você')
        .replace('{{name}}', clientName || 'você');
    } else {
      // ── Saudação personalizada ──────────────────────────────
      const firstName = clientName ? clientName.split(' ')[0] : null;
      if (firstName) {
        message = `Oi ${firstName}! Olha que linda essa opção! ✨\n\n`;
      }

      // ── Nome do produto (sem negrito — plain text) ──────────
      message += `${product.name}`;

      // ── Preço ───────────────────────────────────────────────
      if (includePrice) {
        const price = Number(product.price) || 0;
        const compareAt = Number(product.compare_at_price) || 0;
        if (compareAt > price && compareAt > 0) {
          message += `\n~~R$ ${compareAt.toFixed(2)}~~ Por apenas *R$ ${price.toFixed(2)}*`;
        } else if (price > 0) {
          message += `\nPor apenas R$ ${price.toFixed(2)}`;
        }
      }

      // ── Variações/grades com estoque ────────────────────────
      if (variacoes.length > 0) {
        message += `\n\n📐 *Numerações disponíveis:*`;
        for (const v of variacoes) {
          if (v.stock === undefined) {
            // Sem info de estoque: mostrar só o nome
            message += `\n• ${v.nome}`;
          } else if (v.stock > 0) {
            message += `\n• ${v.nome} — ${v.stock} par${v.stock !== 1 ? 'es' : ''}`;
          } else {
            // stock === 0: mostrar como esgotado (não omitir — cliente precisa ver o tamanho)
            message += `\n• ${v.nome} — esgotado`;
          }
        }
      } else if (product.stock !== null && product.stock !== undefined) {
        if (product.stock === 0) {
          message += `\n\n⚠️ Produto sem estoque no momento`;
        }
        // Se tem estoque mas sem variações: não mostrar (não poluir)
      }
    }

    // Link do produto
    if (includeLink) {
      let productLink: string | null = product.checkout_url || null;

      if (!productLink && product.external_id) {
        // Buscar site_url do tenant
        const { data: tenant } = await this.supabase
          .from('tenants')
          .select('config')
          .eq('id', this.tenantId)
          .single();

        const config = (tenant?.config as Record<string, unknown>) || {};
        const facilzapConfig = config.facilzap as Record<string, string> | undefined;
        const siteUrl = facilzapConfig?.site_url
          ? facilzapConfig.site_url.replace(/\/$/, '')
          : null;

        if (siteUrl) {
          // URL usa o external_id (ID numérico do produto no FacilZap), ex: /c/atacado/produto/3777713
          productLink = `${siteUrl}/c/atacado/produto/${product.external_id}`;
        }
      }

      if (productLink) {
        message += `\n\nVeja mais detalhes e feche seu pedido aqui 👇\n\n${productLink}`;
      }
    }

    // Registrar envio
    await this.supabase
      .from('products')
      .update({ chat_send_count: (product.chat_send_count || 0) + 1 })
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
