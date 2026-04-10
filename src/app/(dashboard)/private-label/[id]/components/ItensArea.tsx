'use client';

import { useRef, useState } from 'react';
import { Plus, Trash2, Upload, Loader2, Package } from 'lucide-react';
import {
  PLItem, PLItemUpdate, GradePL, GRADE_TAMANHOS, GRADE_VAZIA,
  useCreatePLItem, useUpdatePLItem, useDeletePLItem, uploadPLImagem,
} from '@/hooks/use-private-label';

interface Props {
  pedidoId:  string;
  tenantId:  string;
  itens:     PLItem[];
  /** Chamado após qualquer mudança que afeta o total do pedido */
  onTotalChange: (total: number) => void;
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

/* ── Linha de item ── */
function ItemRow({
  item,
  tenantId,
  pedidoId,
  onTotalChange,
}: {
  item:          PLItem;
  tenantId:      string;
  pedidoId:      string;
  onTotalChange: (delta: number) => void;
}) {
  const { mutateAsync: atualizar } = useUpdatePLItem();
  const { mutateAsync: remover   } = useDeletePLItem();

  /* estado local para edição imediata sem await */
  const [grade,     setGrade]     = useState<GradePL>(item.grade);
  const [preco,     setPreco]     = useState(String(item.valor_unitario));
  const [nome,      setNome]      = useState(item.nome      ?? '');
  const [cores,     setCores]     = useState(item.cores     ?? '');
  const [salvando,  setSalvando]  = useState(false);
  const [deletando, setDeletando] = useState(false);
  const [uploadando, setUploadando] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPares  = GRADE_TAMANHOS.reduce((s, t) => s + (grade[t] || 0), 0);
  const precoNum    = parseFloat(preco) || 0;
  const subtotal    = totalPares * precoNum;

  function scheduleUpdate(updates: PLItemUpdate) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSalvando(true);
      try {
        await atualizar({
          id: item.id,
          pedido_id: item.pedido_id,
          total_pares: totalPares,
          subtotal,
          ...updates,
        });
      } finally { setSalvando(false); }
    }, 1500);
  }

  function handleGrade(tam: keyof GradePL, val: string) {
    const n = Math.max(0, parseInt(val) || 0);
    const g = { ...grade, [tam]: n };
    setGrade(g);
    scheduleUpdate({ grade: g, total_pares: GRADE_TAMANHOS.reduce((s, t) => s + (g[t] || 0), 0), subtotal: GRADE_TAMANHOS.reduce((s, t) => s + (g[t] || 0), 0) * precoNum });
  }

  async function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadando(true);
    try {
      const path = `${tenantId}/${pedidoId}/${item.id}.${file.name.split('.').pop()}`;
      const url  = await uploadPLImagem(file, 'private-label-fotos', path);
      await atualizar({ id: item.id, pedido_id: item.pedido_id, foto_url: url });
    } catch { /* ignora */ }
    finally { setUploadando(false); }
  }

  async function handleDelete() {
    setDeletando(true);
    try { await remover({ id: item.id, pedidoId: item.pedido_id }); }
    finally { setDeletando(false); }
  }

  return (
    <div className="bg-[#0d1117] border border-[#1c2333] rounded-xl p-4 space-y-4">

      {/* ── Linha 1: Foto + Nome + Cores + Preço + lixeira ── */}
      <div className="flex items-start gap-3">
        {/* Foto */}
        <button
          onClick={() => fotoInputRef.current?.click()}
          className="w-16 h-16 rounded-lg border border-dashed border-[#1c2333] bg-[#161b24] flex items-center justify-center shrink-0 overflow-hidden hover:border-purple-500/40 transition"
        >
          {uploadando ? (
            <Loader2 className="w-4 h-4 text-[#6b7fa3] animate-spin" />
          ) : item.foto_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.foto_url} alt={nome} className="w-full h-full object-cover" />
          ) : (
            <Upload className="w-4 h-4 text-[#6b7fa3]" />
          )}
        </button>
        <input ref={fotoInputRef} type="file" accept="image/*" className="hidden" onChange={handleFoto} />

        {/* Campos */}
        <div className="flex-1 grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <input
              type="text"
              placeholder="Nome do produto"
              value={nome}
              onChange={e => { setNome(e.target.value); scheduleUpdate({ nome: e.target.value }); }}
              className="w-full px-3 py-2 bg-[#161b24] border border-[#1c2333] rounded-lg text-xs text-white placeholder-[#6b7fa3] focus:outline-none focus:border-purple-500/50 transition"
            />
          </div>
          <input
            type="text"
            placeholder="Cores"
            value={cores}
            onChange={e => { setCores(e.target.value); scheduleUpdate({ cores: e.target.value }); }}
            className="px-3 py-2 bg-[#161b24] border border-[#1c2333] rounded-lg text-xs text-white placeholder-[#6b7fa3] focus:outline-none focus:border-purple-500/50 transition"
          />
          <input
            type="number"
            placeholder="Preço un. (R$)"
            min="0"
            step="0.01"
            value={preco}
            onChange={e => setPreco(e.target.value)}
            onBlur={() => scheduleUpdate({ valor_unitario: parseFloat(preco) || 0, subtotal })}
            className="px-3 py-2 bg-[#161b24] border border-[#1c2333] rounded-lg text-xs text-white placeholder-[#6b7fa3] focus:outline-none focus:border-purple-500/50 transition"
          />
        </div>

        {/* Lixeira */}
        <button
          onClick={handleDelete}
          disabled={deletando}
          className="p-2 rounded-lg text-[#6b7fa3] hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-40 shrink-0"
        >
          {deletando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>

      {/* ── Linha 2: Grade de tamanhos ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] text-[#6b7fa3] uppercase tracking-wide">Grade de tamanhos</span>
          {salvando && <Loader2 className="w-3 h-3 text-[#6b7fa3] animate-spin" />}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {GRADE_TAMANHOS.map(tam => (
            <div key={tam} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-[#6b7fa3]">{tam}</span>
              <input
                type="number"
                min="0"
                value={grade[tam] || ''}
                placeholder="0"
                onChange={e => handleGrade(tam, e.target.value)}
                className="w-full text-center px-1 py-1.5 bg-[#161b24] border border-[#1c2333] rounded-lg text-xs text-white focus:outline-none focus:border-purple-500/50 transition"
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Linha 3: Resumo ── */}
      <div className="flex items-center justify-between text-xs text-[#6b7fa3] border-t border-[#1c2333] pt-3">
        <span>{totalPares} par{totalPares !== 1 ? 'es' : ''}</span>
        <span className="font-semibold text-white">{fmtBRL(subtotal)}</span>
      </div>

    </div>
  );
}

/* ── Área principal ── */
export function ItensArea({ pedidoId, tenantId, itens, onTotalChange }: Props) {
  const { mutateAsync: criarItem, isPending: criando } = useCreatePLItem();

  const totalItens = itens.reduce((s, i) => s + i.subtotal, 0);

  async function handleNovoItem() {
    await criarItem(pedidoId);
    onTotalChange(totalItens);
  }

  return (
    <div className="space-y-4">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">
          Itens da Encomenda
          {itens.length > 0 && (
            <span className="ml-2 text-xs font-normal text-[#6b7fa3]">({itens.length})</span>
          )}
        </h2>
        <button
          onClick={handleNovoItem}
          disabled={criando}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/20 text-purple-400 text-xs font-medium hover:bg-purple-600/30 transition disabled:opacity-50"
        >
          {criando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Adicionar item
        </button>
      </div>

      {/* Lista */}
      {itens.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[#6b7fa3] border border-dashed border-[#1c2333] rounded-xl">
          <Package className="w-10 h-10 mb-3 opacity-20" />
          <p className="text-sm font-medium">Nenhum item adicionado</p>
          <p className="text-xs mt-1 opacity-70">Clique em "Adicionar item" para começar</p>
        </div>
      ) : (
        <div className="space-y-3">
          {itens.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              tenantId={tenantId}
              pedidoId={pedidoId}
              onTotalChange={onTotalChange}
            />
          ))}
        </div>
      )}

      {/* Subtotal de itens */}
      {itens.length > 0 && (
        <div className="flex justify-end text-xs text-[#6b7fa3]">
          Subtotal itens: <span className="ml-1 text-white font-medium">{fmtBRL(totalItens)}</span>
        </div>
      )}

    </div>
  );
}
