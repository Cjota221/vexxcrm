'use client';

import { Package, Truck, CheckCircle, XCircle, Clock, CreditCard } from 'lucide-react';
import type { Order } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';

interface OrderHistoryProps {
  orders: Order[];
  isLoading?: boolean;
}

const STATUS_CONFIG: Record<Order['status'], { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; icon: typeof Package }> = {
  pending: { label: 'Pendente', variant: 'warning', icon: Clock },
  confirmed: { label: 'Confirmado', variant: 'info', icon: CheckCircle },
  shipped: { label: 'Enviado', variant: 'info', icon: Truck },
  delivered: { label: 'Entregue', variant: 'success', icon: CheckCircle },
  cancelled: { label: 'Cancelado', variant: 'danger', icon: XCircle },
  refunded: { label: 'Reembolsado', variant: 'neutral', icon: CreditCard },
};

export function OrderHistory({ orders, isLoading }: OrderHistoryProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-surface-50 rounded-lg p-3 animate-pulse">
            <div className="h-4 bg-surface-200 rounded w-2/3 mb-2" />
            <div className="h-3 bg-surface-200 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-6">
        <Package size={24} className="mx-auto text-txt-secondary mb-2" />
        <p className="text-sm text-txt-secondary">Nenhum pedido encontrado</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {orders.map((order) => {
        const config = STATUS_CONFIG[order.status];
        const Icon = config.icon;

        return (
          <div
            key={order.id}
            className="bg-surface-50 rounded-lg p-3 hover:bg-surface-100 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Icon size={14} className="text-txt-secondary" />
                <span className="text-xs font-medium text-txt-primary">
                  #{order.external_id || order.id.slice(0, 8)}
                </span>
              </div>
              <Badge variant={config.variant}>{config.label}</Badge>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-txt-secondary">
                {order.items.length} {order.items.length === 1 ? 'item' : 'itens'}
              </span>
              <span className="text-sm font-semibold text-crm-primary">
                {formatCurrency(order.total)}
              </span>
            </div>

            {order.tracking_code && (
              <p className="text-xs text-txt-secondary mt-1 flex items-center gap-1">
                <Truck size={10} /> {order.tracking_code}
              </p>
            )}

            <p className="text-xs text-txt-muted mt-1">
              {formatDate(order.created_at)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
