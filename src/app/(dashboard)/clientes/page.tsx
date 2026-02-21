'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Download,
  Users,
  TrendingUp,
  ShoppingBag,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  FileUp,
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
  novo: { label: 'Novo', variant: 'info' },
  ativo: { label: 'Ativo', variant: 'success' },
  active: { label: 'Ativo', variant: 'success' },
  vip: { label: 'VIP', variant: 'warning' },
  risco: { label: 'Em risco', variant: 'danger' },
  inativo: { label: 'Inativo', variant: 'neutral' },
  inactive: { label: 'Inativo', variant: 'neutral' },
  blocked: { label: 'Bloqueado', variant: 'danger' },
};

const SOURCE_MAP: Record<string, { label: string; icon: string; color: string }> = {
  whatsapp: { label: 'WhatsApp', icon: '💬', color: 'bg-green-50 text-green-700 border-green-100' },
  facilzap: { label: 'FacilZap', icon: '💬', color: 'bg-green-50 text-green-700 border-green-100' },
  import:   { label: 'Importado', icon: '📥', color: 'bg-blue-50 text-blue-700 border-blue-100' },
  manual:   { label: 'Manual', icon: '✏️', color: 'bg-gray-50 text-gray-600 border-gray-200' },
  campaign: { label: 'Campanha', icon: '📣', color: 'bg-purple-50 text-purple-700 border-purple-100' },
};

export default function ClientesPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ClientStatus | ''>('');
  const [hasOrdersFilter, setHasOrdersFilter] = useState<'all' | 'with_orders' | 'without_orders'>('all');
  const [sourceFilter, setSourceFilter] = useState<'whatsapp' | 'import' | 'manual' | 'campaign' | 'facilzap' | ''>('');
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 30;

  const { data, isLoading } = useClients({
    search: search || undefined,
    status: statusFilter || undefined,
    has_orders: hasOrdersFilter === 'all' ? undefined : hasOrdersFilter === 'with_orders',
    source: sourceFilter || undefined,
    page: currentPage,
    per_page: perPage,
  });

  const clients = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;

  const handleSearch = debounce((value: string) => {
    setSearch(value);
    setCurrentPage(1);
  }, 300);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-txt-primary">Clientes</h1>
          <p className="text-sm text-txt-secondary mt-1">{total} clientes sincronizados via FacilZap</p>
        </div>
        <SentinelaButton />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-crm-primary/10 flex items-center justify-center">
              <Users size={20} className="text-crm-primary" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Total</p>
              <p className="text-lg font-bold text-txt-primary">{total}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
              <TrendingUp size={20} className="text-yellow-600" />
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
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <AlertTriangle size={20} className="text-red-500" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Em Risco</p>
              <p className="text-lg font-bold text-txt-primary">
                {clients.filter((c: any) => c.status === 'risco').length}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <MessageCircle size={20} className="text-green-600" />
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
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <FileUp size={20} className="text-blue-600" />
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
              onChange={(e) => { setStatusFilter(e.target.value as ClientStatus | ''); setCurrentPage(1); }}
              className="input text-sm py-2 px-3 min-w-37.5"
            >
              <option value="">Todos os status</option>
              {Object.entries(STATUS_MAP).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <select
              value={hasOrdersFilter}
              onChange={(e) => { 
                setHasOrdersFilter(e.target.value as typeof hasOrdersFilter); 
                setCurrentPage(1); 
              }}
              className="input text-sm py-2 px-3 min-w-37.5"
            >
              <option value="all">📊 Todos</option>
              <option value="with_orders">✅ Com pedidos</option>
              <option value="without_orders">❌ Sem pedidos</option>
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => { setSourceFilter(e.target.value as typeof sourceFilter); setCurrentPage(1); }}
              className="input text-sm py-2 px-3 min-w-37.5"
            >
              <option value="">🌐 Todas as origens</option>
              <option value="whatsapp">💬 WhatsApp</option>
              <option value="facilzap">💬 FacilZap</option>
              <option value="import">📥 Importado</option>
              <option value="manual">✏️ Manual</option>
              <option value="campaign">📣 Campanha</option>
            </select>
            <Button variant="ghost">
              <Download size={16} /> Exportar
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabela de clientes */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200">
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
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-surface-100">
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
                  <td colSpan={7} className="text-center py-12 text-txt-secondary">
                    Nenhum cliente encontrado
                  </td>
                </tr>
              ) : (
                clients.map((client: any) => {
                  const status = STATUS_MAP[client.status] || { label: client.status || 'Desconhecido', variant: 'neutral' as const };
                  return (
                    <tr
                      key={client.id}
                      onClick={() => router.push(`/clientes/${client.id}`)}
                      className="border-b border-surface-100 hover:bg-surface-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                            style={{ backgroundColor: getAvatarColor(client.id) }}
                          >
                            {getInitials(client.name)}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-txt-primary">{client.name}</p>
                            {client.email && <p className="text-xs text-txt-secondary">{client.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-txt-primary">{client.phone}</td>
                      <td className="px-4 py-3">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const src = SOURCE_MAP[client.source as string] ?? SOURCE_MAP['whatsapp'];
                          return (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${src.color}`}>
                              {src.icon} {src.label}
                            </span>
                          );
                        })()}
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
                          : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-200">
            <p className="text-xs text-txt-secondary">
              Mostrando {((currentPage - 1) * perPage) + 1}–{Math.min(currentPage * perPage, total)} de {total} clientes
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
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

              <div className="flex items-center gap-2 ml-2 pl-2 border-l border-surface-200">
                <span className="text-xs text-txt-secondary whitespace-nowrap">
                  Página
                </span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={currentPage}
                  onChange={(e) => {
                    const page = parseInt(e.target.value);
                    if (page >= 1 && page <= totalPages) {
                      setCurrentPage(page);
                    }
                  }}
                  className="w-14 px-2 py-1 text-xs text-center border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-crm-primary/20"
                />
                <span className="text-xs text-txt-secondary whitespace-nowrap">
                  de {totalPages}
                </span>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
