'use client';

import { useState } from 'react';
import {
  ShoppingBag,
  Search,
  Download,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  Clock,
  CreditCard,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Order, OrderStatus } from '@/types';

const STATUS_MAP: Record<OrderStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; icon: typeof Clock }> = {
  pending: { label: 'Pendente', variant: 'warning', icon: Clock },
  confirmed: { label: 'Confirmado', variant: 'info', icon: CheckCircle },
  shipped: { label: 'Enviado', variant: 'info', icon: Truck },
  delivered: { label: 'Entregue', variant: 'success', icon: CheckCircle },
  cancelled: { label: 'Cancelado', variant: 'danger', icon: XCircle },
  refunded: { label: 'Reembolsado', variant: 'neutral', icon: CreditCard },
};

// TODO: hook useOrders
const mockOrders: Order[] = [];

export default function PedidosPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');

  const filtered = mockOrders.filter((o) => {
    if (statusFilter && o.status !== statusFilter) return false;
    if (search && !o.external_id?.includes(search) && !o.id.includes(search)) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-txt-primary">Pedidos</h1>
          <p className="text-sm text-txt-secondary mt-1">
            Histórico de pedidos sincronizados via FacilZap
          </p>
        </div>
        <Button variant="ghost">
          <Download size={16} /> Exportar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-crm-primary/10 flex items-center justify-center">
              <ShoppingBag size={20} className="text-crm-primary" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Total</p>
              <p className="text-lg font-bold text-txt-primary">{mockOrders.length}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
              <Clock size={20} className="text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Pendentes</p>
              <p className="text-lg font-bold text-txt-primary">
                {mockOrders.filter((o) => o.status === 'pending').length}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Entregues</p>
              <p className="text-lg font-bold text-txt-primary">
                {mockOrders.filter((o) => o.status === 'delivered').length}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <CreditCard size={20} className="text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Receita</p>
              <p className="text-lg font-bold text-txt-primary">
                {formatCurrency(mockOrders.reduce((acc, o) => acc + o.total, 0))}
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
              placeholder="Buscar pedido por ID..."
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OrderStatus | '')}
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
                <th className="text-left text-xs font-medium text-txt-secondary px-4 py-3">Itens</th>
                <th className="text-left text-xs font-medium text-txt-secondary px-4 py-3">Status</th>
                <th className="text-right text-xs font-medium text-txt-secondary px-4 py-3">Total</th>
                <th className="text-right text-xs font-medium text-txt-secondary px-4 py-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-txt-secondary">
                    <Package size={24} className="mx-auto mb-2" />
                    Nenhum pedido encontrado
                  </td>
                </tr>
              ) : (
                filtered.map((order) => {
                  const config = STATUS_MAP[order.status];
                  return (
                    <tr
                      key={order.id}
                      className="border-b border-surface-100 hover:bg-surface-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-txt-primary">
                          #{order.external_id || order.id.slice(0, 8)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-txt-secondary">
                        {order.items.length} {order.items.length === 1 ? 'item' : 'itens'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={config.variant}>{config.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-txt-primary">
                        {formatCurrency(order.total)}
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
      </Card>
    </div>
  );
}
