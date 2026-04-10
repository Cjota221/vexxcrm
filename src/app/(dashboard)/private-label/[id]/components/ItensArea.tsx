'use client';

import { useRef, useState } from 'react';
import { Plus, Trash2, Upload, Loader2, Package } from 'lucide-react';
import {
  PLItem, PLItemUpdate, GradePL, GRADE_TAMANHOS, GRADE_VAZIA,
  useCreatePLItem, useUpdatePLItem, useDeletePLItem, uploadPLImagem,
} from '@/hooks/use-private-label';
import { formatCurrency } from '@/lib/utils';

interface Props {
  pedidoId:      string;
  tenantId:      string;
  itens:         PLItem[];
  onTotalChange: (total: number) => void;
}

function ItemRow({ item, tenantId, pedidoId, onTotalChange }: {
  item: PLItem; tenantId: string; pedidoId: string; onTotalChange: (d: number) => void;
}) {
  const { mutateAsync: atualizar } = useUpdatePLItem();
  const { mutateAsync: remover   } = useDeletePLItem();

  const [grade,      setGrade]      = useState<GradePL>(item.grade);
  const [preco,      setPreco]      = useState(String(item.valor_unitario));
  const [nome,       setNome]       = useState(item.nome  ?? '');
  const [cores,      setCores]      = useState(item.cores ?? '');
  const [salvando,   setSalvando]   = useState(false);
  const [deletando,  setDeletando]  = useState(false);
  const [uploadando, setUploadando] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPares = GRADE_TAMANHOS.reduce((s, t) => s + (grade[t] || 0), 0);
  const precoNum   = parseFloat(preco) || 0;
  const subtotal   = totalPares * precoNum;

  function scheduleUpdate(updates: PLItemUpdate) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSalvando(true);
      try { await atualizar({ id: item.id, pedido_id: item.pedido_id, total_pares: totalPares, subtotal, ...updates }); }
      finally { setSalvando(false); }
    }, 1500);
  }

  function handleGrade(tam: keyof GradePL, val: string) {
    const n = Math.max(0, parseInt(val) || 0);
    const g = { ...grade, [tam]: n };
    setGrade(g);
    const tp = GRADE_TAMANHOS.reduce((s, t) => s + (g[t] || 0), 0);
    scheduleUpdate({ grade: g, total_pares: tp, subtotal: tp * precoNum });
  }

  async function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadando(true);
    try {
      const ext  = file.name.split('.').pop();
      const path = `${tenantId}/${pedidoId}/${item.id}.${ext}`;
      const url  = await uploadPLImagem(file, 'private-label-fotos', path);
      await atualizar({ id: item.id, pedido_id: item.pedido_id, foto_url: url });
    } catch { /* ignora */ }
    finally { setUploadando(false); }
  }

  return (
    <div className="bg-white border border-surface-border rounded-xl p-4 space-y-4">

      {/* Linha 1 */}
      <div className="flex items-start gap-3">
        {/* Foto */}
        <button
          onClick={() => fotoInputRef.current?.click()}
          className="w-16 h-16 rounded-xl border border-dashed border-surface-300 bg-surface-50 flex items-center justify-center shrink-0 overflow-hidden hover:border-crm-primary/50 transition-colors"
        >
          {uploadando ? (
            <Loader2 size={16} className="text-txt-secondary animate-spin" />
          ) : item.foto_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.foto_url} alt={nome} className="w-full h-full object-cover" />
          ) : (
            <Upload size={16} className="text-txt-secondary" />
          )}
        </button>
        <input ref={fotoInputRef} type="file" accept="image/*" className="hidden" onChange={handleFoto} />

        <div className="flex-1 grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <input
              type="text"
              placeholder="Nome do produto"
              value={nome}
              onChange={e => { setNome(e.target.value); scheduleUpdate({ nome: e.target.value }); }}
              className="input"
            />
          </div>
          <input
            type="text"
            placeholder="Cores"
            value={cores}
            onChange={e => { setCores(e.target.value); scheduleUpdate({ cores: e.target.value }); }}
            className="input"
          />
          <input
            type="number"
            placeholder="Preço un. (R$)"
            min="0" step="0.01"
            value={preco}
            onChange={e => setPreco(e.target.value)}
            onBlur={() => scheduleUpdate({ valor_unitario: parseFloat(preco) || 0, subtotal })}
            className="input"
          />
        </div>

        <button
          onClick={async () => { setDeletando(true); try { await remover({ id: item.id, pedidoId: item.pedido_id }); } finally { setDeletando(false); } }}
          disabled={deletando}
          className="p-2 rounded-lg text-txt-secondary hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 shrink-0"
        >
          {deletando ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>

      {/* Grade */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-txt-secondary uppercase tracking-wide">Grade de tamanhos</span>
          {salvando && <Loader2 size={12} className="text-txt-secondary animate-spin" />}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {GRADE_TAMANHOS.map(tam => (
            <div key={tam} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-txt-secondary font-medium">{tam}</span>
              <input
                type="number" min="0"
                value={grade[tam] || ''}
                placeholder="0"
                onChange={e => handleGrade(tam, e.target.value)}
                className="w-full text-center px-1 py-1.5 text-xs border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-crm-primary/20"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Resumo */}
      <div className="flex items-center justify-between text-xs text-txt-secondary border-t border-surface-100 pt-3">
        <span>{totalPares} par{totalPares !== 1 ? 'es' : ''}</span>
        <span className="font-semibold text-txt-primary">{formatCurrency(subtotal)}</span>
      </div>
    </div>
  );
}

export function ItensArea({ pedidoId, tenantId, itens, onTotalChange }: Props) {
  const { mutateAsync: criarItem, isPending: criando } = useCreatePLItem();
  const totalItens = itens.reduce((s, i) => s + i.subtotal, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-txt-primary">
          Itens da Encomenda
          {itens.length > 0 && <span className="ml-1.5 text-sm font-normal text-txt-secondary">({itens.length})</span>}
        </h2>
        <button
          onClick={async () => { await criarItem(pedidoId); onTotalChange(totalItens); }}
          disabled={criando}
          className="btn btn-secondary btn-sm"
        >
          {criando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Adicionar item
        </button>
      </div>

      {itens.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-dashed border-surface-300 rounded-xl text-txt-secondary">
          <Package size={32} className="mb-3 opacity-30" />
          <p className="text-sm">Nenhum item adicionado</p>
          <p className="text-xs mt-1 opacity-70">Clique em "Adicionar item" para começar</p>
        </div>
      ) : (
        <div className="space-y-3">
          {itens.map(item => (
            <ItemRow key={item.id} item={item} tenantId={tenantId} pedidoId={pedidoId} onTotalChange={onTotalChange} />
          ))}
        </div>
      )}

      {itens.length > 0 && (
        <div className="text-sm text-txt-secondary text-right">
          Subtotal itens: <span className="font-semibold text-txt-primary ml-1">{formatCurrency(totalItens)}</span>
        </div>
      )}
    </div>
  );
}
