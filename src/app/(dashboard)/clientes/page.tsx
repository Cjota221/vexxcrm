'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Download,
  Users,
  TrendingUp,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  FileUp,
  CheckSquare,
  Square,
  Megaphone,
  X,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SentinelaButton } from '@/components/crm/SentinelaButton';
import { formatCurrency, formatRelativeTime, getInitials, getAvatarColor, debounce } from '@/lib/utils';
import type { ClientStatus } from '@/types';

const STATUS_MAP: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  novo:     { label: 'Novo',       variant: 'info' },
  ativo:    { label: 'Ativo',      variant: 'success' },
  active:   { label: 'Ativo',      variant: 'success' },
  vip:      { label: 'VIP',        variant: 'warning' },
  risco:    { label: 'Em risco',   variant: 'danger' },
  inativo:  { label: 'Inativo',    variant: 'neutral' },
  inactive: { label: 'Inativo',    variant: 'neutral' },
  blocked:  { label: 'Bloqueado',  variant: 'danger' },
};

const SOURCE_MAP: Record<string, { label: string; icon: string; color: string }> = {
  whatsapp: { label: 'WhatsApp',  icon: '', color: 'bg-green-50 text-green-700 border-green-100' },
  facilzap: { label: 'FacilZap',  icon: '', color: 'bg-green-50 text-green-700 border-green-100' },
  import:   { label: 'Importado', icon: '', color: 'bg-blue-50 text-blue-700 border-blue-100' },
  manual:   { label: 'Manual',    icon: '',  color: 'bg-gray-50 text-gray-600 border-gray-200' },
  campaign: { label: 'Campanha',  icon: '', color: 'bg-purple-50 text-purple-700 border-purple-100' },
};

const PER_PAGE_OPTIONS = [50, 100, 200];

export default function ClientesPage() {
  const router = useRouter();

  // Filtros
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState<ClientStatus | ''>('');
  const [hasOrdersFilter, setHasOrdersFilter] = useState<'all' | 'with_orders' | 'without_orders'>('all');
  const [sourceFilter, setSourceFilter]   = useState<'whatsapp' | 'import' | 'manual' | 'campaign' | 'facilzap' | ''>('');
  const [hasNameFilter, setHasNameFilter] = useState<'all' | 'with_name' | 'without_name'>('all');
  const [currentPage, setCurrentPage]     = useState(1);
  const [perPage, setPerPage]             = useState(200);

  // Selecao
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data, isLoading } = useClients({
    search: search || undefined,
    status: statusFilter || undefined,
    has_orders: hasOrdersFilter === 'all' ? undefined : hasOrdersFilter === 'with_orders',
    source: sourceFilter || undefined,
    has_name: hasNameFilter === 'all' ? undefined : hasNameFilter === 'with_name',
    page: currentPage,
    per_page: perPage,
  });

  const clients    = data?.data ?? [];
  const total      = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;

  const handleSearch = debounce((value: string) => {
    setSearch(value);
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, 300);

  const resetPage = () => { setCurrentPage(1); setSelectedIds(new Set()); };

  // Selecao helpers
  const pageIds = useMemo(() => clients.map((c: any) => c.id as string), [clients]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id: string) => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        pageIds.forEach((id: string) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        pageIds.forEach((id: string) => next.add(id));
        return next;
      });
    }
  };

  const toggleOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleExportSelected = () => {
    const rows = clients.filter((c: any) => selectedIds.has(c.id));
    const csv = [
      'Nome,Telefone,Status,Origem,LTV,Pedidos',
      ...rows.map((c: any) =>
        `"${c.name ?? ''}","${c.phone ?? ''}","${c.status ?? ''}","${c.source ?? ''}","${c.ltv ?? 0}","${c.total_orders ?? 0}"`
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `clientes-selecionados-${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-txt-primary">Clientes</h1>
          <p className="text-sm text-txt-secondary mt-1">{total.toLocaleString('pt-BR')} clientes no total</p>
        </div>
        <SentinelaButton />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-crm-primary/10 flex items-center justify-center shrink-0">
              <Users size={18} className="text-crm-primary" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Total</p>
              <p className="text-lg font-bold text-txt-primary">{total.toLocaleString('pt-BR')}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-yellow-500/10 flex items-center justify-center shrink-0">
              <TrendingUp size={18} className="text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">VIP</p>
              <p className="text-lg font-bold text-txt-primary">
                {clients.filter((c: any) => c.status === 'vip').length}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} className="text-red-500" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Em Risco</p>
              <p className="text-lg font-bold text-txt-primary">
                {clients.filter((c: any) => c.status === 'risco' || c.status === 'at_risk').length}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
              <MessageCircle size={18} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Via WhatsApp</p>
              <p className="text-lg font-bold text-txt-primary">
                {clients.filter((c: any) => c.source === 'whatsapp' || c.source === 'facilzap').length}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
              <FileUp size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Importados</p>
              <p className="text-lg font-bold text-txt-primary">
                {clients.filter((c: any) => c.source === 'import').length}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-50">
              <Input
                placeholder="Buscar por nome, telefone ou e-mail..."
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as ClientStatus | ''); resetPage(); }}
              className="input text-sm py-2 px-3"
            >
              <option value="">Todos os status</option>
              {Object.entries(STATUS_MAP).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <select
              value={hasOrdersFilter}
              onChange={(e) => { setHasOrdersFilter(e.target.value as typeof hasOrdersFilter); resetPage(); }}
              className="input text-sm py-2 px-3"
            >
              <option value="all"> Todos os pedidos</option>
              <option value="with_orders"> Com pedidos</option>
              <option value="without_orders"> Sem pedidos</option>
            </select>
            <select
              value={hasNameFilter}
              onChange={(e) => { setHasNameFilter(e.target.value as typeof hasNameFilter); resetPage(); }}
              className="input text-sm py-2 px-3"
            >
              <option value="all"> Todos</option>
              <option value="with_name"> Com nome</option>
              <option value="without_name"> Sem nome</option>
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => { setSourceFilter(e.target.value as typeof sourceFilter); resetPage(); }}
              className="input text-sm py-2 px-3"
            >
              <option value=""> Todas as origens</option>
              <option value="whatsapp"> WhatsApp</option>
              <option value="facilzap"> FacilZap</option>
              <option value="import"> Importado</option>
              <option value="manual"> Manual</option>
              <option value="campaign"> Campanha</option>
            </select>
            <select
              value={perPage}
              onChange={(e) => { setPerPage(Number(e.target.value)); resetPage(); }}
              className="input text-sm py-2 px-3"
            >
              {PER_PAGE_OPTIONS.map(n => (
                <option key={n} value={n}>{n} por página</option>
              ))}
            </select>
            <Button variant="ghost" onClick={handleExportSelected}>
              <Download size={16} /> Exportar
            </Button>
          </div>

          {/* Linha info + selecionar pagina */}
          <div className="flex items-center justify-between pt-1 border-t border-surface-100">
            <p className="text-xs text-txt-secondary">
              {total.toLocaleString('pt-BR')} resultados
              {selectedIds.size > 0 && (
                <span className="ml-2 font-semibold text-crm-primary">
                   {selectedIds.size} selecionados
                </span>
              )}
            </p>
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-xs font-medium text-crm-primary hover:text-crm-primary/80 transition-colors"
            >
              {allPageSelected
                ? <><CheckSquare size={14} className="inline" /> Desselecionar página</>
                : <><Square size={14} className="inline" /> Selecionar esta página ({pageIds.length})</>
              }
            </button>
          </div>
        </div>
      </Card>

      {/* Tabela */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200">
                <th className="px-4 py-3 w-8">
                  <button onClick={toggleSelectAll} className="flex items-center justify-center">
                    {allPageSelected
                      ? <CheckSquare size={16} className="text-crm-primary" />
                      : <Square size={16} className="text-txt-secondary" />
                    }
                  </button>
                </th>
                <th className="text-left text-xs font-medium text-txt-secondary px-4 py-3">Cliente</th>
                <th className="text-left text-xs font-medium text-txt-secondary px-4 py-3">Telefone</th>
                <th className="text-left text-xs font-medium text-txt-secondary px-4 py-3">Status</th>
                <th className="text-left text-xs font-medium text-txt-secondary px-4 py-3">Origem</th>
                <th className="text-right text-xs font-medium text-txt-secondary px-4 py-3">LTV</th>
                <th className="text-right text-xs font-medium text-txt-secondary px-4 py-3">Pedidos</th>
                <th className="text-right text-xs font-medium text-txt-secondary px-4 py-3">Última compra</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-surface-100">
                    <td className="px-4 py-3"><div className="h-4 w-4 bg-surface-200 rounded animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-surface-200 rounded w-32 animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-surface-200 rounded w-28 animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-surface-200 rounded w-16 animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-surface-200 rounded w-20 animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-surface-200 rounded w-20 animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-surface-200 rounded w-10 animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-surface-200 rounded w-24 animate-pulse" /></td>
                  </tr>
                ))
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-txt-secondary">
                    Nenhum cliente encontrado
                  </td>
                </tr>
              ) : (
                clients.map((client: any) => {
                  const isSelected = selectedIds.has(client.id);
                  const status = STATUS_MAP[client.status] || { label: client.status || 'Desconhecido', variant: 'neutral' as const };
                  const src = SOURCE_MAP[client.source as string] ?? SOURCE_MAP['whatsapp'];
                  const hasNoName = !client.name || client.name.trim() === '';
                  return (
                    <tr
                      key={client.id}
                      onClick={() => router.push(`/clientes/${client.id}`)}
                      className={`border-b border-surface-100 hover:bg-surface-50 cursor-pointer transition-colors ${isSelected ? 'bg-crm-primary/5' : ''}`}
                    >
                      <td className="px-4 py-3" onClick={(e) => toggleOne(client.id, e)}>
                        {isSelected
                          ? <CheckSquare size={16} className="text-crm-primary" />
                          : <Square size={16} className="text-surface-300 hover:text-txt-secondary transition-colors" />
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                            style={{ backgroundColor: getAvatarColor(client.id) }}
                          >
                            {hasNoName ? '?' : getInitials(client.name)}
                          </div>
                          <div>
                            {hasNoName
                              ? <p className="text-sm text-txt-secondary italic">Sem nome</p>
                              : <p className="text-sm font-medium text-txt-primary">{client.name}</p>
                            }
                            {client.email && <p className="text-xs text-txt-secondary">{client.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-txt-primary font-mono">{client.phone}</td>
                      <td className="px-4 py-3">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${src.color}`}>
                          {src.icon} {src.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-txt-primary">
                        {formatCurrency(Number(client.ltv) || 0)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-txt-primary">
                        {client.total_orders || client.total_pedidos || 0}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-txt-secondary">
                        {(client.last_order_at || client.ultima_compra)
                          ? formatRelativeTime(client.last_order_at || client.ultima_compra)
                          : ''}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginacao */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-200">
            <p className="text-xs text-txt-secondary">
              Pág. {currentPage}/{totalPages}  {((currentPage - 1) * perPage) + 1}{Math.min(currentPage * perPage, total)} de {total.toLocaleString('pt-BR')}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 7) {
                  pageNum = i + 1;
                } else if (currentPage <= 4) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 3) {
                  pageNum = totalPages - 6 + i;
                } else {
                  pageNum = currentPage - 3 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                      currentPage === pageNum
                        ? 'bg-crm-primary text-white'
                        : 'hover:bg-surface-100 text-txt-secondary'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
              <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-surface-200">
                <span className="text-xs text-txt-secondary">Ir para</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  defaultValue={currentPage}
                  onBlur={(e) => {
                    const p = parseInt(e.target.value);
                    if (p >= 1 && p <= totalPages) setCurrentPage(p);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const p = parseInt((e.target as HTMLInputElement).value);
                      if (p >= 1 && p <= totalPages) setCurrentPage(p);
                    }
                  }}
                  className="w-14 px-2 py-1 text-xs text-center border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-crm-primary/20"
                />
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Barra flutuante de selecao */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 bg-crm-primary text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-white/10">
            <div className="flex items-center gap-2 pr-3 border-r border-white/20">
              <CheckSquare size={16} className="text-white/80" />
              <span className="text-sm font-bold">{selectedIds.size}</span>
              <span className="text-xs text-white/70">selecionados</span>
            </div>
            {(() => {
              const sel = clients.filter((c: any) => selectedIds.has(c.id));
              const comNome = sel.filter((c: any) => c.name && c.name.trim() !== '').length;
              const semNome = sel.length - comNome;
              return (
                <div className="flex items-center gap-2 text-xs text-white/60 pr-3 border-r border-white/20">
                  {comNome > 0 && <span className="flex items-center gap-1"><UserCheck size={12} /> {comNome} c/ nome</span>}
                  {semNome > 0 && <span className="flex items-center gap-1"><UserX size={12} /> {semNome} s/ nome</span>}
                </div>
              );
            })()}
            <button
              onClick={() => {
                const phones = clients
                  .filter((c: any) => selectedIds.has(c.id))
                  .map((c: any) => c.phone)
                  .filter(Boolean)
                  .join(',');
                router.push(`/campanhas/nova?phones=${encodeURIComponent(phones)}&count=${selectedIds.size}`);
              }}
              className="flex items-center gap-1.5 text-sm font-semibold bg-white/15 hover:bg-white/25 transition-colors px-3 py-1.5 rounded-xl"
            >
              <Megaphone size={14} /> Enviar campanha
            </button>
            <button
              onClick={handleExportSelected}
              className="flex items-center gap-1.5 text-sm font-medium hover:bg-white/10 transition-colors px-3 py-1.5 rounded-xl"
            >
              <Download size={14} /> Exportar
            </button>
            <button
              onClick={clearSelection}
              className="p-1.5 hover:bg-white/10 rounded-xl transition-colors"
              title="Limpar selecao"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
