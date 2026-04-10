'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShoppingBag, Plus, Search, FileText, Trash2, Eye,
  CheckCircle2, XCircle, Clock, Loader2, Package,
  MoreVertical, TrendingUp, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePedidos, useCreatePedido, useDeletePedido } from '@/hooks/use-pedidos';
import type { Pedido, StatusPedido } from '@/hooks/use-pedidos';

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function brl(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

function formatarData(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/* ─── Badge de status ────────────────────────────────────────────────────── */

const STATUS_CFG: Record<StatusPedido, { label: string; cls: string; icon: React.ReactNode }> = {
  rascunho: {
    label: 'Rascunho',
    cls: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    icon: <Clock size={11} />,
  },
  finalizado: {
    label: 'Finalizado',
    cls: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    icon: <CheckCircle2 size={11} />,
  },
  cancelado: {
    label: 'Cancelado',
    cls: 'bg-red-500/15 text-red-400 border border-red-500/30',
    icon: <XCircle size={11} />,
  },
};

function StatusBadge({ status }: { status: StatusPedido }) {
  const cfg = STATUS_CFG[status];
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold', cfg.cls)}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

/* ─── Card individual de pedido ──────────────────────────────────────────── */

function PedidoCard({
  pedido,
  onAbrir,
  onDeletar,
  deletando,
}: {
  pedido: Pedido;
  onAbrir: () => void;
  onDeletar: () => void;
  deletando: boolean;
}) {
  const [menu, setMenu] = useState(false);

  return (
    <div className="bg-[#161b24] border border-[#1c2333] rounded-2xl p-5 hover:border-blue-500/40 transition-all">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#1c2333] border border-[#2a3347] flex items-center justify-center shrink-0 overflow-hidden">
            {pedido.cliente_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pedido.cliente_logo_url} alt="" className="w-full h-full object-contain" />
            ) : (
              <ShoppingBag size={16} className="text-blue-400" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white truncate">
              {pedido.cliente_nome || 'Cliente não informado'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{formatarData(pedido.created_at)}</p>
          </div>
        </div>

        {/* Menu de ações */}
        <div className="relative shrink-0">
          <button
            onClick={() => setMenu((v) => !v)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
          >
            <MoreVertical size={15} />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-8 z-20 w-40 bg-[#1c2333] border border-[#2a3347] rounded-xl shadow-2xl overflow-hidden">
                <button
                  onClick={() => { setMenu(false); onAbrir(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <Eye size={14} /> Abrir pedido
                </button>
                <button
                  onClick={() => { setMenu(false); onDeletar(); }}
                  disabled={deletando}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  {deletando ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Deletar
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-[#0d1117] rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1">Total</p>
          <p className="text-sm font-bold text-white">{brl(pedido.total)}</p>
        </div>
        <div className="bg-[#0d1117] rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1">Prazo</p>
          <p className="text-xs font-semibold text-gray-300 leading-tight">{pedido.prazo_entrega}</p>
        </div>
      </div>

      {/* Rodapé */}
      <div className="flex items-center justify-between">
        <StatusBadge status={pedido.status} />
        <button
          onClick={onAbrir}
          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
        >
          Abrir <Eye size={12} />
        </button>
      </div>
    </div>
  );
}

/* ─── Estado vazio ───────────────────────────────────────────────────────── */

function EstadoVazio({ onNovo, criando }: { onNovo: () => void; criando: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-20 h-20 rounded-3xl bg-[#161b24] border border-[#1c2333] flex items-center justify-center mb-6">
        <ShoppingBag size={32} className="text-blue-400 opacity-70" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">Nenhum pedido de atacado ainda</h3>
      <p className="text-sm text-gray-500 max-w-sm mb-8">
        Crie pedidos com grade de numeração (34–40), upload de fotos por modelo,
        cálculo automático de totais e geração de PDF profissional.
      </p>
      <button
        onClick={onNovo}
        disabled={criando}
        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors"
      >
        {criando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
        Criar primeiro pedido
      </button>
    </div>
  );
}

/* ─── Filtros de status ──────────────────────────────────────────────────── */

const FILTROS: { value: StatusPedido | 'todos'; label: string }[] = [
  { value: 'todos',      label: 'Todos' },
  { value: 'rascunho',   label: 'Rascunhos' },
  { value: 'finalizado', label: 'Finalizados' },
  { value: 'cancelado',  label: 'Cancelados' },
];

/* ─── Página principal ───────────────────────────────────────────────────── */

export default function PedidosAtacadoPage() {
  const router = useRouter();
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<StatusPedido | 'todos'>('todos');
  const [deletandoId, setDeletandoId] = useState<string | null>(null);

  const { data: pedidos = [], isLoading, error } = usePedidos(
    filtroStatus !== 'todos' ? filtroStatus : undefined
  );
  const { mutateAsync: criar, isPending: criando } = useCreatePedido();
  const { mutateAsync: deletar } = useDeletePedido();

  /* Cria pedido em rascunho e navega para edição */
  async function handleNovoPedido() {
    try {
      const pedido = await criar({});
      router.push(`/pedidos/${pedido.id}`);
    } catch (err) {
      console.error('Erro ao criar pedido:', err);
    }
  }

  /* Deleta pedido */
  async function handleDeletar(id: string) {
    setDeletandoId(id);
    try {
      await deletar(id);
    } catch (err) {
      console.error('Erro ao deletar pedido:', err);
    } finally {
      setDeletandoId(null);
    }
  }

  /* Filtro local por texto */
  const pedidosFiltrados = pedidos.filter((p) => {
    const t = busca.toLowerCase();
    return (
      !busca ||
      p.cliente_nome?.toLowerCase().includes(t) ||
      p.cliente_telefone?.includes(t) ||
      p.cliente_cnpj?.includes(t)
    );
  });

  const totalGeral = pedidos.reduce((s, p) => s + (p.total ?? 0), 0);
  const qtdRascunhos = pedidos.filter((p) => p.status === 'rascunho').length;

  return (
    <div className="min-h-full bg-[#0d1117]">
      <div className="max-w-7xl mx-auto px-5 py-6 space-y-6">

        {/* ─── Header ──────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">Pedidos de Atacado</h1>
            <p className="text-sm text-gray-500 mt-0.5">CJ Rasteirinhas — grade por numeração</p>
          </div>
          <button
            onClick={handleNovoPedido}
            disabled={criando}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors shrink-0"
          >
            {criando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Novo Pedido
          </button>
        </div>

        {/* ─── Resumo numérico ─────────────────────────────────────────── */}
        {!isLoading && pedidos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total de pedidos', val: String(pedidos.length),       icon: <FileText size={16} className="text-blue-400" /> },
              { label: 'Em rascunho',      val: String(qtdRascunhos),          icon: <Clock size={16} className="text-amber-400" /> },
              { label: 'Finalizados',      val: String(pedidos.filter(p => p.status === 'finalizado').length), icon: <CheckCircle2 size={16} className="text-emerald-400" /> },
              { label: 'Volume total',     val: brl(totalGeral),               icon: <TrendingUp size={16} className="text-purple-400" /> },
            ].map((c) => (
              <div key={c.label} className="bg-[#161b24] border border-[#1c2333] rounded-2xl px-4 py-3.5">
                <div className="flex items-center gap-2 mb-2">{c.icon}<span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{c.label}</span></div>
                <p className="text-lg font-bold text-white">{c.val}</p>
              </div>
            ))}
          </div>
        )}

        {/* ─── Busca + filtros ─────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar cliente, telefone, CNPJ..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-[#161b24] border border-[#1c2333] rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60 transition-colors"
            />
          </div>
          <div className="flex gap-1 bg-[#161b24] border border-[#1c2333] rounded-xl p-1">
            {FILTROS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFiltroStatus(f.value)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  filtroStatus === f.value ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Conteúdo ────────────────────────────────────────────────── */}

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-[#161b24] border border-[#1c2333] rounded-2xl p-5 animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-[#1c2333]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-28 rounded bg-[#1c2333]" />
                    <div className="h-2.5 w-16 rounded bg-[#1c2333]" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="h-14 rounded-xl bg-[#0d1117]" />
                  <div className="h-14 rounded-xl bg-[#0d1117]" />
                </div>
                <div className="h-5 w-24 rounded-full bg-[#1c2333]" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && error && (
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-2xl px-5 py-4 text-red-400">
            <AlertTriangle size={16} className="shrink-0" />
            <p className="text-sm">Erro ao carregar: {error instanceof Error ? error.message : 'Tente novamente'}</p>
          </div>
        )}

        {!isLoading && !error && pedidos.length === 0 && (
          <EstadoVazio onNovo={handleNovoPedido} criando={criando} />
        )}

        {!isLoading && !error && pedidosFiltrados.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {pedidosFiltrados.map((pedido) => (
              <PedidoCard
                key={pedido.id}
                pedido={pedido}
                onAbrir={() => router.push(`/pedidos/${pedido.id}`)}
                onDeletar={() => handleDeletar(pedido.id)}
                deletando={deletandoId === pedido.id}
              />
            ))}
          </div>
        )}

        {!isLoading && !error && pedidos.length > 0 && pedidosFiltrados.length === 0 && (
          <div className="text-center py-16">
            <Package size={40} className="mx-auto text-gray-600 mb-3" />
            <p className="text-gray-500 text-sm">Nenhum pedido encontrado para &quot;{busca}&quot;</p>
          </div>
        )}

      </div>
    </div>
  );
}
