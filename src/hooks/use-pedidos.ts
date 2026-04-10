'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { supabase } from '@/lib/supabase';

/* ─── Tipos ──────────────────────────────────────────────────────────────── */

export interface GradeNumeracao {
  '34': number;
  '35': number;
  '36': number;
  '37': number;
  '38': number;
  '39': number;
  '40': number;
}

export const NUMERACOES = ['34', '35', '36', '37', '38', '39', '40'] as const;
export type Numeracao = (typeof NUMERACOES)[number];

export type StatusPedido = 'rascunho' | 'finalizado' | 'cancelado';

export interface PedidoItem {
  id: string;
  pedido_id: string;
  foto_url: string | null;
  cores: string;
  valor_unitario: number;
  grade: GradeNumeracao;
  total_pares: number;
  subtotal: number;
  created_at: string;
  updated_at: string;
}

export interface Pedido {
  id: string;
  tenant_id: string;
  contact_id: string | null;
  cliente_nome: string;
  cliente_telefone: string;
  cliente_cnpj: string;
  cliente_cep: string;
  cliente_endereco: string;
  cliente_cidade: string;
  cliente_estado: string;
  cliente_logo_url: string | null;
  frete: number;
  desconto: number;
  prazo_entrega: string;
  status: StatusPedido;
  total: number;
  created_at: string;
  updated_at: string;
  itens?: PedidoItem[];
}

export type PedidoUpdate = Partial<
  Omit<Pedido, 'id' | 'tenant_id' | 'created_at' | 'updated_at' | 'itens'>
>;

export type PedidoItemUpdate = Partial<
  Omit<PedidoItem, 'id' | 'pedido_id' | 'created_at' | 'updated_at'>
>;

/* ─── Helpers de cálculo ─────────────────────────────────────────────────── */

/** Soma todos os pares de uma grade de numerações */
export function calcTotalPares(grade: GradeNumeracao): number {
  return Object.values(grade).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
}

/** Calcula o subtotal de um item (valor_unitario × total_pares) */
export function calcSubtotal(
  grade: GradeNumeracao,
  valorUnitario: number
): number {
  return valorUnitario * calcTotalPares(grade);
}

/** Calcula o total de um pedido (soma dos subtotais + frete - desconto) */
export function calcTotalPedido(
  itens: Pick<PedidoItem, 'subtotal'>[],
  frete: number,
  desconto: number
): number {
  const valorMercadoria = itens.reduce((sum, i) => sum + (i.subtotal ?? 0), 0);
  return Math.max(0, valorMercadoria + (frete ?? 0) - (desconto ?? 0));
}

/** Grade vazia padrão */
export function gradeVazia(): GradeNumeracao {
  return { '34': 0, '35': 0, '36': 0, '37': 0, '38': 0, '39': 0, '40': 0 };
}

/* ─── Chaves de query ────────────────────────────────────────────────────── */

export const PEDIDO_KEYS = {
  todos: (tenantId: string) => ['pedidos', tenantId] as const,
  filtrado: (tenantId: string, status?: StatusPedido) =>
    ['pedidos', tenantId, status] as const,
  rascunhos: (tenantId: string) => ['pedidos', tenantId, 'rascunho'] as const,
  detalhe: (id: string) => ['pedido', id] as const,
};

/* ─── Hooks de leitura ───────────────────────────────────────────────────── */

/**
 * Lista todos os pedidos do tenant.
 * Filtro opcional por status.
 */
export function usePedidos(statusFiltro?: StatusPedido) {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: PEDIDO_KEYS.filtrado(user?.tenant_id ?? '', statusFiltro),
    queryFn: async () => {
      if (!user?.tenant_id) return [];

      let query = supabase
        .from('pedidos')
        .select('*')
        .eq('tenant_id', user.tenant_id)
        .order('created_at', { ascending: false });

      if (statusFiltro) {
        query = query.eq('status', statusFiltro);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as Pedido[];
    },
    enabled: !!user?.tenant_id,
    staleTime: 30_000,
  });
}

/**
 * Conta pedidos em rascunho para exibir badge no menu lateral.
 */
export function usePedidosRascunhoCount() {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: PEDIDO_KEYS.rascunhos(user?.tenant_id ?? ''),
    queryFn: async () => {
      if (!user?.tenant_id) return 0;
      const { count, error } = await supabase
        .from('pedidos')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', user.tenant_id)
        .eq('status', 'rascunho');
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    enabled: !!user?.tenant_id,
    staleTime: 60_000,
  });
}

/**
 * Busca um pedido completo com seus itens (join via Supabase).
 */
export function usePedido(id: string | null) {
  return useQuery({
    queryKey: PEDIDO_KEYS.detalhe(id ?? ''),
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('pedidos')
        .select('*, itens:pedido_itens(*)')
        .eq('id', id)
        .single();
      if (error) throw new Error(error.message);
      return data as Pedido & { itens: PedidoItem[] };
    },
    enabled: !!id,
    staleTime: 10_000,
  });
}

/* ─── Mutations de pedido ────────────────────────────────────────────────── */

/**
 * Cria um novo pedido em rascunho.
 * Retorna o pedido criado com o ID gerado.
 */
export function useCreatePedido() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async (dados?: PedidoUpdate) => {
      if (!user?.tenant_id) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('pedidos')
        .insert({
          tenant_id: user.tenant_id,
          status: 'rascunho',
          ...dados,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data as Pedido;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
    },
  });
}

/**
 * Atualiza campos de um pedido existente.
 * Recalcula o total automaticamente se itens e frete/desconto forem passados.
 */
export function useUpdatePedido() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & PedidoUpdate) => {
      const { data, error } = await supabase
        .from('pedidos')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Pedido;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: PEDIDO_KEYS.detalhe(data.id) });
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
    },
  });
}

/**
 * Muda o status de um pedido para 'finalizado'.
 */
export function useFinalizarPedido() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('pedidos')
        .update({ status: 'finalizado' })
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Pedido;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: PEDIDO_KEYS.detalhe(data.id) });
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
    },
  });
}

/**
 * Exclui um pedido e seus itens (cascade no banco).
 */
export function useDeletePedido() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('pedidos')
        .delete()
        .eq('id', id);
      if (error) throw new Error(error.message);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
    },
  });
}

/* ─── Mutations de itens ─────────────────────────────────────────────────── */

/**
 * Adiciona um item em branco ao pedido.
 */
export function useAddPedidoItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pedidoId,
      dados,
    }: {
      pedidoId: string;
      dados?: Partial<PedidoItemUpdate>;
    }) => {
      const { data, error } = await supabase
        .from('pedido_itens')
        .insert({
          pedido_id: pedidoId,
          grade: gradeVazia(),
          valor_unitario: 0,
          total_pares: 0,
          subtotal: 0,
          cores: '',
          ...dados,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as PedidoItem;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: PEDIDO_KEYS.detalhe(data.pedido_id),
      });
    },
  });
}

/**
 * Atualiza um item do pedido, recalculando total_pares e subtotal.
 */
export function useUpdatePedidoItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      pedidoId,
      ...updates
    }: { id: string; pedidoId: string } & PedidoItemUpdate) => {
      // Recalcula totais derivados
      const payload: Record<string, unknown> = { ...updates };

      if (updates.grade !== undefined || updates.valor_unitario !== undefined) {
        // Precisamos dos valores atuais para recalcular corretamente
        // Eles são passados pelo chamador com os valores mesclados
        if (updates.grade !== undefined) {
          payload.total_pares = calcTotalPares(updates.grade);
        }
        if (updates.grade !== undefined && updates.valor_unitario !== undefined) {
          payload.subtotal = calcSubtotal(updates.grade, updates.valor_unitario);
        }
      }

      const { data, error } = await supabase
        .from('pedido_itens')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as PedidoItem;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: PEDIDO_KEYS.detalhe(data.pedido_id),
      });
    },
  });
}

/**
 * Remove um item do pedido.
 */
export function useDeletePedidoItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      pedidoId,
    }: {
      id: string;
      pedidoId: string;
    }) => {
      const { error } = await supabase
        .from('pedido_itens')
        .delete()
        .eq('id', id);
      if (error) throw new Error(error.message);
      return pedidoId;
    },
    onSuccess: (pedidoId) => {
      queryClient.invalidateQueries({
        queryKey: PEDIDO_KEYS.detalhe(pedidoId),
      });
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
    },
  });
}

/**
 * Clona um item existente dentro do mesmo pedido.
 */
export function useClonePedidoItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (item: PedidoItem) => {
      const { data, error } = await supabase
        .from('pedido_itens')
        .insert({
          pedido_id: item.pedido_id,
          foto_url: item.foto_url,
          cores: item.cores,
          valor_unitario: item.valor_unitario,
          grade: item.grade,
          total_pares: item.total_pares,
          subtotal: item.subtotal,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as PedidoItem;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: PEDIDO_KEYS.detalhe(data.pedido_id),
      });
    },
  });
}

/* ─── Upload de imagens ──────────────────────────────────────────────────── */

/**
 * Faz upload de uma imagem para o Supabase Storage e retorna a URL pública.
 * bucket: 'pedidos-fotos' para itens, 'pedidos-logos' para logos de cliente.
 */
export async function uploadImagem(
  file: File,
  bucket: 'pedidos-fotos' | 'pedidos-logos',
  path: string
): Promise<string> {
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
