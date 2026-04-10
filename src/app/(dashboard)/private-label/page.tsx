'use client';

/**
 * Listagem de encomendas Private Label.
 * Cards com status, cliente, total e ações de abrir/excluir.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Tag, Plus, Search, FileText, Trash2, Eye,
  CheckCircle2, XCircle, Clock, Package, Loader2,
} from 'lucide-react';
import {
  usePLPedidos, useCreatePLPedido, useDeletePLPedido,
  StatusPL, PLPedido,
} from '@/hooks/use-private-label';
import { cn } from '@/lib/utils';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtData = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

/* ─── Badge de status ─────────────────────────────────────────────────────── */

const STATUS_CFG: Record<StatusPL, { label: string; cls: string; icon: React.ReactNode }> = {
  rascunho:   { label: 'Rascunho',   cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: <Clock        className="w-3 h-3" /> },
  finalizado: { label: 'Finalizado', cls: 'bg-green-500/10  text-green-400  border-green-500/20',  icon: <CheckCircle2 className="w-3 h-3" /> },
  cancelado:  { label: 'Cancelado',  cls: 'bg-red-500/10    text-red-400    border-red-500/20',    icon: <XCircle      className="w-3 h-3" /> },
};

function StatusBadge({ status }: { status: StatusPL }) {
  const c = STATUS_CFG[status];
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium', c.cls)}>
      {c.icon}{c.label}
    </span>
  );
}

/* ─── Página ──────────────────────────────────────────────────────────────── */

export default function PrivateLabelPage() {
  const router = useRouter();
  const [busca,        setBusca]        = useState('');
  const [filtroStatus, setFiltroStatus] = useState<StatusPL | 'todos'>('todos');
  const [deletandoId,  setDeletandoId]  = useState<string | null>(null);

  const { data: pedidos = [], isLoading } = usePLPedidos(
    filtroStatus !== 'todos' ? filtroStatus : undefined,
  );

  const { mutateAsync: criar,   isPending: criando   } = useCreatePLPedido();
  const { mutateAsync: deletar, isPending: deletando } = useDeletePLPedido();

  /** Cria rascunho e navega para o formulário */
  async function handleNova() {
    const p = await criar();
    router.push(`/private-label/${p.id}`);
  }

  /** Filtra localmente pelo texto digitado */
  const filtrados: PLPedido[] = pedidos.filter(p => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return (
      p.cliente_nome?.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 space-y-6 bg-[#0d1117] min-h-screen">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-600/20 flex items-center justify-center">
            <Tag className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Private Label</h1>
            <p className="text-xs text-[#6b7fa3]">Pedidos de encomenda de atacado</p>
          </div>
        </div>
        <button
          onClick={handleNova}
          disabled={criando}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50"
        >
          {criando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Nova Encomenda
        </button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-56 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7fa3]" />
          <input
            type="text"
            placeholder="Buscar por cliente..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-[#161b24] border border-[#1c2333] rounded-xl text-sm text-white placeholder-[#6b7fa3] focus:outline-none focus:border-purple-500/50 transition"
          />
        </div>
        <div className="flex gap-1.5">
          {(['todos', 'rascunho', 'finalizado', 'cancelado'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFiltroStatus(s)}
              className={cn(
                'px-3 py-2 rounded-lg text-xs font-medium transition capitalize border',
                filtroStatus === s
                  ? 'bg-purple-600/20 text-purple-400 border-purple-500/30'
                  : 'text-[#6b7fa3] hover:text-white border-transparent',
              )}
            >
              {s === 'todos' ? 'Todos' : STATUS_CFG[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="bg-[#161b24] border border-[#1c2333] rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-[#1c2333]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <div className="h-4 bg-[#1c2333] rounded w-8 animate-pulse" />
                <div className="h-4 bg-[#1c2333] rounded w-40 animate-pulse" />
                <div className="h-4 bg-[#1c2333] rounded w-24 animate-pulse" />
                <div className="ml-auto h-5 bg-[#1c2333] rounded w-20 animate-pulse" />
              </div>
            ))}
          </div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#6b7fa3]">
            <Package className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">Nenhuma encomenda encontrada</p>
            <p className="text-xs mt-1 opacity-70">
              {busca ? 'Tente outro termo de busca' : 'Clique em "Nova Encomenda" para começar'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#1c2333]">
            {filtrados.map(p => (
              <div
                key={p.id}
                className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02] transition group"
              >
                {/* Ícone */}
                <div className="w-8 h-8 rounded-lg bg-purple-600/10 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-purple-400" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {p.cliente_nome || 'Cliente não informado'}
                  </p>
                  <p className="text-xs text-[#6b7fa3] mt-0.5">
                    #{p.id.slice(0, 8)} · {fmtData(p.created_at)}
                    {p.prazo_entrega ? ` · Prazo: ${p.prazo_entrega}` : ''}
                  </p>
                </div>

                {/* Total */}
                <span className="text-sm font-semibold text-white shrink-0">
                  {fmtBRL(p.total)}
                </span>

                <StatusBadge status={p.status} />

                {/* Ações — aparecem no hover */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                  <button
                    onClick={() => router.push(`/private-label/${p.id}`)}
                    title="Abrir encomenda"
                    className="p-1.5 rounded-lg text-[#6b7fa3] hover:text-white hover:bg-[#1c2333] transition"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={async () => {
                      setDeletandoId(p.id);
                      try { await deletar(p.id); } finally { setDeletandoId(null); }
                    }}
                    disabled={deletandoId === p.id || deletando}
                    title="Excluir encomenda"
                    className="p-1.5 rounded-lg text-[#6b7fa3] hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-40"
                  >
                    {deletandoId === p.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resumo inferior */}
      {!isLoading && filtrados.length > 0 && (
        <p className="text-xs text-[#6b7fa3] text-center">
          {filtrados.length} encomenda(s) ·{' '}
          Total: {fmtBRL(filtrados.reduce((s, p) => s + p.total, 0))}
        </p>
      )}
    </div>
  );
}
