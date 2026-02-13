'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingBag,
  Download,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  Clock,
  CreditCard,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { formatCurrency, formatDate, debounce, displayOrderNumber } from '@/lib/utils';
import { useOrders } from '@/hooks/useOrders';
import { api } from '@/lib/api';
import type { OrderStatus } from '@/types';

const STATUS_MAP: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; icon: typeof Clock }> = {
  pending: { label: 'Pendente', variant: 'warning', icon: Clock },
  confirmed: { label: 'Pago', variant: 'success', icon: CheckCircle },
  processing: { label: 'Separando', variant: 'info', icon: Package },
  shipped: { label: 'Enviado', variant: 'info', icon: Truck },
  delivered: { label: 'Entregue', variant: 'success', icon: CheckCircle },
  cancelled: { label: 'Cancelado', variant: 'danger', icon: XCircle },
  refunded: { label: 'Reembolsado', variant: 'neutral', icon: CreditCard },
  paid: { label: 'Pago', variant: 'success', icon: CheckCircle },
};

const PAYMENT_STATUS_MAP: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' }> = {
  paid: { label: 'Pago', variant: 'success' },
  pending: { label: 'Pendente', variant: 'warning' },
  failed: { label: 'Falhou', variant: 'danger' },
  refunded: { label: 'Reembolsado', variant: 'warning' },
};

export default function PedidosPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 30;

  const { data, isLoading } = useOrders({
    search: search || undefined,
    status: statusFilter || undefined,
    page: currentPage,
    per_page: perPage,
  });

  const orders = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;

  // Stats gerais (não da página)
  const { data: stats } = useQuery({
    queryKey: ['orders-stats'],
    queryFn: async () => {
      const res = await api.get('/api/orders/stats');
      return res.data as { total_orders: number; total_paid: number; total_delivered: number; total_revenue: number };
    },
  });

  const handleSearch = debounce((value: string) => {
    setSearch(value);
    setCurrentPage(1);
  }, 300);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-txt-primary">Pedidos</h1>
          <p className="text-sm text-txt-secondary mt-1">
            {total} pedidos sincronizados via FacilZap
          </p>
        </div>
        <Button variant="ghost">
          <Download size={16} /> Exportar
        </Button>
      </div>

      {/* KPIs Gerais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-crm-primary/10 flex items-center justify-center">
              <ShoppingBag size={20} className="text-crm-primary" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Total Pedidos</p>
              <p className="text-lg font-bold text-txt-primary">{stats?.total_orders ?? total}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Pagos</p>
              <p className="text-lg font-bold text-txt-primary">
                {stats?.total_paid ?? 0}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Truck size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Entregues</p>
              <p className="text-lg font-bold text-txt-primary">
                {stats?.total_delivered ?? 0}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <CreditCard size={20} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Receita Total</p>
              <p className="text-lg font-bold text-txt-primary">
                {formatCurrency(stats?.total_revenue ?? 0)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <div className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-48">
            <Input
              placeholder="Buscar por nº pedido, cliente..."
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as OrderStatus | ''); setCurrentPage(1); }}
            className="input text-sm py-2 px-3"
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_MAP).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      </Card>

      {/* Tabela */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200">
                <th className="text-left text-xs font-medium text-txt-secondary px-4 py-3">Pedido</th>
                <th className="text-left text-xs font-medium text-txt-secondary px-4 py-3">Cliente</th>
                <th className="text-left text-xs font-medium text-txt-secondary px-4 py-3">Peças</th>
                <th className="text-left text-xs font-medium text-txt-secondary px-4 py-3">Status</th>
                <th className="text-left text-xs font-medium text-txt-secondary px-4 py-3">Pagamento</th>
                <th className="text-right text-xs font-medium text-txt-secondary px-4 py-3">Total</th>
                <th className="text-right text-xs font-medium text-txt-secondary px-4 py-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-surface-100">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-surface-200 rounded w-20 animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-txt-secondary">
                    <Package size={24} className="mx-auto mb-2" />
                    Nenhum pedido encontrado
                  </td>
                </tr>
              ) : (
                orders.map((order: any) => {
                  const config = STATUS_MAP[order.status] || { label: order.status || 'Desconhecido', variant: 'neutral' as const, icon: Clock };
                  const meta = typeof order.metadata === 'string'
                    ? (() => { try { return JSON.parse(order.metadata); } catch { return {}; } })()
                    : (order.metadata || {});
                  const clientName = order.clients?.name || meta.cliente_nome || '—';
                  const clientPhone = order.clients?.phone || meta.cliente_whatsapp || meta.cliente_telefone || '';
                  const totalItems = meta.total_items || 0;
                  const payStatus = PAYMENT_STATUS_MAP[order.payment_status] || { label: order.payment_status || '—', variant: 'warning' as const };
                  const payMethod = order.payment_method
                    ? (typeof order.payment_method === 'object' ? (order.payment_method.nome || order.payment_method.forma || '') : String(order.payment_method))
                    : '';

                  return (
                    <tr
                      key={order.id}
                      className="border-b border-surface-100 hover:bg-surface-50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/pedidos/${order.id}`)}
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-crm-primary">
                          #{displayOrderNumber(order.order_number, order.external_id)}
                        </span>
                        {meta.forma_entrega && (
                          <p className="text-[10px] text-txt-secondary mt-0.5">
                            {typeof meta.forma_entrega === 'object' ? meta.forma_entrega.nome || '' : meta.forma_entrega}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-txt-primary">{clientName}</p>
                          {clientPhone && <p className="text-xs text-txt-secondary">{clientPhone}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-txt-secondary">
                        {totalItems > 0 ? `${totalItems} ${totalItems === 1 ? 'peça' : 'peças'}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={config.variant}>{config.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={payStatus.variant}>{payStatus.label}</Badge>
                        {payMethod && <p className="text-[10px] text-txt-secondary mt-0.5">{payMethod}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-txt-primary">
                        {formatCurrency(Number(order.total) || 0)}
                        {(Number(order.discount) > 0 || Number(order.shipping) > 0) && (
                          <div className="text-[10px] text-txt-secondary">
                            {Number(order.discount) > 0 && <span>-{formatCurrency(order.discount)} desc</span>}
                            {Number(order.discount) > 0 && Number(order.shipping) > 0 && <span> · </span>}
                            {Number(order.shipping) > 0 && <span>+{formatCurrency(order.shipping)} frete</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-txt-secondary">
                        {formatDate(order.created_at)}
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
              Mostrando {((currentPage - 1) * perPage) + 1}–{Math.min(currentPage * perPage, total)} de {total} pedidos
            </p>
            <div className="flex items-center gap-1">
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
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
