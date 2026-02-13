'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Truck, CheckCircle, XCircle, Clock, CreditCard, ChevronDown, ChevronUp, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';

interface OrderHistoryProps {
  orders: any[];
  isLoading?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; icon: typeof Package }> = {
  pending: { label: 'Pendente', variant: 'warning', icon: Clock },
  confirmed: { label: 'Pago', variant: 'success', icon: CheckCircle },
  processing: { label: 'Separando', variant: 'info', icon: Package },
  shipped: { label: 'Enviado', variant: 'info', icon: Truck },
  delivered: { label: 'Entregue', variant: 'success', icon: CheckCircle },
  cancelled: { label: 'Cancelado', variant: 'danger', icon: XCircle },
  refunded: { label: 'Reembolsado', variant: 'neutral', icon: CreditCard },
  paid: { label: 'Pago', variant: 'success', icon: CheckCircle },
};

export function OrderHistory({ orders, isLoading }: OrderHistoryProps) {
  const router = useRouter();
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

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

  if (!orders || orders.length === 0) {
    return (
      <div className="text-center py-6">
        <Package size={24} className="mx-auto text-txt-secondary mb-2" />
        <p className="text-sm text-txt-secondary">Nenhum pedido encontrado</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {orders.map((order: any) => {
        const config = STATUS_CONFIG[order.status] || { label: order.status || 'Desconhecido', variant: 'neutral' as const, icon: Clock };
        const Icon = config.icon;
        const meta = typeof order.metadata === 'string'
          ? (() => { try { return JSON.parse(order.metadata); } catch { return {}; } })()
          : (order.metadata || {});
        const items: any[] = meta.itens || [];
        const totalItems = meta.total_items || items.reduce((sum: number, it: any) => sum + (Number(it.quantidade) || 1), 0) || 0;
        const paymentStatus = order.payment_status === 'paid' ? 'Pago' : 'Pendente';
        const paymentVariant = order.payment_status === 'paid' ? 'success' : 'warning';
        const isExpanded = expandedOrder === order.id;
        const payMethod = order.payment_method
          ? (typeof order.payment_method === 'object' ? (order.payment_method.nome || '') : String(order.payment_method))
          : '';

        return (
          <div
            key={order.id}
            className="bg-surface-50 rounded-lg overflow-hidden border border-transparent hover:border-surface-200 transition-all"
          >
            {/* Cabeçalho do pedido - clicável para expandir */}
            <div
              className="p-3 cursor-pointer"
              onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Icon size={14} className="text-txt-secondary" />
                  <span className="text-sm font-semibold text-crm-primary">
                    #{order.order_number || order.external_id || '—'}
                  </span>
                  <Badge variant={config.variant}>{config.label}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-crm-primary">
                    {formatCurrency(Number(order.total) || 0)}
                  </span>
                  {isExpanded ? <ChevronUp size={14} className="text-txt-secondary" /> : <ChevronDown size={14} className="text-txt-secondary" />}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-txt-secondary">
                <span>
                  {totalItems > 0 ? `${totalItems} ${totalItems === 1 ? 'peça' : 'peças'}` : '—'}
                  {payMethod ? ` · ${payMethod}` : ''}
                </span>
                <span className="flex items-center gap-1">
                  <span className={paymentVariant === 'success' ? 'text-green-600 font-medium' : 'text-yellow-600 font-medium'}>
                    {paymentStatus}
                  </span>
                  {' · '}
                  {formatDate(order.created_at)}
                </span>
              </div>
            </div>

            {/* Itens expandidos - mostra fotos, variação e preço */}
            {isExpanded && (
              <div className="border-t border-surface-200">
                {items.length > 0 ? (
                  <div className="p-3 space-y-2">
                    {items.map((item: any, idx: number) => {
                      const preco = Number(item.preco_unitario || item.valor) || 0;
                      const qty = Number(item.quantidade) || 1;
                      const variacaoStr = item.variacao
                        ? (typeof item.variacao === 'object' ? (item.variacao.nome || item.variacao.name || JSON.stringify(item.variacao)) : String(item.variacao))
                        : '';

                      return (
                        <div key={idx} className="flex items-center gap-3">
                          {item.imagem ? (
                            <img
                              src={item.imagem}
                              alt={item.nome || 'Produto'}
                              className="w-12 h-12 rounded-lg object-cover shrink-0"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-surface-200 flex items-center justify-center shrink-0">
                              <ImageIcon size={16} className="text-txt-secondary" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-txt-primary truncate">
                              {item.nome || 'Sem nome'}
                            </p>
                            {variacaoStr && (
                              <p className="text-[10px] text-txt-secondary truncate">{variacaoStr}</p>
                            )}
                            <p className="text-[10px] text-txt-secondary">
                              {qty}x {formatCurrency(preco)}
                            </p>
                          </div>
                          <p className="text-xs font-semibold text-txt-primary shrink-0">
                            {formatCurrency(qty * preco)}
                          </p>
                        </div>
                      );
                    })}

                    {/* Resumo financeiro */}
                    <div className="mt-2 pt-2 border-t border-surface-200 space-y-0.5">
                      {Number(order.discount) > 0 && (
                        <div className="flex justify-between text-[10px] text-txt-secondary">
                          <span>Desconto</span>
                          <span className="text-red-500">-{formatCurrency(Number(order.discount))}</span>
                        </div>
                      )}
                      {Number(order.shipping) > 0 && (
                        <div className="flex justify-between text-[10px] text-txt-secondary">
                          <span>Frete</span>
                          <span>+{formatCurrency(Number(order.shipping))}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 text-center">
                    <p className="text-xs text-txt-secondary">Detalhes dos itens não disponíveis</p>
                  </div>
                )}

                {/* Link para detalhe completo */}
                <div className="px-3 pb-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); router.push(`/pedidos/${order.id}`); }}
                    className="w-full text-center text-xs text-crm-primary hover:text-crm-primary/80 font-medium py-1.5 rounded-lg hover:bg-crm-primary/5 transition-colors flex items-center justify-center gap-1"
                  >
                    <ExternalLink size={12} /> Ver pedido completo
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
