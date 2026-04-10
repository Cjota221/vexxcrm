'use client';

import { useRef, useState, useEffect } from 'react';
import { Search, Upload, Loader2, MapPin, X } from 'lucide-react';
import {
  PLPedido, PLPedidoUpdate, Contato,
  useContatosPL, uploadPLImagem,
} from '@/hooks/use-private-label';
import { cn } from '@/lib/utils';

interface Props {
  pedido:       PLPedido;
  isSaving:     boolean;
  onUpdate:     (updates: PLPedidoUpdate) => void;
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export function ClienteSidebar({ pedido, isSaving, onUpdate }: Props) {
  /* ── Autocomplete contatos ── */
  const [buscaContato, setBuscaContato] = useState('');
  const [showDropdown,  setShowDropdown] = useState(false);
  const { data: contatos = [] } = useContatosPL(buscaContato);

  /* ── CEP ── */
  const [buscandoCep, setBuscandoCep] = useState(false);

  /* ── Logo upload ── */
  const [uploadandoLogo, setUploadandoLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  /* ── Valores numéricos locais ── */
  const [frete,    setFrete]    = useState(String(pedido.frete    ?? 0));
  const [desconto, setDesconto] = useState(String(pedido.desconto ?? 0));

  /* mantém campo local sincronizado quando pedido muda externamente */
  useEffect(() => { setFrete(String(pedido.frete    ?? 0)); }, [pedido.frete]);
  useEffect(() => { setDesconto(String(pedido.desconto ?? 0)); }, [pedido.desconto]);

  /* ── Selecionar contato do dropdown ── */
  function selecionarContato(c: Contato) {
    onUpdate({
      contact_id:       c.id,
      cliente_nome:     c.name  ?? '',
      cliente_telefone: c.phone ?? '',
      cliente_email:    c.email ?? '',
    });
    setBuscaContato('');
    setShowDropdown(false);
  }

  /* ── ViaCEP ── */
  async function buscarCep(cep: string) {
    const cleaned = cep.replace(/\D/g, '');
    if (cleaned.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
      const data = await res.json();
      if (!data.erro) {
        onUpdate({
          cliente_cep:      cleaned,
          cliente_endereco: data.logradouro ?? '',
          cliente_bairro:   data.bairro     ?? '',
          cliente_cidade:   data.localidade ?? '',
          cliente_estado:   data.uf         ?? '',
        });
      }
    } catch { /* ignora */ }
    finally { setBuscandoCep(false); }
  }

  /* ── Upload logo ── */
  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadandoLogo(true);
    try {
      const path = `${pedido.tenant_id}/${pedido.id}/logo.${file.name.split('.').pop()}`;
      const url  = await uploadPLImagem(file, 'private-label-logos', path);
      onUpdate({ cliente_logo_url: url });
    } catch { /* ignora */ }
    finally { setUploadandoLogo(false); }
  }

  const subtotalItens = pedido.total; // total já calculado pelo servidor
  const freteNum    = parseFloat(frete)    || 0;
  const descontoNum = parseFloat(desconto) || 0;

  return (
    <div className="space-y-5">

      {/* ── Cabeçalho ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Dados do Cliente</h2>
        {isSaving && (
          <span className="flex items-center gap-1 text-xs text-[#6b7fa3]">
            <Loader2 className="w-3 h-3 animate-spin" /> Salvando…
          </span>
        )}
      </div>

      {/* ── Buscar contato ── */}
      <div className="relative">
        <label className="text-xs text-[#6b7fa3] mb-1 block">Buscar contato existente</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6b7fa3]" />
          <input
            type="text"
            placeholder="Nome ou telefone…"
            value={buscaContato}
            onChange={e => { setBuscaContato(e.target.value); setShowDropdown(true); }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            className="w-full pl-8 pr-3 py-2 bg-[#0d1117] border border-[#1c2333] rounded-lg text-xs text-white placeholder-[#6b7fa3] focus:outline-none focus:border-purple-500/50 transition"
          />
        </div>
        {showDropdown && contatos.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-[#161b24] border border-[#1c2333] rounded-lg overflow-hidden shadow-lg">
            {contatos.map(c => (
              <button
                key={c.id}
                onMouseDown={() => selecionarContato(c)}
                className="w-full flex flex-col px-3 py-2 text-left hover:bg-white/[0.04] transition"
              >
                <span className="text-xs font-medium text-white">{c.name}</span>
                {c.phone && <span className="text-[10px] text-[#6b7fa3]">{c.phone}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Logo ── */}
      <div>
        <label className="text-xs text-[#6b7fa3] mb-1 block">Logo do cliente</label>
        <div className="flex items-center gap-3">
          {pedido.cliente_logo_url ? (
            <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-[#1c2333] shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pedido.cliente_logo_url} alt="Logo" className="w-full h-full object-contain" />
              <button
                onClick={() => onUpdate({ cliente_logo_url: null })}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center hover:bg-red-500/80 transition"
              >
                <X className="w-2.5 h-2.5 text-white" />
              </button>
            </div>
          ) : (
            <div className="w-14 h-14 rounded-lg bg-[#0d1117] border border-dashed border-[#1c2333] flex items-center justify-center shrink-0">
              <Upload className="w-4 h-4 text-[#6b7fa3]" />
            </div>
          )}
          <button
            onClick={() => logoInputRef.current?.click()}
            disabled={uploadandoLogo}
            className="text-xs text-purple-400 hover:text-purple-300 transition disabled:opacity-50"
          >
            {uploadandoLogo ? 'Enviando…' : 'Trocar logo'}
          </button>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoChange}
          />
        </div>
      </div>

      {/* ── Campos do cliente ── */}
      {[
        { label: 'Nome',     field: 'cliente_nome'     as const, type: 'text'  },
        { label: 'Telefone', field: 'cliente_telefone' as const, type: 'tel'   },
        { label: 'E-mail',   field: 'cliente_email'    as const, type: 'email' },
        { label: 'CNPJ',     field: 'cliente_cnpj'     as const, type: 'text'  },
      ].map(({ label, field, type }) => (
        <div key={field}>
          <label className="text-xs text-[#6b7fa3] mb-1 block">{label}</label>
          <input
            type={type}
            value={(pedido[field] as string) ?? ''}
            onChange={e => onUpdate({ [field]: e.target.value })}
            className="w-full px-3 py-2 bg-[#0d1117] border border-[#1c2333] rounded-lg text-xs text-white placeholder-[#6b7fa3] focus:outline-none focus:border-purple-500/50 transition"
          />
        </div>
      ))}

      {/* ── CEP + Endereço ── */}
      <div>
        <label className="text-xs text-[#6b7fa3] mb-1 block">CEP</label>
        <div className="relative">
          <input
            type="text"
            maxLength={9}
            value={pedido.cliente_cep ?? ''}
            onChange={e => onUpdate({ cliente_cep: e.target.value })}
            onBlur={e => buscarCep(e.target.value)}
            placeholder="00000-000"
            className="w-full pl-3 pr-8 py-2 bg-[#0d1117] border border-[#1c2333] rounded-lg text-xs text-white placeholder-[#6b7fa3] focus:outline-none focus:border-purple-500/50 transition"
          />
          {buscandoCep
            ? <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6b7fa3] animate-spin" />
            : <MapPin  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6b7fa3]" />
          }
        </div>
      </div>

      {(pedido.cliente_endereco || pedido.cliente_cidade) && (
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Endereço', field: 'cliente_endereco' as const, cols: 2 },
            { label: 'Bairro',   field: 'cliente_bairro'   as const, cols: 1 },
            { label: 'Cidade',   field: 'cliente_cidade'   as const, cols: 1 },
            { label: 'Estado',   field: 'cliente_estado'   as const, cols: 1 },
          ].map(({ label, field, cols }) => (
            <div key={field} className={cols === 2 ? 'col-span-2' : ''}>
              <label className="text-xs text-[#6b7fa3] mb-1 block">{label}</label>
              <input
                type="text"
                value={(pedido[field] as string) ?? ''}
                onChange={e => onUpdate({ [field]: e.target.value })}
                className="w-full px-3 py-2 bg-[#0d1117] border border-[#1c2333] rounded-lg text-xs text-white focus:outline-none focus:border-purple-500/50 transition"
              />
            </div>
          ))}
        </div>
      )}

      {/* ── Prazo de entrega ── */}
      <div>
        <label className="text-xs text-[#6b7fa3] mb-1 block">Prazo de entrega</label>
        <input
          type="text"
          placeholder="Ex: 30 dias úteis"
          value={pedido.prazo_entrega ?? ''}
          onChange={e => onUpdate({ prazo_entrega: e.target.value })}
          className="w-full px-3 py-2 bg-[#0d1117] border border-[#1c2333] rounded-lg text-xs text-white placeholder-[#6b7fa3] focus:outline-none focus:border-purple-500/50 transition"
        />
      </div>

      {/* ── Observações ── */}
      <div>
        <label className="text-xs text-[#6b7fa3] mb-1 block">Observações</label>
        <textarea
          rows={3}
          placeholder="Condições especiais, cor, detalhes…"
          value={pedido.observacoes ?? ''}
          onChange={e => onUpdate({ observacoes: e.target.value })}
          className="w-full px-3 py-2 bg-[#0d1117] border border-[#1c2333] rounded-lg text-xs text-white placeholder-[#6b7fa3] focus:outline-none focus:border-purple-500/50 transition resize-none"
        />
      </div>

      {/* ── Frete / Desconto / Total ── */}
      <div className="border-t border-[#1c2333] pt-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-[#6b7fa3] mb-1 block">Frete (R$)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={frete}
              onChange={e => setFrete(e.target.value)}
              onBlur={() => onUpdate({ frete: parseFloat(frete) || 0 })}
              className="w-full px-3 py-2 bg-[#0d1117] border border-[#1c2333] rounded-lg text-xs text-white focus:outline-none focus:border-purple-500/50 transition"
            />
          </div>
          <div>
            <label className="text-xs text-[#6b7fa3] mb-1 block">Desconto (R$)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={desconto}
              onChange={e => setDesconto(e.target.value)}
              onBlur={() => onUpdate({ desconto: parseFloat(desconto) || 0 })}
              className="w-full px-3 py-2 bg-[#0d1117] border border-[#1c2333] rounded-lg text-xs text-white focus:outline-none focus:border-purple-500/50 transition"
            />
          </div>
        </div>

        <div className={cn(
          'rounded-xl p-3 flex items-center justify-between',
          'bg-purple-600/10 border border-purple-500/20',
        )}>
          <span className="text-xs text-purple-300 font-medium">Total do Pedido</span>
          <span className="text-base font-bold text-white">{fmtBRL(pedido.total)}</span>
        </div>
      </div>

    </div>
  );
}
