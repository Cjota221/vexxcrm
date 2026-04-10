'use client';

import { useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Tag, Loader2 } from 'lucide-react';
import { usePLPedido, usePLItens, useUpdatePLPedido, PLPedidoUpdate, StatusPL } from '@/hooks/use-private-label';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ClienteSidebar }  from './components/ClienteSidebar';
import { ItensArea }       from './components/ItensArea';
import { PdfPrivateLabel } from './components/PdfPrivateLabel';

const STATUS_CFG: Record<StatusPL, { label: string; variant: 'warning' | 'success' | 'danger' }> = {
  rascunho:   { label: 'Rascunho',   variant: 'warning' },
  finalizado: { label: 'Finalizado', variant: 'success' },
  cancelado:  { label: 'Cancelado',  variant: 'danger'  },
};

export default function PrivateLabelFormPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id     = params.id;

  const { data: pedido, isLoading: loadingPedido } = usePLPedido(id);
  const { data: itens = [], isLoading: loadingItens } = usePLItens(id);
  const { mutateAsync: update, isPending: isSaving }  = useUpdatePLPedido();

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleUpdate(updates: PLPedidoUpdate) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      update({ id, ...updates }).catch(console.error);
    }, 1500);
  }

  useEffect(() => {
    if (!pedido || !itens.length) return;
    const subtotalItens = itens.reduce((s, i) => s + i.subtotal, 0);
    const silk          = pedido.silk_logo ? 100 : 0;
    const novoTotal     = subtotalItens + (pedido.frete ?? 0) - (pedido.desconto ?? 0) + silk;
    if (Math.abs(novoTotal - pedido.total) > 0.001) {
      update({ id, total: novoTotal }).catch(console.error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, pedido?.frete, pedido?.desconto, pedido?.silk_logo]);

  if (loadingPedido) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={24} className="animate-spin text-crm-primary" />
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="text-center py-24">
        <p className="text-txt-secondary">Encomenda não encontrada.</p>
        <Button variant="ghost" onClick={() => router.push('/private-label')} className="mt-4">
          <ArrowLeft size={16} /> Voltar
        </Button>
      </div>
    );
  }

  const cfg = STATUS_CFG[pedido.status];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/private-label')}
            className="p-2 rounded-lg hover:bg-surface-100 text-txt-secondary transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-txt-primary">
                {pedido.cliente_nome || 'Nova Encomenda'}
              </h1>
              <Badge variant={cfg.variant}>{cfg.label}</Badge>
              {isSaving && (
                <span className="flex items-center gap-1 text-xs text-txt-secondary">
                  <Loader2 size={12} className="animate-spin" /> Salvando
                </span>
              )}
            </div>
            <p className="text-sm text-txt-secondary mt-0.5">#{id.slice(0, 8)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Troca de status */}
          <div className="flex gap-1 bg-surface-50 border border-surface-border rounded-xl p-1">
            {(Object.keys(STATUS_CFG) as StatusPL[]).map(s => (
              <button
                key={s}
                onClick={() => update({ id, status: s }).catch(console.error)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  pedido.status === s
                    ? 'bg-crm-primary text-white shadow-sm'
                    : 'text-txt-secondary hover:text-txt-primary'
                }`}
              >
                {STATUS_CFG[s].label}
              </button>
            ))}
          </div>
          <PdfPrivateLabel pedido={pedido} itens={itens} />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* Sidebar */}
        <aside className="lg:col-span-4">
          <Card>
            <ClienteSidebar
              pedido={pedido}
              isSaving={isSaving}
              onUpdate={scheduleUpdate}
            />
          </Card>
        </aside>

        {/* Itens */}
        <main className="lg:col-span-8">
          <Card>
            {loadingItens ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={20} className="animate-spin text-crm-primary" />
              </div>
            ) : (
              <ItensArea
                pedidoId={id}
                tenantId={pedido.tenant_id}
                itens={itens}
                onTotalChange={() => {
                  if (!pedido) return;
                  const subtotalItens = itens.reduce((s, i) => s + i.subtotal, 0);
                  const silk          = pedido.silk_logo ? 100 : 0;
                  update({ id, total: subtotalItens + (pedido.frete ?? 0) - (pedido.desconto ?? 0) + silk }).catch(console.error);
                }}
              />
            )}
          </Card>
        </main>

      </div>
    </div>
  );
}
