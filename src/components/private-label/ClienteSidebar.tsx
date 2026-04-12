'use client';

import { useState, useEffect } from 'react';
import { Search, Upload, Loader2, MapPin, X } from 'lucide-react';
import { PLPedido, PLPedidoUpdate, Contato, useContatosPL, uploadPLImagem } from '@/hooks/usePrivateLabel';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';

interface Props {
  pedido:   PLPedido;
  isSaving: boolean;
  onUpdate: (updates: PLPedidoUpdate) => void;
}

export function ClienteSidebar({ pedido, isSaving, onUpdate }: Props) {
  const [buscaContato, setBuscaContato] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const { data: contatos = [] } = useContatosPL(buscaContato);

  const [buscandoCep,    setBuscandoCep]    = useState(false);
  const [uploadandoLogo, setUploadandoLogo] = useState(false);

  const [frete,    setFrete]    = useState(String(pedido.frete    ?? 0));
  const [desconto, setDesconto] = useState(String(pedido.desconto ?? 0));

  useEffect(() => { setFrete(String(pedido.frete    ?? 0)); }, [pedido.frete]);
  useEffect(() => { setDesconto(String(pedido.desconto ?? 0)); }, [pedido.desconto]);

  function selecionarContato(c: Contato) {
    onUpdate({ contact_id: c.id, cliente_nome: c.name ?? '', cliente_telefone: c.phone ?? '', cliente_email: c.email ?? '' });
    setBuscaContato('');
    setShowDropdown(false);
  }

  async function buscarCep(cep: string) {
    const cleaned = cep.replace(/\D/g, '');
    if (cleaned.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
      const data = await res.json();
      if (!data.erro) {
        onUpdate({ cliente_cep: cleaned, cliente_endereco: data.logradouro ?? '', cliente_bairro: data.bairro ?? '', cliente_cidade: data.localidade ?? '', cliente_estado: data.uf ?? '' });
      }
    } catch { /* ignora */ }
    finally { setBuscandoCep(false); }
  }

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

  return (
    <div className="space-y-4">

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-txt-primary">Dados do Cliente</h2>
        {isSaving && (
          <span className="flex items-center gap-1 text-xs text-txt-secondary">
            <Loader2 size={12} className="animate-spin" /> Salvando…
          </span>
        )}
      </div>

      {/* Buscar contato */}
      <div className="relative">
        <label className="label">Buscar contato existente</label>
        <div className="relative mt-1.5">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-secondary pointer-events-none" />
          <input
            type="text"
            placeholder="Nome ou telefone…"
            value={buscaContato}
            onChange={e => { setBuscaContato(e.target.value); setShowDropdown(true); }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            className="input pl-8 text-sm"
          />
        </div>
        {showDropdown && contatos.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-surface-border rounded-xl overflow-hidden shadow-lg">
            {contatos.map(c => (
              <button
                key={c.id}
                onMouseDown={() => selecionarContato(c)}
                className="w-full flex flex-col px-3 py-2 text-left hover:bg-surface-50 transition-colors"
              >
                <span className="text-sm font-medium text-txt-primary">{c.name}</span>
                {c.phone && <span className="text-xs text-txt-secondary">{c.phone}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Logo */}
      <div>
        <span className="label">Logo do cliente</span>
        <div className="flex items-center gap-3 mt-1.5">
          {/* Thumbnail com botão de remover */}
          {pedido.cliente_logo_url && (
            <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-surface-border shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pedido.cliente_logo_url} alt="Logo" className="w-full h-full object-contain" />
              <button
                onClick={() => onUpdate({ cliente_logo_url: null })}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/50 flex items-center justify-center hover:bg-red-500 transition-colors"
              >
                <X size={10} className="text-white" />
              </button>
            </div>
          )}

          {/* Label clicável abre o file picker diretamente */}
          <label
            htmlFor="logo-upload"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-border bg-surface-50 cursor-pointer hover:bg-surface-100 transition-colors text-sm text-txt-primary ${uploadandoLogo ? 'opacity-50 pointer-events-none' : ''}`}
          >
            {uploadandoLogo
              ? <Loader2 size={14} className="animate-spin text-txt-secondary" />
              : <Upload size={14} className="text-txt-secondary" />
            }
            {uploadandoLogo ? 'Enviando…' : pedido.cliente_logo_url ? 'Trocar logo' : 'Enviar logo'}
          </label>
          <input
            id="logo-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoChange}
          />
        </div>
      </div>

      {/* Campos */}
      {[
        { label: 'Nome',     field: 'cliente_nome'     as const, type: 'text'  },
        { label: 'Telefone', field: 'cliente_telefone' as const, type: 'tel'   },
        { label: 'E-mail',   field: 'cliente_email'    as const, type: 'email' },
        { label: 'CNPJ',     field: 'cliente_cnpj'     as const, type: 'text'  },
      ].map(({ label, field, type }) => (
        <div key={field}>
          <label className="label">{label}</label>
          <input
            type={type}
            value={(pedido[field] as string) ?? ''}
            onChange={e => onUpdate({ [field]: e.target.value })}
            className="input mt-1.5"
          />
        </div>
      ))}

      {/* CEP */}
      <div>
        <label className="label">CEP</label>
        <div className="relative mt-1.5">
          <input
            type="text"
            maxLength={9}
            value={pedido.cliente_cep ?? ''}
            onChange={e => onUpdate({ cliente_cep: e.target.value })}
            onBlur={e => buscarCep(e.target.value)}
            placeholder="00000-000"
            className="input pr-8"
          />
          {buscandoCep
            ? <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-txt-secondary" />
            : <MapPin  size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-secondary" />
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
              <label className="label">{label}</label>
              <input
                type="text"
                value={(pedido[field] as string) ?? ''}
                onChange={e => onUpdate({ [field]: e.target.value })}
                className="input mt-1.5"
              />
            </div>
          ))}
        </div>
      )}

      <div>
        <label className="label">Prazo de entrega</label>
        <input
          type="text"
          placeholder="Ex: 30 dias úteis"
          value={pedido.prazo_entrega ?? ''}
          onChange={e => onUpdate({ prazo_entrega: e.target.value })}
          className="input mt-1.5"
        />
      </div>

      <div>
        <label className="label">Observações</label>
        <textarea
          rows={3}
          placeholder="Condições especiais, detalhes…"
          value={pedido.observacoes ?? ''}
          onChange={e => onUpdate({ observacoes: e.target.value })}
          className="input mt-1.5 resize-none"
        />
      </div>

      {/* Silk screen */}
      <div className="border-t border-surface-200 pt-4">
        <label className="flex items-center justify-between cursor-pointer gap-3">
          <div>
            <p className="text-sm font-medium text-txt-primary">Silk screen na logo</p>
            <p className="text-xs text-txt-secondary">Acréscimo de R$ 100,00 por pedido</p>
          </div>
          <button
            type="button"
            onClick={() => onUpdate({ silk_logo: !pedido.silk_logo })}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
              pedido.silk_logo ? 'bg-crm-primary' : 'bg-surface-300'
            }`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
              pedido.silk_logo ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </label>
      </div>

      {/* Frete / Desconto / Total */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Frete (R$)</label>
            <input
              type="number" min="0" step="0.01"
              value={frete}
              onChange={e => setFrete(e.target.value)}
              onBlur={() => onUpdate({ frete: parseFloat(frete) || 0 })}
              className="input mt-1.5"
            />
          </div>
          <div>
            <label className="label">Desconto (R$)</label>
            <input
              type="number" min="0" step="0.01"
              value={desconto}
              onChange={e => setDesconto(e.target.value)}
              onBlur={() => onUpdate({ desconto: parseFloat(desconto) || 0 })}
              className="input mt-1.5"
            />
          </div>
        </div>

        <div className="flex items-center justify-between p-3 bg-crm-primary/5 border border-crm-primary/20 rounded-xl">
          <span className="text-sm font-medium text-txt-primary">Total do Pedido</span>
          <span className="text-lg font-bold text-crm-primary">{formatCurrency(pedido.total)}</span>
        </div>
      </div>

    </div>
  );
}
