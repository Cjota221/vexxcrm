'use client';

import React, {
  useState, useEffect, useRef, useCallback, useTransition,
} from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, Trash2, Copy, Upload, Search,
  Loader2, CheckCircle2, AlertTriangle, MapPin,
  DollarSign, Package, Image as ImageIcon, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  usePedido,
  useUpdatePedido,
  useFinalizarPedido,
  useAddPedidoItem,
  useUpdatePedidoItem,
  useDeletePedidoItem,
  useClonePedidoItem,
  uploadImagem,
  calcTotalPares,
  calcSubtotal,
  calcTotalPedido,
  NUMERACOES,
  gradeVazia,
} from '@/hooks/use-pedidos';
import type { Pedido, PedidoItem, GradeNumeracao } from '@/hooks/use-pedidos';
import { PedidoActions } from './components/PedidoActions';

/* ─── Tipos auxiliares ───────────────────────────────────────────────────── */

interface ViaCepResposta {
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

interface ContatoSugestao {
  id: string;
  name: string;
  phone?: string;
}

/* ─── Helper: debounce com useRef ────────────────────────────────────────── */

function useDebouncedCallback<T extends unknown[]>(
  fn: (...args: T) => void,
  delay: number
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (...args: T) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fn(...args), delay);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn, delay]
  );
}

/* ─── Helper: formata BRL ────────────────────────────────────────────────── */

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

/* ─── Card de item (modelo) ──────────────────────────────────────────────── */

function ItemCard({
  item,
  pedidoId,
  onUpdate,
  onDelete,
  onClone,
}: {
  item: PedidoItem;
  pedidoId: string;
  onUpdate: (patch: Partial<PedidoItem>) => void;
  onDelete: () => void;
  onClone: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  /* Upload de foto do modelo */
  async function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `${pedidoId}/${item.id}-${Date.now()}.${file.name.split('.').pop()}`;
      const url = await uploadImagem(file, 'pedidos-fotos', path);
      onUpdate({ foto_url: url });
    } catch (err) {
      console.error('Erro ao fazer upload da foto:', err);
    } finally {
      setUploading(false);
      if (fotoInputRef.current) fotoInputRef.current.value = '';
    }
  }

  /* Atualiza campo da grade */
  function handleGrade(num: string, valor: string) {
    const qty = Math.max(0, parseInt(valor) || 0);
    const novaGrade: GradeNumeracao = { ...item.grade, [num]: qty };
    const pares = calcTotalPares(novaGrade);
    const sub = calcSubtotal(novaGrade, item.valor_unitario);
    onUpdate({ grade: novaGrade, total_pares: pares, subtotal: sub });
  }

  /* Atualiza preço */
  function handlePreco(valor: string) {
    const preco = parseFloat(valor) || 0;
    const sub = calcSubtotal(item.grade, preco);
    onUpdate({ valor_unitario: preco, subtotal: sub });
  }

  const totalPares = calcTotalPares(item.grade);
  const subtotal = calcSubtotal(item.grade, item.valor_unitario);

  return (
    <div className="bg-[#161b24] border border-[#1c2333] rounded-2xl overflow-hidden">
      <div className="p-4 space-y-4">
        <div className="flex gap-4">
          {/* Foto do modelo */}
          <div className="shrink-0">
            <input
              ref={fotoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFotoChange}
            />
            <button
              onClick={() => fotoInputRef.current?.click()}
              disabled={uploading}
              className="w-24 h-24 rounded-xl bg-[#0d1117] border border-[#2a3347] border-dashed flex flex-col items-center justify-center overflow-hidden hover:border-blue-500/60 transition-colors group"
              title="Clique para trocar a foto"
            >
              {uploading ? (
                <Loader2 size={20} className="text-blue-400 animate-spin" />
              ) : item.foto_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.foto_url} alt="Modelo" className="w-full h-full object-cover" />
              ) : (
                <>
                  <ImageIcon size={20} className="text-gray-600 group-hover:text-blue-400 transition-colors" />
                  <span className="text-[10px] text-gray-600 mt-1 group-hover:text-blue-400 transition-colors">Foto</span>
                </>
              )}
            </button>
          </div>

          {/* Campos: Cores e Preço */}
          <div className="flex-1 space-y-3">
            <div>
              <label className="block text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1">
                Cores / Referência
              </label>
              <input
                type="text"
                value={item.cores}
                onChange={(e) => onUpdate({ cores: e.target.value })}
                placeholder="Ex: Rosa, Nude, Preto"
                className="w-full bg-[#0d1117] border border-[#2a3347] rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1">
                Preço unitário (R$)
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={item.valor_unitario || ''}
                onChange={(e) => handlePreco(e.target.value)}
                placeholder="0,00"
                className="w-full bg-[#0d1117] border border-[#2a3347] rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Grade de numerações */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
              Grade de Numerações
            </label>
            <span className="text-[10px] text-gray-600">
              {totalPares} par{totalPares !== 1 ? 'es' : ''}
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {NUMERACOES.map((num) => (
              <div key={num} className="text-center">
                <div className="text-[10px] text-gray-500 mb-1">{num}</div>
                <input
                  type="number"
                  min={0}
                  value={item.grade[num] || ''}
                  onChange={(e) => handleGrade(num, e.target.value)}
                  placeholder="0"
                  className="w-full bg-[#0d1117] border border-[#2a3347] rounded-lg px-0 py-2 text-sm text-white text-center focus:outline-none focus:border-blue-500/60 transition-colors"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Rodapé: subtotal + ações */}
        <div className="flex items-center justify-between pt-2 border-t border-[#1c2333]">
          <div className="text-sm">
            <span className="text-gray-500">Subtotal: </span>
            <span className="font-bold text-white">{brl(subtotal)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onClone}
              title="Clonar item"
              className="p-2 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
            >
              <Copy size={14} />
            </button>
            <button
              onClick={onDelete}
              title="Remover item"
              className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Página principal ───────────────────────────────────────────────────── */

export default function PedidoDetalhe() {
  const params = useParams();
  const router = useRouter();
  const pedidoId = params.id as string;

  /* ─── Dados ─────────────────────────────────────────────────────────── */
  const { data: pedido, isLoading, error } = usePedido(pedidoId);

  /* ─── Estado local do formulário ─────────────────────────────────────── */
  const [form, setForm] = useState<Partial<Pedido>>({});
  const [itens, setItens] = useState<PedidoItem[]>([]);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  /* Sincroniza estado local quando os dados chegam do Supabase */
  useEffect(() => {
    if (pedido) {
      setForm({
        cliente_nome: pedido.cliente_nome ?? '',
        cliente_telefone: pedido.cliente_telefone ?? '',
        cliente_cnpj: pedido.cliente_cnpj ?? '',
        cliente_cep: pedido.cliente_cep ?? '',
        cliente_endereco: pedido.cliente_endereco ?? '',
        cliente_cidade: pedido.cliente_cidade ?? '',
        cliente_estado: pedido.cliente_estado ?? '',
        cliente_logo_url: pedido.cliente_logo_url ?? null,
        frete: pedido.frete ?? 0,
        desconto: pedido.desconto ?? 0,
        prazo_entrega: pedido.prazo_entrega ?? '15 a 20 dias úteis',
        status: pedido.status,
        total: pedido.total ?? 0,
      });
      setItens(pedido.itens ?? []);
    }
  }, [pedido]);

  /* ─── Mutations ─────────────────────────────────────────────────────── */
  const { mutateAsync: atualizarPedido } = useUpdatePedido();
  const { mutateAsync: finalizar, isPending: finalizando } = useFinalizarPedido();
  const { mutateAsync: adicionarItem, isPending: adicionando } = useAddPedidoItem();
  const { mutateAsync: atualizarItem } = useUpdatePedidoItem();
  const { mutateAsync: deletarItem } = useDeletePedidoItem();
  const { mutateAsync: clonarItem } = useClonePedidoItem();

  /* ─── Auto-save do pedido com debounce 1500ms ────────────────────────── */
  const salvarPedido = useCallback(
    async (patch: Partial<Pedido>, itensAtuais: PedidoItem[]) => {
      const total = calcTotalPedido(
        itensAtuais,
        Number(patch.frete ?? form.frete ?? 0),
        Number(patch.desconto ?? form.desconto ?? 0)
      );
      try {
        await atualizarPedido({ id: pedidoId, ...patch, total });
        setSavedAt(new Date());
        setSaveError(null);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Erro ao salvar');
      }
    },
    [pedidoId, atualizarPedido, form.frete, form.desconto]
  );

  const debouncedSalvar = useDebouncedCallback(salvarPedido, 1500);

  /* Atualiza campo do formulário e agenda auto-save */
  function handleFormChange(campo: keyof Pedido, valor: unknown) {
    setForm((prev) => {
      const novo = { ...prev, [campo]: valor };
      debouncedSalvar(novo, itens);
      return novo;
    });
  }

  /* ─── CEP: busca via ViaCEP ──────────────────────────────────────────── */
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep] = useState<string | null>(null);

  async function buscarCep() {
    const cep = String(form.cliente_cep ?? '').replace(/\D/g, '');
    if (cep.length !== 8) { setErroCep('CEP deve ter 8 dígitos'); return; }
    setBuscandoCep(true);
    setErroCep(null);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const dados: ViaCepResposta = await res.json();
      if (dados.erro) { setErroCep('CEP não encontrado'); return; }
      const patch = {
        cliente_endereco: dados.logradouro,
        cliente_cidade: dados.localidade,
        cliente_estado: dados.uf,
      };
      setForm((prev) => {
        const novo = { ...prev, ...patch };
        debouncedSalvar(novo, itens);
        return novo;
      });
    } catch {
      setErroCep('Erro ao consultar CEP');
    } finally {
      setBuscandoCep(false);
    }
  }

  /* ─── Autocomplete de contatos ───────────────────────────────────────── */
  const [sugestoes, setSugestoes] = useState<ContatoSugestao[]>([]);
  const [buscandoContato, setBuscandoContato] = useState(false);
  const debounceContatoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function buscarContatos(termo: string) {
    if (debounceContatoRef.current) clearTimeout(debounceContatoRef.current);
    if (termo.length < 2) { setSugestoes([]); return; }
    debounceContatoRef.current = setTimeout(async () => {
      setBuscandoContato(true);
      try {
        const res = await fetch(`/api/clients?search=${encodeURIComponent(termo)}&per_page=5`);
        const json = await res.json() as { data?: ContatoSugestao[] };
        setSugestoes(json.data ?? []);
      } catch {
        setSugestoes([]);
      } finally {
        setBuscandoContato(false);
      }
    }, 400);
  }

  function selecionarContato(contato: ContatoSugestao) {
    const patch = {
      cliente_nome: contato.name,
      cliente_telefone: contato.phone ?? '',
    };
    setForm((prev) => {
      const novo = { ...prev, ...patch };
      debouncedSalvar(novo, itens);
      return novo;
    });
    setSugestoes([]);
  }

  /* ─── Upload de logo ────────────────────────────────────────────────── */
  const [uploadandoLogo, setUploadandoLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadandoLogo(true);
    try {
      const path = `${pedidoId}/logo-${Date.now()}.${file.name.split('.').pop()}`;
      const url = await uploadImagem(file, 'pedidos-logos', path);
      handleFormChange('cliente_logo_url', url);
    } catch (err) {
      console.error('Erro ao fazer upload do logo:', err);
    } finally {
      setUploadandoLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

  /* ─── Operações de itens ────────────────────────────────────────────── */

  async function handleAddItem() {
    const item = await adicionarItem({ pedidoId });
    setItens((prev) => [...prev, item]);
  }

  /* Atualiza item localmente e salva no banco */
  function handleItemUpdate(itemId: string, patch: Partial<PedidoItem>) {
    setItens((prev) => {
      const atualizados = prev.map((it) =>
        it.id === itemId ? { ...it, ...patch } : it
      );
      // Recalcula total do pedido e agenda auto-save
      const total = calcTotalPedido(
        atualizados,
        Number(form.frete ?? 0),
        Number(form.desconto ?? 0)
      );
      setForm((f) => ({ ...f, total }));
      return atualizados;
    });

    // Salva no banco (debounce individual por item)
    const item = itens.find((it) => it.id === itemId);
    if (item) {
      const merged = { ...item, ...patch };
      atualizarItem({
        id: itemId,
        pedidoId,
        grade: merged.grade,
        valor_unitario: merged.valor_unitario,
        cores: merged.cores,
        foto_url: merged.foto_url,
        total_pares: calcTotalPares(merged.grade),
        subtotal: calcSubtotal(merged.grade, merged.valor_unitario),
      }).catch(console.error);
    }
  }

  async function handleDeleteItem(itemId: string) {
    await deletarItem({ id: itemId, pedidoId });
    setItens((prev) => prev.filter((it) => it.id !== itemId));
  }

  async function handleCloneItem(item: PedidoItem) {
    const clone = await clonarItem(item);
    setItens((prev) => [...prev, clone]);
  }

  /* ─── Finalizar pedido ──────────────────────────────────────────────── */
  async function handleFinalizar() {
    await finalizar(pedidoId);
  }

  /* ─── Import em lote (múltiplos arquivos) ───────────────────────────── */
  const loteInputRef = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useTransition();

  async function handleImportarLote(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    startImportLote(async () => {
      for (const file of files) {
        try {
          const path = `${pedidoId}/lote-${Date.now()}-${file.name}`;
          const url = await uploadImagem(file, 'pedidos-fotos', path);
          const novoItem = await adicionarItem({
            pedidoId,
            dados: { foto_url: url, cores: file.name.replace(/\.[^.]+$/, '') },
          });
          setItens((prev) => [...prev, novoItem]);
        } catch (err) {
          console.error('Erro ao importar arquivo:', file.name, err);
        }
      }
    });

    if (loteInputRef.current) loteInputRef.current.value = '';
  }

  function startImportLote(fn: () => Promise<void>) {
    // useTransition aceita apenas funções síncronas; encapsula a Promise
    React.startTransition(() => { fn().catch(console.error); });
  }

  /* ─── Cálculos derivados ────────────────────────────────────────────── */
  const valorMercadoria = itens.reduce((s, it) => s + calcSubtotal(it.grade, it.valor_unitario), 0);
  const totalFinal = calcTotalPedido(itens, Number(form.frete ?? 0), Number(form.desconto ?? 0));

  /* ─── Render de loading ─────────────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="min-h-full bg-[#0d1117] p-6">
        <div className="max-w-7xl mx-auto space-y-4 animate-pulse">
          <div className="h-8 w-48 rounded bg-[#1c2333]" />
          <div className="grid grid-cols-12 gap-5">
            <div className="col-span-4 space-y-4">
              <div className="h-64 rounded-2xl bg-[#161b24]" />
              <div className="h-48 rounded-2xl bg-[#161b24]" />
            </div>
            <div className="col-span-8 space-y-4">
              <div className="h-12 rounded-xl bg-[#161b24]" />
              <div className="h-64 rounded-2xl bg-[#161b24]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!pedido && !isLoading) {
    return (
      <div className="min-h-full bg-[#0d1117] flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle size={40} className="mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400">Pedido não encontrado</p>
          <button onClick={() => router.push('/pedidos')} className="mt-4 text-blue-400 text-sm hover:underline">
            Voltar para pedidos
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-full bg-[#0d1117] flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle size={40} className="mx-auto text-red-500 mb-3" />
          <p className="text-red-400 text-sm">{error instanceof Error ? error.message : 'Erro ao carregar pedido'}</p>
        </div>
      </div>
    );
  }

  const isFinalizado = form.status === 'finalizado';

  return (
    <div className="min-h-full bg-[#0d1117]">
      <div className="max-w-7xl mx-auto px-5 py-5 space-y-5">

        {/* ─── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/pedidos')}
              className="p-2 rounded-xl bg-[#161b24] border border-[#1c2333] text-gray-400 hover:text-white hover:border-blue-500/40 transition-all"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="text-base font-bold text-white">
                {form.cliente_nome || 'Novo Pedido'}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                {savedAt && (
                  <span className="text-[10px] text-emerald-500 flex items-center gap-1">
                    <CheckCircle2 size={10} /> Salvo às {savedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {saveError && (
                  <span className="text-[10px] text-red-400 flex items-center gap-1">
                    <AlertTriangle size={10} /> {saveError}
                  </span>
                )}
                <span className={cn(
                  'text-[10px] px-2 py-0.5 rounded-full font-semibold',
                  isFinalizado
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-amber-500/15 text-amber-400'
                )}>
                  {isFinalizado ? 'Finalizado' : 'Rascunho'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Grid principal: sidebar (4) + conteúdo (8) ──────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

          {/* ── SIDEBAR: Dados do Cliente + Finanças (col 4) ─────────────── */}
          <div className="lg:col-span-4 space-y-4">

            {/* Card Dados do Cliente */}
            <div className="bg-[#161b24] border border-[#1c2333] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#1c2333]">
                <h2 className="text-sm font-semibold text-white">Dados do Cliente</h2>
              </div>
              <div className="p-5 space-y-4">

                {/* Logo */}
                <div className="flex items-center gap-4">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoChange}
                  />
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadandoLogo || isFinalizado}
                    className="w-16 h-16 rounded-xl bg-[#0d1117] border border-[#2a3347] border-dashed flex flex-col items-center justify-center overflow-hidden hover:border-blue-500/60 transition-colors shrink-0 group"
                    title="Clique para enviar logo"
                  >
                    {uploadandoLogo ? (
                      <Loader2 size={16} className="text-blue-400 animate-spin" />
                    ) : form.cliente_logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={form.cliente_logo_url} alt="Logo" className="w-full h-full object-contain p-1" />
                    ) : (
                      <>
                        <Upload size={14} className="text-gray-600 group-hover:text-blue-400 transition-colors" />
                        <span className="text-[9px] text-gray-600 mt-0.5 group-hover:text-blue-400">Logo</span>
                      </>
                    )}
                  </button>
                  <div className="text-xs text-gray-500 leading-relaxed">
                    Logo do cliente para o PDF.
                    <br />Clique para enviar.
                  </div>
                </div>

                {/* Nome (com autocomplete) */}
                <div className="relative">
                  <label className="block text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1.5">
                    Nome completo *
                  </label>
                  <input
                    type="text"
                    value={form.cliente_nome ?? ''}
                    disabled={isFinalizado}
                    onChange={(e) => {
                      handleFormChange('cliente_nome', e.target.value);
                      buscarContatos(e.target.value);
                    }}
                    placeholder="Nome do cliente"
                    className="w-full bg-[#0d1117] border border-[#2a3347] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60 transition-colors disabled:opacity-50"
                  />
                  {/* Sugestões de autocompletar */}
                  {sugestoes.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-[#1c2333] border border-[#2a3347] rounded-xl shadow-2xl overflow-hidden">
                      {buscandoContato && (
                        <div className="px-3 py-2 text-xs text-gray-500 flex items-center gap-2">
                          <Loader2 size={12} className="animate-spin" /> Buscando...
                        </div>
                      )}
                      {sugestoes.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => selecionarContato(c)}
                          className="w-full px-3 py-2.5 text-left text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                        >
                          <span className="font-medium">{c.name}</span>
                          {c.phone && <span className="text-gray-500 ml-2 text-xs">{c.phone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* WhatsApp */}
                <CampoTexto
                  label="WhatsApp"
                  value={form.cliente_telefone ?? ''}
                  disabled={isFinalizado}
                  onChange={(v) => handleFormChange('cliente_telefone', v)}
                  placeholder="(62) 99999-9999"
                />

                {/* CNPJ */}
                <CampoTexto
                  label="CNPJ"
                  value={form.cliente_cnpj ?? ''}
                  disabled={isFinalizado}
                  onChange={(v) => handleFormChange('cliente_cnpj', v)}
                  placeholder="00.000.000/0001-00"
                />

                {/* CEP + busca */}
                <div>
                  <label className="block text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1.5">
                    CEP
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.cliente_cep ?? ''}
                      disabled={isFinalizado}
                      maxLength={9}
                      onChange={(e) => handleFormChange('cliente_cep', e.target.value)}
                      placeholder="00000-000"
                      className="flex-1 bg-[#0d1117] border border-[#2a3347] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60 transition-colors disabled:opacity-50"
                    />
                    <button
                      onClick={buscarCep}
                      disabled={buscandoCep || isFinalizado}
                      title="Buscar endereço pelo CEP"
                      className="px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors"
                    >
                      {buscandoCep
                        ? <Loader2 size={14} className="animate-spin" />
                        : <MapPin size={14} />}
                    </button>
                  </div>
                  {erroCep && <p className="text-[11px] text-red-400 mt-1">{erroCep}</p>}
                </div>

                {/* Endereço */}
                <CampoTexto
                  label="Endereço"
                  value={form.cliente_endereco ?? ''}
                  disabled={isFinalizado}
                  onChange={(v) => handleFormChange('cliente_endereco', v)}
                  placeholder="Rua, número, bairro"
                />

                {/* Cidade + Estado */}
                <div className="grid grid-cols-2 gap-3">
                  <CampoTexto
                    label="Cidade"
                    value={form.cliente_cidade ?? ''}
                    disabled={isFinalizado}
                    onChange={(v) => handleFormChange('cliente_cidade', v)}
                    placeholder="Goiânia"
                  />
                  <CampoTexto
                    label="Estado"
                    value={form.cliente_estado ?? ''}
                    disabled={isFinalizado}
                    onChange={(v) => handleFormChange('cliente_estado', v)}
                    placeholder="GO"
                  />
                </div>
              </div>
            </div>

            {/* Card Finanças */}
            <div className="bg-[#161b24] border border-[#1c2333] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#1c2333]">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <DollarSign size={14} className="text-blue-400" /> Finanças
                </h2>
              </div>
              <div className="p-5 space-y-4">

                {/* Valor mercadoria (calculado) */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Valor mercadoria</span>
                  <span className="text-sm font-medium text-white">{brl(valorMercadoria)}</span>
                </div>

                {/* Frete */}
                <div>
                  <label className="block text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1.5">
                    Frete (R$)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.frete ?? 0}
                    disabled={isFinalizado}
                    onChange={(e) => handleFormChange('frete', parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#0d1117] border border-[#2a3347] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/60 transition-colors disabled:opacity-50"
                  />
                </div>

                {/* Desconto */}
                <div>
                  <label className="block text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1.5">
                    Desconto (R$)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.desconto ?? 0}
                    disabled={isFinalizado}
                    onChange={(e) => handleFormChange('desconto', parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#0d1117] border border-[#2a3347] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/60 transition-colors disabled:opacity-50"
                  />
                </div>

                {/* Prazo */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Prazo de entrega</span>
                  <span className="text-xs font-medium text-gray-300">{form.prazo_entrega}</span>
                </div>

                {/* Total em destaque */}
                <div className="bg-[#0d1117] rounded-xl px-4 py-3 border border-[#2a3347]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Total do pedido</span>
                    <span className="text-xl font-bold text-blue-400">{brl(totalFinal)}</span>
                  </div>
                </div>

                {/* Botão Finalizar */}
                {!isFinalizado && (
                  <button
                    onClick={handleFinalizar}
                    disabled={finalizando || itens.length === 0}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    {finalizando
                      ? <><Loader2 size={15} className="animate-spin" /> Finalizando...</>
                      : <><CheckCircle2 size={15} /> Finalizar Pedido</>}
                  </button>
                )}

                {isFinalizado && (
                  <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2.5 text-emerald-400 text-sm">
                    <CheckCircle2 size={15} /> Pedido finalizado
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── ÁREA PRINCIPAL: Itens (col 8) ──────────────────────────────── */}
          <div className="lg:col-span-8 space-y-4">

            {/* Header da área de itens */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Modelos do Pedido
                  {itens.length > 0 && (
                    <span className="ml-2 text-[11px] text-gray-500 font-normal">
                      {itens.length} modelo{itens.length !== 1 ? 's' : ''} ·{' '}
                      {itens.reduce((s, it) => s + calcTotalPares(it.grade), 0)} pares
                    </span>
                  )}
                </h2>
              </div>
              {!isFinalizado && (
                <div className="flex items-center gap-2">
                  {/* Importar lote */}
                  <input
                    ref={loteInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImportarLote}
                  />
                  <button
                    onClick={() => loteInputRef.current?.click()}
                    disabled={importando}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#161b24] border border-[#1c2333] hover:border-blue-500/40 text-gray-400 hover:text-white rounded-xl text-xs font-medium transition-all"
                  >
                    {importando
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Upload size={13} />}
                    Importar Lote
                  </button>
                  {/* Novo item */}
                  <button
                    onClick={handleAddItem}
                    disabled={adicionando}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-xl text-xs font-semibold transition-colors"
                  >
                    {adicionando
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Plus size={13} />}
                    Novo Item
                  </button>
                </div>
              )}
            </div>

            {/* Lista de cards de itens */}
            {itens.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 bg-[#161b24] border border-[#1c2333] border-dashed rounded-2xl">
                <Package size={32} className="text-gray-600 mb-3" />
                <p className="text-gray-500 text-sm mb-4">
                  Nenhum modelo adicionado ainda
                </p>
                {!isFinalizado && (
                  <button
                    onClick={handleAddItem}
                    disabled={adicionando}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors"
                  >
                    <Plus size={14} /> Adicionar primeiro modelo
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {itens.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    pedidoId={pedidoId}
                    onUpdate={(patch) => handleItemUpdate(item.id, patch)}
                    onDelete={() => handleDeleteItem(item.id)}
                    onClone={() => handleCloneItem(item)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Ações PDF (botão flutuante inferior) ────────────────────────── */}
      {pedido && (
        <PedidoActions
          pedido={{ ...pedido, ...form, itens } as Pedido & { itens: PedidoItem[] }}
        />
      )}
    </div>
  );
}

/* ─── Campo de texto reutilizável ────────────────────────────────────────── */

function CampoTexto({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#0d1117] border border-[#2a3347] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60 transition-colors disabled:opacity-50"
      />
    </div>
  );
}
