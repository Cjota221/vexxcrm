/**
 * Hooks React Query para o módulo Private Label.
 * Gerencia pedidos de encomenda de atacado com auto-save e upload de imagens.
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';

/* ─── Tipos ──────────────────────────────────────────────────────────────── */

export type StatusPL = 'rascunho' | 'finalizado' | 'cancelado';

export type GradePL = {
  '34': number;
  '35': number;
  '36': number;
  '37': number;
  '38': number;
  '39': number;
  '40': number;
};

export const GRADE_TAMANHOS: (keyof GradePL)[] = ['34', '35', '36', '37', '38', '39', '40'];

export const GRADE_VAZIA: GradePL = { '34': 0, '35': 0, '36': 0, '37': 0, '38': 0, '39': 0, '40': 0 };

export interface PLPedido {
  id:               string;
  tenant_id:        string;
  contact_id?:      string | null;
  cliente_nome?:    string | null;
  cliente_telefone?:string | null;
  cliente_email?:   string | null;
  cliente_cnpj?:    string | null;
  cliente_logo_url?:string | null;
  cliente_cep?:     string | null;
  cliente_endereco?:string | null;
  cliente_bairro?:  string | null;
  cliente_cidade?:  string | null;
  cliente_estado?:  string | null;
  frete:            number;
  desconto:         number;
  total:            number;
  silk_logo:        boolean;
  prazo_entrega?:   string | null;
  observacoes?:     string | null;
  status:           StatusPL;
  created_at:       string;
  updated_at:       string;
}

export interface PLItem {
  id:             string;
  pedido_id:      string;
  nome?:          string | null;
  foto_url?:      string | null;
  cores?:         string | null;
  valor_unitario: number;
  grade:          GradePL;
  total_pares:    number;
  subtotal:       number;
  created_at:     string;
  updated_at:     string;
}

export type PLPedidoUpdate = Partial<Omit<PLPedido, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>>;
export type PLItemUpdate   = Partial<Omit<PLItem,   'id' | 'pedido_id' | 'created_at' | 'updated_at'>>;

export interface Contato {
  id:     string;
  name?:  string | null;
  phone?: string | null;
  email?: string | null;
}

/* ─── Query Keys ─────────────────────────────────────────────────────────── */

export const PL_KEYS = {
  lista:    (tenantId: string, status?: string) => ['pl', tenantId, status ?? 'todos'] as const,
  pedido:   (id: string)                        => ['pl-pedido', id]                   as const,
  itens:    (pedidoId: string)                  => ['pl-itens', pedidoId]              as const,
  contatos: (tenantId: string, q: string)       => ['pl-contatos', tenantId, q]        as const,
};

/* ─── Lista de pedidos ───────────────────────────────────────────────────── */

export function usePLPedidos(statusFiltro?: StatusPL) {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: PL_KEYS.lista(user?.tenant_id ?? '', statusFiltro),
    queryFn:  async () => {
      if (!user?.tenant_id) return [] as PLPedido[];

      let q = supabase
        .from('private_label_pedidos')
        .select('*')
        .eq('tenant_id', user.tenant_id)
        .order('created_at', { ascending: false });

      if (statusFiltro) q = q.eq('status', statusFiltro);

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as PLPedido[];
    },
    enabled:   !!user?.tenant_id,
    staleTime: 30_000,
  });
}

/* ─── Pedido único ───────────────────────────────────────────────────────── */

export function usePLPedido(id: string | null) {
  return useQuery({
    queryKey: PL_KEYS.pedido(id ?? ''),
    queryFn:  async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('private_label_pedidos')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw new Error(error.message);
      return data as PLPedido;
    },
    enabled:   !!id,
    staleTime: 10_000,
  });
}

/* ─── Itens de um pedido ─────────────────────────────────────────────────── */

export function usePLItens(pedidoId: string | null) {
  return useQuery({
    queryKey: PL_KEYS.itens(pedidoId ?? ''),
    queryFn:  async () => {
      if (!pedidoId) return [] as PLItem[];
      const { data, error } = await supabase
        .from('private_label_itens')
        .select('*')
        .eq('pedido_id', pedidoId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as PLItem[];
    },
    enabled:   !!pedidoId,
    staleTime: 10_000,
  });
}

/* ─── Busca de contatos para autocomplete ────────────────────────────────── */

export function useContatosPL(search: string) {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: PL_KEYS.contatos(user?.tenant_id ?? '', search),
    queryFn:  async () => {
      if (!user?.tenant_id || search.length < 2) return [] as Contato[];
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, phone, email')
        .eq('tenant_id', user.tenant_id)
        .or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
        .order('name')
        .limit(10);
      if (error) throw new Error(error.message);
      return (data ?? []) as Contato[];
    },
    enabled:   !!user?.tenant_id && search.length >= 2,
    staleTime: 60_000,
  });
}

/* ─── Mutations — Pedido ─────────────────────────────────────────────────── */

/** Cria pedido em rascunho e retorna o objeto criado */
export function useCreatePLPedido() {
  const qc   = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async () => {
      if (!user?.tenant_id) throw new Error('Usuário não autenticado');
      const { data, error } = await supabase
        .from('private_label_pedidos')
        .insert({ tenant_id: user.tenant_id, status: 'rascunho', frete: 0, desconto: 0, total: 0, silk_logo: false, prazo_entrega: '15 a 20 dias úteis após a confirmação de pagamento' })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as PLPedido;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pl'] }),
  });
}

/** Atualiza campos do pedido (incluindo total calculado) */
export function useUpdatePLPedido() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & PLPedidoUpdate) => {
      const { data, error } = await supabase
        .from('private_label_pedidos')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as PLPedido;
    },
    onSuccess: (data) => {
      qc.setQueryData(PL_KEYS.pedido(data.id), data);
      qc.invalidateQueries({ queryKey: ['pl'] });
    },
  });
}

/** Remove um pedido */
export function useDeletePLPedido() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('private_label_pedidos').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pl'] }),
  });
}

/* ─── Mutations — Itens ──────────────────────────────────────────────────── */

/** Cria item vazio no pedido */
export function useCreatePLItem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (pedidoId: string) => {
      const { data, error } = await supabase
        .from('private_label_itens')
        .insert({ pedido_id: pedidoId, valor_unitario: 0, grade: GRADE_VAZIA, total_pares: 0, subtotal: 0 })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as PLItem;
    },
    onSuccess: (data) => qc.invalidateQueries({ queryKey: PL_KEYS.itens(data.pedido_id) }),
  });
}

/** Atualiza item — total_pares e subtotal devem vir calculados do componente */
export function useUpdatePLItem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, pedido_id, ...updates }: { id: string; pedido_id: string } & PLItemUpdate) => {
      const { data, error } = await supabase
        .from('private_label_itens')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as PLItem;
    },
    onSuccess: (data) => qc.invalidateQueries({ queryKey: PL_KEYS.itens(data.pedido_id) }),
  });
}

/** Remove um item */
export function useDeletePLItem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, pedidoId }: { id: string; pedidoId: string }) => {
      const { error } = await supabase.from('private_label_itens').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return pedidoId;
    },
    onSuccess: (pedidoId) => qc.invalidateQueries({ queryKey: PL_KEYS.itens(pedidoId) }),
  });
}

/* ─── Upload de imagens ──────────────────────────────────────────────────── */

/** Faz upload para o Supabase Storage e retorna a URL pública */
export async function uploadPLImagem(
  file: File,
  bucket: 'private-label-fotos' | 'private-label-logos',
  path: string,
): Promise<string> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
