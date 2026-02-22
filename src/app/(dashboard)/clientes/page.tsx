'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Download,
  Users,
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
  Zap,
  MapPin,
  Search,
  Loader2,
} from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { useClientStats } from '@/hooks/useClientStats';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SentinelaButton } from '@/components/crm/SentinelaButton';
import { api } from '@/lib/api';
import { formatCurrency, formatRelativeTime, getInitials, getAvatarColor, debounce } from '@/lib/utils';
import type { ClientStatus } from '@/types';

/* ─── Mapas de status e origem ────────────────────── */

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

/* ─── Tipos do painel lateral ─────────────────────── */

interface PanelFilter {
  type: 'source' | 'state';
  value: string;
  label: string;
  count: number;
}

interface PanelClient {
  id: string;
  name: string | null;
  phone: string;
  status: string;
  source: string;
  address_state: string | null;
  ltv: number;
  total_orders: number;
  last_order_at: string | null;
}

/* ─── Componente do painel lateral ─────────────────── */

function GroupPanel({
  filter,
  onClose,
}: {
  filter: PanelFilter;
  onClose: () => void;
}) {
  const router = useRouter();
  const [panelSearch, setPanelSearch] = useState('');
  const [panelPage, setPanelPage] = useState(1);
  const debouncedSearch = useRef(panelSearch);

  const handleSearch = useCallback(
    debounce((v: string) => {
      debouncedSearch.current = v;
      setPanelPage(1);
    }, 300),
    []
  );

  const { data, isLoading } = useQuery({
    queryKey: ['client-group', filter.type, filter.value, panelSearch, panelPage],
    queryFn: async () => {
      const params: Record<string, string> = {
        type: filter.type,
        value: filter.value,
        page: String(panelPage),
        per_page: '50',
      };
      if (panelSearch) params.search = panelSearch;
      const res = await api.get<{ data: PanelClient[]; total: number; total_pages: number }>(
        '/api/clients/group',
        params
      );
      if (res.error) throw new Error(res.error);
      const raw = res.data as any;
      if (raw && 'data' in raw) return raw;
      return { data: [], total: 0, total_pages: 1 };
    },
    staleTime: 60_000,
  });

  const clients: PanelClient[] = data?.data ?? [];
  const totalPages = data?.total_pages ?? 1;

  const handleExportCSV = () => {
    if (!clients.length) return;
    const csv = [
      'Nome,Telefone,Status,Origem',
      ...clients.map((c) =>
        `"${c.name ?? ''}","${c.phone ?? ''}","${c.status ?? ''}","${c.source ?? ''}"`
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes-${filter.value}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDisparo = () => {
    const phones = clients
      .map((c) => c.phone)
      .filter(Boolean)
      .join(',');
    router.push(`/disparo-rapido?phones=${encodeURIComponent(phones)}&count=${filter.count}`);
  };

  const labelType = filter.type === 'source' ? 'Origem' : 'Estado';
  const SOURCE_LABEL: Record<string, string> = {
    __all__:  'Todos os contatos',
    whatsapp: 'WhatsApp',
    facilzap: 'FacilZap',
    import: 'Importação',
    manual: 'Manual',
    campaign: 'Campanha',
  };
  const displayLabel =
    filter.type === 'source'
      ? SOURCE_LABEL[filter.value] ?? filter.value
      : `Estado — ${filter.value}`;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Painel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 bg-crm-primary flex items-center justify-between shrink-0">
          <div>
            <p className="text-[11px] text-white/60 uppercase tracking-wider font-medium">{labelType}</p>
            <h3 className="text-base font-bold text-white">{displayLabel}</h3>
            <p className="text-xs text-white/70">{filter.count.toLocaleString('pt-BR')} contatos</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-xl transition-colors"
          >
            <X size={18} className="text-white" />
          </button>
        </div>

        {/* Busca interna */}
        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-crm-primary/20"
              onChange={(e) => {
                setPanelSearch(e.target.value);
                handleSearch(e.target.value);
              }}
            />
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-crm-primary" />
            </div>
          ) : clients.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              Nenhum contato encontrado
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {clients.map((c) => {
                const hasNoName = !c.name || c.name.trim() === '';
                const status = STATUS_MAP[c.status] ?? { label: c.status || '—', variant: 'neutral' as const };
                const src = SOURCE_MAP[c.source] ?? SOURCE_MAP['whatsapp'];
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => { router.push(`/clientes/${c.id}`); onClose(); }}
                  >
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                      style={{ backgroundColor: getAvatarColor(c.id) }}
                    >
                      {hasNoName ? '?' : getInitials(c.name!)}
                    </div>
                    <div className="flex-1 min-w-0">
                      {hasNoName ? (
                        <p className="text-sm text-gray-400 italic">Sem nome</p>
                      ) : (
                        <p className="text-sm font-semibold text-gray-800 truncate">{c.name}</p>
                      )}
                      <p className="text-xs text-gray-400 font-mono">{c.phone}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <span className={`inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full border ${src.color}`}>
                        {src.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Paginação do painel */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-3 px-4 border-t border-gray-100">
              <button
                onClick={() => setPanelPage((p) => Math.max(1, p - 1))}
                disabled={panelPage === 1}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-gray-500">
                Pág. {panelPage}/{totalPages}
              </span>
              <button
                onClick={() => setPanelPage((p) => Math.min(totalPages, p + 1))}
                disabled={panelPage === totalPages}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Rodapé com ações */}
        <div className="px-4 py-3 border-t border-gray-100 flex gap-2 shrink-0">
          <button
            onClick={handleDisparo}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl bg-crm-primary text-white hover:bg-crm-primary/90 transition-colors"
          >
            <Megaphone size={14} /> Disparar para esse grupo
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Download size={14} /> CSV
          </button>
        </div>
      </div>
    </>
  );
}

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

  // Painel lateral
  const [activePanel, setActivePanel] = useState<PanelFilter | null>(null);

  // Selecao
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Stats (uma única query)
  const { data: stats, isLoading: statsLoading } = useClientStats();

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
      {/* Painel lateral */}
      {activePanel && (
        <GroupPanel filter={activePanel} onClose={() => setActivePanel(null)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-txt-primary">Clientes</h1>
          <p className="text-sm text-txt-secondary mt-1">{(stats?.total ?? total).toLocaleString('pt-BR')} clientes no total</p>
        </div>
        <SentinelaButton />
      </div>

      {/* ── Origem dos Contatos ──────────────────────────── */}
      <div>
        <h2 className="text-xs font-bold text-txt-secondary uppercase tracking-wider mb-3">
          Origem dos Contatos
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Card Total */}
          {(() => {
            const totalStats = stats?.total ?? 0;
            return (
              <button
                onClick={() => setActivePanel({ type: 'source', value: '__all__', label: 'Todos', count: totalStats })}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-left hover:shadow-md hover:border-crm-primary/30 transition-all group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-crm-primary/10 flex items-center justify-center">
                    <Users size={18} className="text-crm-primary" />
                  </div>
                  <span className="text-xs font-medium text-txt-secondary group-hover:text-crm-primary transition-colors">Total</span>
                </div>
                <p className="text-2xl font-black text-txt-primary">{statsLoading ? '—' : totalStats.toLocaleString('pt-BR')}</p>
                <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-crm-primary rounded-full w-full" />
                </div>
              </button>
            );
          })()}

          {/* Cards por source */}
          {[
            { key: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle size={18} className="text-green-600" />, bg: 'bg-green-500/10', bar: 'bg-green-500' },
            { key: 'facilzap', label: 'FacilZap',  icon: <Zap size={18} className="text-emerald-600" />,         bg: 'bg-emerald-500/10', bar: 'bg-emerald-500' },
            { key: 'import',   label: 'Importação', icon: <FileUp size={18} className="text-blue-600" />,         bg: 'bg-blue-500/10', bar: 'bg-blue-500' },
          ].map(({ key, label, icon, bg, bar }) => {
            const count = stats?.by_source.find((s) => s.source === key)?.count ?? 0;
            const pct = stats?.total ? (count / stats.total) * 100 : 0;
            return (
              <button
                key={key}
                onClick={() =>
                  setActivePanel({ type: 'source', value: key, label, count })
                }
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-left hover:shadow-md hover:border-crm-primary/30 transition-all group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center`}>{icon}</div>
                  <span className="text-xs font-medium text-txt-secondary group-hover:text-crm-primary transition-colors">{label}</span>
                </div>
                <p className="text-2xl font-black text-txt-primary">{statsLoading ? '—' : count.toLocaleString('pt-BR')}</p>
                <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${bar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-txt-secondary mt-1">{pct.toFixed(1)}% do total</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Distribuição por Estado ──────────────────────── */}
      {((stats?.by_state?.length ?? 0) > 0 || (stats?.sem_estado ?? 0) > 0) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-txt-secondary uppercase tracking-wider">
              Distribuição por Estado
            </h2>
            {(stats?.sem_estado ?? 0) > 0 && (
              <span className="flex items-center gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full">
                <MapPin size={10} />
                {(stats?.sem_estado ?? 0).toLocaleString('pt-BR')} sem estado cadastrado
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Ranking (lista) */}
            <Card>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin size={14} className="text-txt-secondary" />
                  <span className="text-xs font-semibold text-txt-secondary uppercase tracking-wide">Ranking</span>
                </div>
                <div className="space-y-2">
                  {(stats?.by_state ?? []).map(({ state, count }) => {
                    const pct = stats?.total ? (count / stats.total) * 100 : 0;
                    return (
                      <button
                        key={state}
                        onClick={() => setActivePanel({ type: 'state', value: state, label: state, count })}
                        className="w-full flex items-center gap-3 group hover:bg-surface-50 rounded-xl px-2 py-1.5 transition-colors"
                      >
                        <span className="text-xs font-bold text-txt-primary w-7 shrink-0 text-left">{state}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-crm-primary rounded-full transition-all group-hover:bg-crm-primary/80"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-txt-primary w-10 text-right shrink-0">
                          {count.toLocaleString('pt-BR')}
                        </span>
                      </button>
                    );
                  })}
                  {/* Linha "sem estado" */}
                  {(stats?.sem_estado ?? 0) > 0 && (
                    <div className="flex items-center gap-3 px-2 py-1.5 rounded-xl bg-amber-50/60 border border-dashed border-amber-200">
                      <span className="text-xs font-bold text-amber-600 w-7 shrink-0">—</span>
                      <div className="flex-1 h-2 bg-amber-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-300 rounded-full"
                          style={{ width: `${stats?.total ? ((stats.sem_estado / stats.total) * 100) : 0}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-amber-600 w-10 text-right shrink-0">
                        {(stats?.sem_estado ?? 0).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  )}
                </div>
                {(stats?.sem_estado ?? 0) > 0 && (
                  <p className="text-[10px] text-txt-secondary mt-3 leading-relaxed">
                    💡 Contatos vindos do WhatsApp geralmente não têm estado cadastrado. O estado só é preenchido quando o cliente informa ou vem de importação.
                  </p>
                )}
              </div>
            </Card>

            {/* Grid de cards de estado (top 12) */}
            <Card>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin size={14} className="text-txt-secondary" />
                  <span className="text-xs font-semibold text-txt-secondary uppercase tracking-wide">Top estados</span>
                </div>
                {(stats?.by_state?.length ?? 0) === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <MapPin size={28} className="text-gray-200 mb-2" />
                    <p className="text-xs text-txt-secondary">Nenhum cliente com estado cadastrado ainda.</p>
                    <p className="text-[10px] text-txt-secondary mt-1">Importe uma planilha com a coluna "Estado" para ver a distribuição aqui.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {(stats?.by_state ?? []).slice(0, 12).map(({ state, count }) => {
                      const maxCount = stats?.by_state[0]?.count ?? 1;
                      const intensity = Math.max(0.08, count / maxCount);
                      return (
                        <button
                          key={state}
                          onClick={() => setActivePanel({ type: 'state', value: state, label: state, count })}
                          className="flex flex-col items-center justify-center rounded-xl py-2.5 px-1 transition-all hover:scale-105 hover:shadow-md"
                          style={{ backgroundColor: `rgba(30, 58, 95, ${intensity})` }}
                          title={`${state}: ${count} clientes`}
                        >
                          <span
                            className="text-sm font-black"
                            style={{ color: intensity > 0.4 ? 'white' : '#1e3a5f' }}
                          >
                            {state}
                          </span>
                          <span
                            className="text-[10px] font-semibold mt-0.5"
                            style={{ color: intensity > 0.4 ? 'rgba(255,255,255,0.8)' : '#64748b' }}
                          >
                            {count.toLocaleString('pt-BR')}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

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
