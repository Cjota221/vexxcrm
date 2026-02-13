'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  Clock,
  CreditCard,
  User,
  Phone,
  Mail,
  MapPin,
  Hash,
  Calendar,
  ShoppingBag,
  Image as ImageIcon,
  Copy,
  ExternalLink,
  Check,
  Loader2,
  Save,
  X,
  Pencil,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { formatCurrency, formatDate, displayOrderNumber } from '@/lib/utils';
import { useUpdateTracking } from '@/hooks/useOrders';

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

export default function PedidoDetalhe() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;
  const [editingTracking, setEditingTracking] = useState(false);
  const [trackingInput, setTrackingInput] = useState('');
  const [trackingMessage, setTrackingMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copiedTracking, setCopiedTracking] = useState(false);

  const updateTracking = useUpdateTracking(orderId);

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const response = await api.get(`/api/orders/${orderId}`);
      return response.data as any;
    },
    enabled: !!orderId,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-surface-200 rounded w-48 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-surface-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-surface-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-20">
        <Package size={48} className="mx-auto text-txt-secondary mb-4" />
        <p className="text-txt-secondary">Pedido não encontrado</p>
        <Button variant="ghost" onClick={() => router.back()} className="mt-4">
          <ArrowLeft size={16} /> Voltar
        </Button>
      </div>
    );
  }

  const meta = typeof order.metadata === 'string'
    ? (() => { try { return JSON.parse(order.metadata); } catch { return {}; } })()
    : (order.metadata || {});

  const config = STATUS_MAP[order.status] || { label: order.status || 'Desconhecido', variant: 'neutral' as const, icon: Clock };
  const StatusIcon = config.icon;
  const items = meta.itens || [];
  const clientName = order.clients?.name || meta.cliente_nome || '—';
  const clientPhone = order.clients?.phone || meta.cliente_whatsapp || meta.cliente_telefone || '';
  const clientEmail = order.clients?.email || meta.cliente_email || '';
  const paymentMethod = order.payment_method
    ? (typeof order.payment_method === 'object' ? (order.payment_method.nome || order.payment_method.forma || '') : String(order.payment_method))
    : '';
  const formaEntrega = meta.forma_entrega
    ? (typeof meta.forma_entrega === 'object' ? (meta.forma_entrega.nome || '') : String(meta.forma_entrega))
    : '';
  const vendedor = meta.vendedor
    ? (typeof meta.vendedor === 'object' ? (meta.vendedor.nome || meta.vendedor.name || JSON.stringify(meta.vendedor)) : String(meta.vendedor))
    : '';
  const catalogo = meta.catalogo
    ? (typeof meta.catalogo === 'object' ? (meta.catalogo.nome || meta.catalogo.name || JSON.stringify(meta.catalogo)) : String(meta.catalogo))
    : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-surface-100 text-txt-secondary transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-txt-primary">
              Pedido #{displayOrderNumber(order.order_number, order.external_id)}
            </h1>
            <Badge variant={config.variant}>{config.label}</Badge>
            <Badge variant={order.payment_status === 'paid' ? 'success' : 'warning'}>
              {order.payment_status === 'paid' ? 'Pago' : 'Pgto Pendente'}
            </Badge>
          </div>
          <p className="text-sm text-txt-secondary mt-1">
            Criado em {formatDate(order.created_at)}
          </p>
        </div>
      </div>

      {/* Resumo financeiro */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <div className="p-4 text-center">
            <p className="text-xs text-txt-secondary">Subtotal</p>
            <p className="text-lg font-bold text-txt-primary">{formatCurrency(Number(order.subtotal) || 0)}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <p className="text-xs text-txt-secondary">Desconto</p>
            <p className="text-lg font-bold text-red-500">-{formatCurrency(Number(order.discount) || 0)}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <p className="text-xs text-txt-secondary">Frete</p>
            <p className="text-lg font-bold text-txt-primary">{formatCurrency(Number(order.shipping) || 0)}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <p className="text-xs text-txt-secondary">Total Itens</p>
            <p className="text-lg font-bold text-txt-primary">{meta.total_items || items.length || 0}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <p className="text-xs text-txt-secondary">Total</p>
            <p className="text-xl font-bold text-crm-primary">{formatCurrency(Number(order.total) || 0)}</p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Itens do pedido */}
          <Card>
            <CardHeader>
              <CardTitle><ShoppingBag size={16} /> Itens do Pedido ({items.length})</CardTitle>
            </CardHeader>
            <div className="p-4 pt-0">
              {items.length === 0 ? (
                <p className="text-sm text-txt-secondary text-center py-4">
                  Nenhum item detalhado disponível
                </p>
              ) : (
                <div className="space-y-3">
                  {items.map((item: any, idx: number) => {
                    const preco = Number(item.preco_unitario || item.valor) || 0;
                    const qty = Number(item.quantidade) || 1;
                    const variacaoStr = item.variacao
                      ? (typeof item.variacao === 'object' ? (item.variacao.nome || item.variacao.name || JSON.stringify(item.variacao)) : String(item.variacao))
                      : '';
                    return (
                      <div key={idx} className="flex items-start gap-4 p-3 bg-surface-50 rounded-xl">
                        {/* Imagem do produto */}
                        <div className="w-20 h-20 rounded-xl shrink-0 border border-surface-200 overflow-hidden bg-surface-200 flex items-center justify-center relative">
                          {item.imagem ? (
                            <img
                              src={item.imagem}
                              alt={item.nome || 'Produto'}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const img = e.target as HTMLImageElement;
                                img.style.display = 'none';
                                const parent = img.parentElement;
                                if (parent) {
                                  const fallback = parent.querySelector('.img-fallback');
                                  if (fallback) (fallback as HTMLElement).style.display = 'flex';
                                }
                              }}
                            />
                          ) : null}
                          <div className={`img-fallback absolute inset-0 items-center justify-center ${item.imagem ? 'hidden' : 'flex'}`}>
                            <ImageIcon size={24} className="text-txt-secondary" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-txt-primary">{item.nome || 'Sem nome'}</p>
                          {variacaoStr && (
                            <p className="text-xs text-txt-secondary mt-0.5">Variação: {variacaoStr}</p>
                          )}
                          {item.sku && (
                            <p className="text-[10px] text-txt-muted mt-0.5">SKU: {typeof item.sku === 'object' ? JSON.stringify(item.sku) : item.sku}</p>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            <p className="text-xs text-txt-secondary">
                              {qty}x {formatCurrency(preco)}
                            </p>
                            <p className="text-sm font-bold text-crm-primary">
                              {formatCurrency(qty * preco)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          {/* Status detalhados */}
          <Card>
            <CardHeader>
              <CardTitle><Clock size={16} /> Status Detalhados</CardTitle>
            </CardHeader>
            <div className="p-4 pt-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Pago', value: meta.status_pago },
                  { label: 'Em Separação', value: meta.status_em_separacao },
                  { label: 'Separado', value: meta.status_separado },
                  { label: 'Despachado', value: meta.status_despachado },
                  { label: 'Entregue', value: meta.status_entregue },
                ].map(({ label, value }) => {
                  const active = value === '1' || value === 1 || value === true || value === 'true';
                  return (
                    <div key={label} className={`p-2 rounded-lg text-center text-xs font-medium ${
                      active ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-surface-50 text-txt-secondary'
                    }`}>
                      {active ? '✓ ' : ''}{label}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Notas */}
          {order.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Observações</CardTitle>
              </CardHeader>
              <div className="p-4 pt-0">
                <p className="text-sm text-txt-secondary whitespace-pre-wrap">{order.notes}</p>
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Cliente */}
          <Card>
            <CardHeader>
              <CardTitle><User size={16} /> Cliente</CardTitle>
            </CardHeader>
            <div className="p-4 pt-0 space-y-2">
              <p className="text-sm font-medium text-txt-primary">{clientName}</p>
              {clientPhone && (
                <p className="text-xs text-txt-secondary flex items-center gap-1">
                  <Phone size={12} /> {clientPhone}
                </p>
              )}
              {clientEmail && (
                <p className="text-xs text-txt-secondary flex items-center gap-1">
                  <Mail size={12} /> {clientEmail}
                </p>
              )}
              {meta.cliente_cpf_cnpj && (
                <p className="text-xs text-txt-secondary flex items-center gap-1">
                  <Hash size={12} /> {meta.cliente_cpf_cnpj}
                </p>
              )}
              {order.clients?.id && (
                <Button
                  variant="ghost"
                  onClick={() => router.push(`/clientes/${order.clients.id}`)}
                  className="mt-2 text-xs"
                >
                  Ver perfil do cliente →
                </Button>
              )}
            </div>
          </Card>

          {/* Pagamento */}
          <Card>
            <CardHeader>
              <CardTitle><CreditCard size={16} /> Pagamento</CardTitle>
            </CardHeader>
            <div className="p-4 pt-0 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-txt-secondary">Status</span>
                <Badge variant={order.payment_status === 'paid' ? 'success' : 'warning'}>
                  {order.payment_status === 'paid' ? 'Pago' : 'Pendente'}
                </Badge>
              </div>
              {paymentMethod && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-txt-secondary">Método</span>
                  <span className="text-sm text-txt-primary">{paymentMethod}</span>
                </div>
              )}
              {order.coupon_code && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-txt-secondary">Cupom</span>
                  <span className="text-sm text-crm-primary font-medium">{typeof order.coupon_code === 'object' ? JSON.stringify(order.coupon_code) : order.coupon_code}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Entrega & Rastreio */}
          <Card>
            <CardHeader>
              <CardTitle><Truck size={16} /> Entrega & Rastreio</CardTitle>
            </CardHeader>
            <div className="p-4 pt-0 space-y-3">
              {formaEntrega && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-txt-secondary">Forma de Entrega</span>
                  <span className="text-sm text-txt-primary">{formaEntrega}</span>
                </div>
              )}

              {/* Código de Rastreio */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-txt-secondary">Código de Rastreio</span>
                  {!editingTracking && (
                    <button
                      onClick={() => {
                        setTrackingInput(order.tracking_code || meta.codigo_rastreio || '');
                        setEditingTracking(true);
                        setTrackingMessage(null);
                      }}
                      className="text-xs text-crm-primary hover:underline flex items-center gap-1"
                    >
                      <Pencil size={10} /> {order.tracking_code || meta.codigo_rastreio ? 'Editar' : 'Adicionar'}
                    </button>
                  )}
                </div>

                {editingTracking ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={trackingInput}
                        onChange={(e) => setTrackingInput(e.target.value)}
                        placeholder="Ex: BR123456789BR"
                        className="text-sm flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const code = trackingInput.trim() || null;
                            updateTracking.mutate(code, {
                              onSuccess: (data) => {
                                setEditingTracking(false);
                                setTrackingMessage({
                                  text: data.message,
                                  type: 'success',
                                });
                                setTimeout(() => setTrackingMessage(null), 5000);
                              },
                              onError: (err) => {
                                setTrackingMessage({
                                  text: err.message || 'Erro ao salvar',
                                  type: 'error',
                                });
                              },
                            });
                          }
                          if (e.key === 'Escape') {
                            setEditingTracking(false);
                          }
                        }}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          const code = trackingInput.trim() || null;
                          updateTracking.mutate(code, {
                            onSuccess: (data) => {
                              setEditingTracking(false);
                              setTrackingMessage({
                                text: data.message,
                                type: 'success',
                              });
                              setTimeout(() => setTrackingMessage(null), 5000);
                            },
                            onError: (err) => {
                              setTrackingMessage({
                                text: err.message || 'Erro ao salvar',
                                type: 'error',
                              });
                            },
                          });
                        }}
                        disabled={updateTracking.isPending}
                        className="flex-1"
                      >
                        {updateTracking.isPending ? (
                          <><Loader2 size={12} className="animate-spin" /> Salvando...</>
                        ) : (
                          <><Save size={12} /> Salvar</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingTracking(false)}
                        disabled={updateTracking.isPending}
                      >
                        <X size={12} /> Cancelar
                      </Button>
                    </div>
                    <p className="text-[10px] text-txt-muted">
                      Será salvo no CRM e sincronizado com a FacilZap. Enter para salvar, Esc para cancelar.
                    </p>
                  </div>
                ) : (
                  <>
                    {(order.tracking_code || meta.codigo_rastreio) ? (
                      <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                        <Package size={14} className="text-blue-600 shrink-0" />
                        <span className="text-sm font-mono font-medium text-blue-800 flex-1">
                          {order.tracking_code || meta.codigo_rastreio}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(order.tracking_code || meta.codigo_rastreio || '');
                            setCopiedTracking(true);
                            setTimeout(() => setCopiedTracking(false), 2000);
                          }}
                          className="p-1 hover:bg-blue-100 rounded transition-colors"
                          title="Copiar código"
                        >
                          {copiedTracking ? (
                            <Check size={14} className="text-green-600" />
                          ) : (
                            <Copy size={14} className="text-blue-600" />
                          )}
                        </button>
                        <a
                          href={`https://www.google.com/search?q=${encodeURIComponent(order.tracking_code || meta.codigo_rastreio || '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 hover:bg-blue-100 rounded transition-colors"
                          title="Rastrear"
                        >
                          <ExternalLink size={14} className="text-blue-600" />
                        </a>
                      </div>
                    ) : (
                      <p className="text-xs text-txt-muted italic">Nenhum código de rastreio cadastrado</p>
                    )}
                  </>
                )}

                {/* Mensagem de feedback */}
                {trackingMessage && (
                  <div className={`text-xs p-2 rounded-lg ${
                    trackingMessage.type === 'success'
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    {trackingMessage.type === 'success' ? '✓' : '✗'} {trackingMessage.text}
                  </div>
                )}
              </div>

              {/* Info extra de frete */}
              {meta.info_extra_frete && typeof meta.info_extra_frete === 'object' && (
                <>
                  {meta.info_extra_frete.transportadora && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-txt-secondary">Transportadora</span>
                      <span className="text-sm text-txt-primary">{meta.info_extra_frete.transportadora}</span>
                    </div>
                  )}
                  {meta.info_extra_frete.servico && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-txt-secondary">Serviço</span>
                      <span className="text-sm text-txt-primary">{meta.info_extra_frete.servico}</span>
                    </div>
                  )}
                  {meta.info_extra_frete.prazo_entrega && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-txt-secondary">Prazo</span>
                      <span className="text-sm text-txt-primary">{meta.info_extra_frete.prazo_entrega}</span>
                    </div>
                  )}
                </>
              )}
              {meta.prazo_frete && !meta.info_extra_frete?.prazo_entrega && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-txt-secondary">Prazo Frete</span>
                  <span className="text-sm text-txt-primary">{meta.prazo_frete}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Extras */}
          {(vendedor || catalogo) && (
            <Card>
              <CardHeader>
                <CardTitle>Detalhes</CardTitle>
              </CardHeader>
              <div className="p-4 pt-0 space-y-2">
                {vendedor && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-txt-secondary">Vendedor</span>
                    <span className="text-sm text-txt-primary">{vendedor}</span>
                  </div>
                )}
                {catalogo && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-txt-secondary">Catálogo</span>
                    <span className="text-sm text-txt-primary">{catalogo}</span>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
