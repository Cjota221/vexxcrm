'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tag, Plus, Search, FileText, Trash2, Eye, CheckCircle2, XCircle, Clock, Package, Loader2 } from 'lucide-react';
import { usePLPedidos, useCreatePLPedido, useDeletePLPedido, StatusPL, PLPedido } from '@/hooks/use-private-label';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { formatCurrency, formatDate } from '@/lib/utils';

const STATUS_CFG: Record<StatusPL, { label: string; variant: 'warning' | 'success' | 'danger' }> = {
  rascunho:   { label: 'Rascunho',   variant: 'warning' },
  finalizado: { label: 'Finalizado', variant: 'success' },
  cancelado:  { label: 'Cancelado',  variant: 'danger'  },
};

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

  async function handleNova() {
    const p = await criar();
    router.push(`/private-label/${p.id}`);
  }

  const filtrados: PLPedido[] = pedidos.filter(p => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return p.cliente_nome?.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-txt-primary">Private Label</h1>
          <p className="text-sm text-txt-secondary mt-1">
            {filtrados.length} encomenda(s) de atacado
          </p>
        </div>
        <Button onClick={handleNova} isLoading={criando}>
          <Plus size={16} /> Nova Encomenda
        </Button>
      </div>

      {/* Filtros */}
      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-48">
            <Input
              placeholder="Buscar por cliente..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          <div className="flex gap-1">
            {(['todos', 'rascunho', 'finalizado', 'cancelado'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFiltroStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filtroStatus === s
                    ? 'bg-crm-primary text-white'
                    : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-50'
                }`}
              >
                {s === 'todos' ? 'Todos' : STATUS_CFG[s].label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Tabela */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200">
                <th className="text-left text-xs font-medium text-txt-secondary px-4 py-3">Cliente</th>
                <th className="text-left text-xs font-medium text-txt-secondary px-4 py-3">Nº</th>
                <th className="text-left text-xs font-medium text-txt-secondary px-4 py-3">Data</th>
                <th className="text-left text-xs font-medium text-txt-secondary px-4 py-3">Prazo</th>
                <th className="text-left text-xs font-medium text-txt-secondary px-4 py-3">Status</th>
                <th className="text-right text-xs font-medium text-txt-secondary px-4 py-3">Total</th>
                <th className="text-right text-xs font-medium text-txt-secondary px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-surface-100">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-surface-200 rounded w-24 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-txt-secondary">
                    <Package size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Nenhuma encomenda encontrada</p>
                    <p className="text-xs mt-1 opacity-70">
                      {busca ? 'Tente outro termo de busca' : 'Clique em "Nova Encomenda" para começar'}
                    </p>
                  </td>
                </tr>
              ) : (
                filtrados.map(p => {
                  const cfg = STATUS_CFG[p.status];
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-surface-100 hover:bg-surface-50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/private-label/${p.id}`)}
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-txt-primary">
                          {p.cliente_nome || 'Cliente não informado'}
                        </p>
                        {p.cliente_telefone && (
                          <p className="text-xs text-txt-secondary">{p.cliente_telefone}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-txt-secondary font-mono">
                        #{p.id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-sm text-txt-secondary">
                        {formatDate(p.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-txt-secondary">
                        {p.prazo_entrega || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-txt-primary text-right">
                        {formatCurrency(p.total)}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => router.push(`/private-label/${p.id}`)}
                            className="p-1.5 rounded-lg text-txt-secondary hover:text-crm-primary hover:bg-surface-100 transition-colors"
                            title="Abrir"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={async () => {
                              setDeletandoId(p.id);
                              try { await deletar(p.id); } finally { setDeletandoId(null); }
                            }}
                            disabled={deletandoId === p.id}
                            className="p-1.5 rounded-lg text-txt-secondary hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                            title="Excluir"
                          >
                            {deletandoId === p.id
                              ? <Loader2 size={14} className="animate-spin" />
                              : <Trash2 size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && filtrados.length > 0 && (
          <div className="px-4 py-3 border-t border-surface-200 text-xs text-txt-secondary">
            {filtrados.length} encomenda(s) · Total:{' '}
            <span className="font-semibold text-txt-primary">
              {formatCurrency(filtrados.reduce((s, p) => s + p.total, 0))}
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}
