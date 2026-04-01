/**
 * Tool: segmentar_compradores
 *
 * Segmenta os clientes em 3 faixas de ticket médio por pedido:
 *   - Grandes  → avg_ticket > 700
 *   - Médios   → avg_ticket >= 300 e <= 700
 *   - Pequenos → avg_ticket < 300
 *
 * Usa clients.avg_ticket (calculado automaticamente pelo trigger de pedidos).
 * Só inclui clientes com pelo menos 1 pedido (total_orders > 0).
 */

import { createServerSupabaseClient } from '@/lib/supabase';

export type SegmentoComprador = 'grandes' | 'medios' | 'pequenos' | 'todos';

export interface SegmentarCompradoresParams {
  segmento?: SegmentoComprador;
  limite?: number;
}

export interface ClienteSegmentado {
  id: string;
  nome: string;
  telefone: string;
  ticket_medio: number;
  total_pedidos: number;
  ltv: number;
}

export interface ResumoSegmento {
  total: number;
  ticket_medio_geral: number;
  ltv_total: number;
  clientes: ClienteSegmentado[];
}

export interface SegmentarCompradoresResult {
  grandes: ResumoSegmento;
  medios: ResumoSegmento;
  pequenos: ResumoSegmento;
  total_clientes_com_pedido: number;
}

const LIMITE_GRANDE = 700;
const LIMITE_MEDIO_MIN = 300;

async function buscarSegmento(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  filtro: { gt?: number; gte?: number; lt?: number; lte?: number },
  limite: number
): Promise<ClienteSegmentado[]> {
  let query = supabase
    .from('clients')
    .select('id, name, phone, avg_ticket, total_orders, ltv')
    .eq('tenant_id', tenantId)
    .gt('total_orders', 0)
    .not('phone', 'is', null)
    .not('status', 'eq', 'blocked')
    .not('tags', 'cs', '{"optout"}')
    .eq('opt_out', false)
    .order('avg_ticket', { ascending: false })
    .limit(limite);

  if (filtro.gt !== undefined) query = query.gt('avg_ticket', filtro.gt);
  if (filtro.gte !== undefined) query = query.gte('avg_ticket', filtro.gte);
  if (filtro.lt !== undefined) query = query.lt('avg_ticket', filtro.lt);
  if (filtro.lte !== undefined) query = query.lte('avg_ticket', filtro.lte);

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao buscar segmento: ${error.message}`);

  return (data ?? []).map((c) => ({
    id: c.id,
    nome: c.name || 'Cliente',
    telefone: (c.phone as string).replace(/\D/g, ''),
    ticket_medio: Number(c.avg_ticket) || 0,
    total_pedidos: c.total_orders || 0,
    ltv: Number(c.ltv) || 0,
  }));
}

function calcularResumo(clientes: ClienteSegmentado[]): ResumoSegmento {
  const total = clientes.length;
  const ltv_total = clientes.reduce((s, c) => s + c.ltv, 0);
  const ticket_medio_geral =
    total > 0
      ? clientes.reduce((s, c) => s + c.ticket_medio, 0) / total
      : 0;
  return { total, ticket_medio_geral: Math.round(ticket_medio_geral * 100) / 100, ltv_total: Math.round(ltv_total * 100) / 100, clientes };
}

export async function segmentarCompradores(
  params: SegmentarCompradoresParams,
  tenantId: string
): Promise<SegmentarCompradoresResult> {
  const { segmento = 'todos', limite = 200 } = params;
  const supabase = createServerSupabaseClient();

  const [grandes, medios, pequenos] = await Promise.all([
    segmento === 'medios' || segmento === 'pequenos'
      ? Promise.resolve([])
      : buscarSegmento(supabase, tenantId, { gt: LIMITE_GRANDE }, limite),

    segmento === 'grandes' || segmento === 'pequenos'
      ? Promise.resolve([])
      : buscarSegmento(supabase, tenantId, { gte: LIMITE_MEDIO_MIN, lte: LIMITE_GRANDE }, limite),

    segmento === 'grandes' || segmento === 'medios'
      ? Promise.resolve([])
      : buscarSegmento(supabase, tenantId, { lt: LIMITE_MEDIO_MIN }, limite),
  ]);

  const resumoGrandes = calcularResumo(grandes);
  const resumoMedios = calcularResumo(medios);
  const resumoPequenos = calcularResumo(pequenos);

  return {
    grandes: resumoGrandes,
    medios: resumoMedios,
    pequenos: resumoPequenos,
    total_clientes_com_pedido:
      resumoGrandes.total + resumoMedios.total + resumoPequenos.total,
  };
}
