/**
 * Tool: buscar_clientes_pedido_alto
 *
 * Busca clientes do tenant que possuem pelo menos um pedido individual
 * acima de um valor mínimo. Usa as tabelas reais do VEXX CRM:
 *   - orders  (id, client_id, tenant_id, total, created_at)
 *   - clients (id, tenant_id, name, phone)
 */

import { createServerSupabaseClient } from '@/lib/supabase';

export interface BuscarClientesParams {
  valor_minimo: number;
  limite?: number;
}

export interface ClienteElegivel {
  id: string;
  nome: string;
  telefone: string;
  maior_pedido: number;
  data_pedido: string;
}

export interface BuscarClientesResult {
  total: number;
  clientes: ClienteElegivel[];
}

export async function buscarClientesPedidoAlto(
  params: BuscarClientesParams,
  tenantId: string
): Promise<BuscarClientesResult> {
  const { valor_minimo, limite = 100 } = params;
  const supabase = createServerSupabaseClient();

  // 1. Buscar pedidos acima do valor mínimo para o tenant.
  //    Limite = limite * 5 para ter margem de deduplicação sem trazer a tabela inteira.
  //    Ex: quer 100 clientes únicos → busca no máx 500 pedidos.
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('client_id, total, created_at')
    .eq('tenant_id', tenantId)
    .gt('total', valor_minimo)
    .not('client_id', 'is', null)
    .order('total', { ascending: false })
    .limit(limite * 5);

  if (ordersError) {
    throw new Error(`Erro ao buscar pedidos: ${ordersError.message}`);
  }

  if (!orders?.length) {
    return { total: 0, clientes: [] };
  }

  // 2. Deduplicar por client_id, mantendo o maior pedido por cliente
  const clientMap = new Map<string, { total: number; created_at: string }>();
  for (const order of orders) {
    if (!clientMap.has(order.client_id)) {
      clientMap.set(order.client_id, {
        total: order.total,
        created_at: order.created_at,
      });
    }
  }

  // 3. Aplicar limite antes de ir ao banco buscar dados do cliente
  const clientIds = Array.from(clientMap.keys()).slice(0, limite);

  // 4. Buscar dados dos clientes com telefone, excluindo opt-out e bloqueados
  const { data: clients, error: clientsError } = await supabase
    .from('clients')
    .select('id, name, phone')
    .in('id', clientIds)
    .eq('tenant_id', tenantId)
    .not('phone', 'is', null)
    .not('status', 'eq', 'blocked')    // Excluir clientes bloqueados
    .not('tags', 'cs', '{"optout"}')  // Excluir opt-out por tag
    .eq('opt_out', false);             // Excluir opt-out LGPD (migration 030b)

  if (clientsError) {
    throw new Error(`Erro ao buscar clientes: ${clientsError.message}`);
  }

  // 5. Montar resultado final, normalizar telefone e ordenar por valor desc
  const resultado: ClienteElegivel[] = (clients ?? [])
    .map((c) => {
      const orderData = clientMap.get(c.id)!;
      return {
        id: c.id,
        nome: c.name || 'Cliente',
        telefone: (c.phone as string).replace(/\D/g, ''),
        maior_pedido: orderData.total,
        data_pedido: orderData.created_at,
      };
    })
    .sort((a, b) => b.maior_pedido - a.maior_pedido);

  return { total: resultado.length, clientes: resultado };
}
