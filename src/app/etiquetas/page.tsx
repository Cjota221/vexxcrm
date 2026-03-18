'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tag, Users, Download, X, Search, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';

/* ── Tipos ────────────────────────────────────────────────────── */

interface LabelSummary {
  label_name: string;
  total: number;
}

interface LabelClient {
  nome: string;
  telefone: string;
  email: string;
  ultima_compra: string;
  total_gasto: number;
  total_pedidos: number;
  etiqueta: string;
}

/* ── Mapeamento visual das etiquetas ──────────────────────────── */

const LABEL_STYLE: Record<string, { color: string; bg: string; dot: string }> = {
  'Novo Lead':         { color: 'text-sky-700',     bg: 'bg-sky-50',     dot: 'bg-sky-400' },
  'Aguard. Pagamento': { color: 'text-orange-700',  bg: 'bg-orange-50',  dot: 'bg-orange-400' },
  'Pago':              { color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-400' },
  'Em Risco':          { color: 'text-red-700',     bg: 'bg-red-50',     dot: 'bg-red-400' },
  'Lead Quente':       { color: 'text-amber-700',   bg: 'bg-amber-50',   dot: 'bg-amber-400' },
  'Inativo':           { color: 'text-gray-600',    bg: 'bg-gray-100',   dot: 'bg-gray-400' },
};

function getLabelStyle(name: string) {
  return LABEL_STYLE[name] ?? { color: 'text-violet-700', bg: 'bg-violet-50', dot: 'bg-violet-400' };
}

/* ── Mapeamento Anne → etiqueta (para seção de configuração) ──── */

const ANNE_MAPPING = [
  { gatilho: 'Primeiro contato',   etiqueta: 'Novo Lead' },
  { gatilho: 'Pedido recebido',    etiqueta: 'Aguard. Pagamento' },
  { gatilho: 'Pagamento aprovado', etiqueta: 'Pago' },
  { gatilho: 'Sinal de rejeição',  etiqueta: 'Em Risco' },
  { gatilho: 'Engajamento alto',   etiqueta: 'Lead Quente' },
  { gatilho: 'Ghosting',           etiqueta: 'Inativo' },
];

/* ── Componente principal ─────────────────────────────────────── */

export default function EtiquetasPage() {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Buscar sumário de etiquetas
  const { data: summaryData, isLoading } = useQuery({
    queryKey: ['labels-summary'],
    queryFn: async () => {
      const res = await api.get<{ data: LabelSummary[] }>('/api/v2/labels/export');
      if (res.error) throw new Error(res.error);
      return (res.data as any)?.data as LabelSummary[];
    },
    staleTime: 30_000,
  });

  // Buscar clientes da etiqueta selecionada
  const { data: clientsData, isLoading: clientsLoading } = useQuery({
    queryKey: ['label-clients', selectedLabel],
    queryFn: async () => {
      const res = await api.get<{ data: LabelClient[] }>(
        `/api/v2/labels/export?label=${encodeURIComponent(selectedLabel!)}`
      );
      if (res.error) throw new Error(res.error);
      return (res.data as any)?.data as LabelClient[];
    },
    enabled: !!selectedLabel,
    staleTime: 30_000,
  });

  const labels = summaryData ?? [];
  const clients = clientsData ?? [];
  const totalContatos = labels.reduce((s, l) => s + l.total, 0);

  const filteredClients = clients.filter(c =>
    !search ||
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    c.telefone.includes(search)
  );

  function handleExportCSV(labelName: string) {
    window.open(
      `/api/v2/labels/export?label=${encodeURIComponent(labelName)}&format=csv`,
      '_blank'
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-crm-primary/10 flex items-center justify-center">
            <Tag size={18} className="text-crm-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Etiquetas WhatsApp</h1>
            <p className="text-xs text-gray-400">
              {labels.length} etiqueta{labels.length !== 1 ? 's' : ''} · {totalContatos} contato{totalContatos !== 1 ? 's' : ''} etiquetado{totalContatos !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Grid de etiquetas */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
              Carregando etiquetas...
            </div>
          ) : labels.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-60 text-center gap-3">
              <Tag size={32} className="text-gray-300" />
              <p className="text-sm font-semibold text-gray-500">Nenhuma etiqueta ainda</p>
              <p className="text-xs text-gray-400 max-w-xs">
                A Anne aplica etiquetas automaticamente quando detecta gatilhos como pagamento aprovado, ghosting, etc.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {labels.map(label => {
                const style = getLabelStyle(label.label_name);
                const isSelected = selectedLabel === label.label_name;
                return (
                  <div
                    key={label.label_name}
                    className={cn(
                      'bg-white rounded-2xl border-2 p-4 flex flex-col gap-3 transition-all cursor-pointer hover:shadow-md',
                      isSelected ? 'border-crm-primary shadow-md' : 'border-gray-100'
                    )}
                    onClick={() => setSelectedLabel(isSelected ? null : label.label_name)}
                  >
                    {/* Topo */}
                    <div className="flex items-center justify-between">
                      <span className={cn('px-2.5 py-1 rounded-full text-xs font-bold', style.bg, style.color)}>
                        {label.label_name}
                      </span>
                      <span className={cn('w-2.5 h-2.5 rounded-full', style.dot)} />
                    </div>

                    {/* Contagem */}
                    <div className="flex items-center gap-2">
                      <Users size={14} className="text-gray-400" />
                      <span className="text-2xl font-black text-gray-800">{label.total}</span>
                      <span className="text-xs text-gray-400">contato{label.total !== 1 ? 's' : ''}</span>
                    </div>

                    {/* Ações */}
                    <div className="flex gap-2 mt-auto">
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedLabel(label.label_name); }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-xs font-medium text-gray-600 transition-colors"
                      >
                        <ChevronRight size={12} />
                        Ver
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleExportCSV(label.label_name); }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-crm-primary/10 hover:bg-crm-primary/20 text-xs font-medium text-crm-primary transition-colors"
                      >
                        <Download size={12} />
                        CSV
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Seção: mapeamento Anne → etiqueta */}
          <div className="mt-8">
            <h2 className="text-sm font-bold text-gray-700 mb-3">Etiquetas automáticas da Anne</h2>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {ANNE_MAPPING.map((item, i) => {
                const style = getLabelStyle(item.etiqueta);
                return (
                  <div
                    key={item.gatilho}
                    className={cn(
                      'flex items-center justify-between px-4 py-3',
                      i < ANNE_MAPPING.length - 1 && 'border-b border-gray-50'
                    )}
                  >
                    <span className="text-sm text-gray-600">{item.gatilho}</span>
                    <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-semibold', style.bg, style.color)}>
                      {item.etiqueta}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              As etiquetas são aplicadas automaticamente no WhatsApp Business quando a Anne detecta os gatilhos acima.
            </p>
          </div>
        </div>

        {/* Drawer lateral — lista de contatos */}
        {selectedLabel && (
          <div className="w-80 xl:w-96 shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
            {/* Header do drawer */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div>
                <p className="text-xs text-gray-400">Etiqueta</p>
                <p className="text-sm font-bold text-gray-800">{selectedLabel}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExportCSV(selectedLabel)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-crm-primary/10 text-crm-primary text-xs font-medium hover:bg-crm-primary/20 transition-colors"
                >
                  <Download size={12} />
                  Exportar CSV
                </button>
                <button
                  onClick={() => setSelectedLabel(null)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Busca */}
            <div className="px-3 py-2 border-b border-gray-50">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50">
                <Search size={13} className="text-gray-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Buscar por nome ou telefone..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="flex-1 text-xs bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
                />
              </div>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto">
              {clientsLoading ? (
                <div className="flex items-center justify-center h-32 text-sm text-gray-400">
                  Carregando...
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-gray-400">
                  Nenhum contato encontrado
                </div>
              ) : (
                filteredClients.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                  >
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-crm-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-crm-primary">
                      {c.nome.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{c.nome || '–'}</p>
                      <p className="text-xs text-gray-400">{c.telefone}</p>
                      {(c.total_gasto > 0 || c.total_pedidos > 0) && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {c.total_pedidos} pedido{c.total_pedidos !== 1 ? 's' : ''} · {formatCurrency(c.total_gasto)}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {!clientsLoading && filteredClients.length > 0 && (
              <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
                {filteredClients.length} contato{filteredClients.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
