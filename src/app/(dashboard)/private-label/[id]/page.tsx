'use client';

/**
 * Formulário de encomenda Private Label.
 * Layout 12 colunas: sidebar (4) + área de itens (8).
 * Auto-save debounce 1500 ms em todos os campos.
 */

import { useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Tag, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import {
  usePLPedido, usePLItens, useUpdatePLPedido,
  PLPedidoUpdate, StatusPL,
} from '@/hooks/use-private-label';
import { cn } from '@/lib/utils';
import { ClienteSidebar } from './components/ClienteSidebar';
import { ItensArea }      from './components/ItensArea';
import { PdfPrivateLabel } from './components/PdfPrivateLabel';

/* ─── Status selector ────────────────────────────────────────────────────── */

const STATUS_CFG: Record<StatusPL, { label: string; cls: string; icon: React.ReactNode }> = {
  rascunho:   { label: 'Rascunho',   cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30', icon: <Clock        className="w-3.5 h-3.5" /> },
  finalizado: { label: 'Finalizado', cls: 'bg-green-500/10  text-green-400  border-green-500/30',  icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  cancelado:  { label: 'Cancelado',  cls: 'bg-red-500/10    text-red-400    border-red-500/30',    icon: <XCircle      className="w-3.5 h-3.5" /> },
};

function StatusSelector({
  status,
  onChange,
}: {
  status: StatusPL;
  onChange: (s: StatusPL) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {(Object.keys(STATUS_CFG) as StatusPL[]).map(s => {
        const c = STATUS_CFG[s];
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition',
              status === s ? c.cls : 'text-[#6b7fa3] border-transparent hover:text-white',
            )}
          >
            {status === s && c.icon}
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Página ─────────────────────────────────────────────────────────────── */

export default function PrivateLabelFormPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id     = params.id;

  const { data: pedido, isLoading: loadingPedido } = usePLPedido(id);
  const { data: itens  = [],       isLoading: loadingItens  } = usePLItens(id);

  const { mutateAsync: update, isPending: isSaving } = useUpdatePLPedido();

  /* Debounce ref */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleUpdate(updates: PLPedidoUpdate) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!id) return;
      update({ id, ...updates }).catch(console.error);
    }, 1500);
  }

  /* Recalculate total whenever itens or frete/desconto changes */
  useEffect(() => {
    if (!pedido || !itens.length) return;
    const subtotalItens = itens.reduce((s, i) => s + i.subtotal, 0);
    const novoTotal     = subtotalItens + (pedido.frete ?? 0) - (pedido.desconto ?? 0);
    if (Math.abs(novoTotal - pedido.total) > 0.001) {
      update({ id, total: novoTotal }).catch(console.error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, pedido?.frete, pedido?.desconto]);

  function handleUpdate(updates: PLPedidoUpdate) {
    scheduleUpdate(updates);
  }

  function handleTotalChange() {
    if (!pedido) return;
    const subtotalItens = itens.reduce((s, i) => s + i.subtotal, 0);
    const novoTotal     = subtotalItens + (pedido.frete ?? 0) - (pedido.desconto ?? 0);
    update({ id, total: novoTotal }).catch(console.error);
  }

  if (loadingPedido) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0d1117]">
        <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0d1117] text-[#6b7fa3]">
        <p className="text-sm">Encomenda não encontrada.</p>
        <button onClick={() => router.push('/private-label')} className="mt-3 text-xs text-purple-400 hover:underline">
          Voltar para listagem
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 bg-[#0d1117] min-h-screen">

      {/* ── Cabeçalho ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/private-label')}
            className="p-2 rounded-lg text-[#6b7fa3] hover:text-white hover:bg-white/[0.04] transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 rounded-xl bg-purple-600/20 flex items-center justify-center">
            <Tag className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">
              {pedido.cliente_nome || 'Nova Encomenda'}
            </h1>
            <p className="text-[11px] text-[#6b7fa3]">#{id.slice(0, 8)}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <StatusSelector
            status={pedido.status}
            onChange={s => update({ id, status: s }).catch(console.error)}
          />
          <PdfPrivateLabel pedido={pedido} itens={itens} />
          {isSaving && (
            <span className="flex items-center gap-1.5 text-xs text-[#6b7fa3]">
              <Loader2 className="w-3 h-3 animate-spin" /> Salvando
            </span>
          )}
        </div>
      </div>

      {/* ── Layout 12 colunas ── */}
      <div className="grid grid-cols-12 gap-6 items-start">

        {/* Sidebar — 4 colunas */}
        <aside className="col-span-12 lg:col-span-4 bg-[#161b24] border border-[#1c2333] rounded-2xl p-5">
          <ClienteSidebar
            pedido={pedido}
            isSaving={isSaving}
            onUpdate={handleUpdate}
          />
        </aside>

        {/* Área de itens — 8 colunas */}
        <main className="col-span-12 lg:col-span-8 bg-[#161b24] border border-[#1c2333] rounded-2xl p-5">
          {loadingItens ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
            </div>
          ) : (
            <ItensArea
              pedidoId={id}
              tenantId={pedido.tenant_id}
              itens={itens}
              onTotalChange={handleTotalChange}
            />
          )}
        </main>

      </div>
    </div>
  );
}
