'use client';

import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Phone,
  Mail,
  Calendar,
  Edit2,
  MessageSquare,
  ShoppingBag,
  Tag,
  TrendingUp,
  Star,
  MapPin,
  User,
  CreditCard,
  Truck,
  Package,
  Hash,
} from 'lucide-react';
import { useClient } from '@/hooks/useClients';
import { OrderHistory } from '@/components/crm/OrderHistory';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate, formatRelativeTime, getInitials, getAvatarColor } from '@/lib/utils';

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

export default function ClienteDetalhe() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;
  const { data: clientData, isLoading } = useClient(clientId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-surface-200 rounded w-48 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-surface-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-64 bg-surface-200 rounded-xl animate-pulse" />
          <div className="h-64 bg-surface-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!clientData) {
    return (
      <div className="text-center py-20">
        <User size={48} className="mx-auto text-txt-secondary mb-4" />
        <p className="text-txt-secondary">Cliente não encontrado</p>
        <Button variant="ghost" onClick={() => router.back()} className="mt-4">
          <ArrowLeft size={16} /> Voltar
        </Button>
      </div>
    );
  }

  // Dados do cliente (flexíveis para campos do DB vs TypeScript)
  const c = clientData as any;
  const orders = c.recent_orders || [];
  const custom = c.custom_fields || {};
  const status = STATUS_MAP[c.status] || { label: c.status || 'Ativo', variant: 'success' as const };

  // KPIs calculados dos pedidos reais
  const totalOrders = c.total_orders || c.total_pedidos || orders.length;
  const ltv = Number(c.ltv) || orders.reduce((sum: number, o: any) => sum + (Number(o.total) || 0), 0);
  const avgTicket = Number(c.avg_ticket) || Number(c.ticket_medio) || (totalOrders > 0 ? ltv / totalOrders : 0);
  const lastOrderAt = c.last_order_at || c.ultima_compra || (orders.length > 0 ? orders[0].created_at : null);

  // Análise de formas de pagamento (dos pedidos do metadata)
  const paymentMethods: Record<string, number> = {};
  const deliveryMethods: Record<string, number> = {};
  orders.forEach((o: any) => {
    const meta = typeof o.metadata === 'string' ? (() => { try { return JSON.parse(o.metadata); } catch { return {}; } })() : (o.metadata || {});
    const pm = o.payment_method
      ? (typeof o.payment_method === 'object' ? (o.payment_method.nome || o.payment_method.forma || '') : String(o.payment_method))
      : '';
    if (pm) paymentMethods[pm] = (paymentMethods[pm] || 0) + 1;
    const de = meta.forma_entrega
      ? (typeof meta.forma_entrega === 'object' ? (meta.forma_entrega.nome || '') : String(meta.forma_entrega))
      : '';
    if (de) deliveryMethods[de] = (deliveryMethods[de] || 0) + 1;
  });

  // Endereço formatado - tentar vários fontes
  const fullAddress = (() => {
    // 1. Campos diretos do banco (address_*)
    const addressParts = [c.address_street, c.address_number, c.address_complement, c.address_neighborhood, c.address_city, c.address_state, c.address_zip].filter(Boolean);
    if (addressParts.length > 0) return addressParts.join(', ');

    // 2. Tentar extrair de demais_dados (pode ser JSON ou texto)
    const dd = custom.demais_dados || c.demais_dados;
    if (dd) {
      if (typeof dd === 'string') {
        // Pode ser JSON
        try {
          const parsed = JSON.parse(dd);
          const ddParts = [parsed.endereco || parsed.rua || parsed.logradouro, parsed.numero, parsed.complemento, parsed.bairro, parsed.cidade, parsed.estado || parsed.uf, parsed.cep].filter(Boolean);
          if (ddParts.length > 0) return ddParts.join(', ');
        } catch {
          // Texto livre — se tiver algo útil (endereço, CEP etc.)
          if (dd.length > 5 && dd.length < 500) return dd;
        }
      } else if (typeof dd === 'object') {
        const ddParts = [dd.endereco || dd.rua || dd.logradouro, dd.numero, dd.complemento, dd.bairro, dd.cidade, dd.estado || dd.uf, dd.cep].filter(Boolean);
        if (ddParts.length > 0) return ddParts.join(', ');
      }
    }

    // 3. Endereço do metadata dos pedidos (último pedido)
    if (orders.length > 0) {
      for (const o of orders) {
        const meta = typeof o.metadata === 'string' ? (() => { try { return JSON.parse(o.metadata); } catch { return {}; } })() : (o.metadata || {});
        const addr = meta.endereco_entrega || meta.endereco;
        if (addr && typeof addr === 'string') return addr;
        if (addr && typeof addr === 'object') {
          const parts = [addr.logradouro || addr.rua || addr.endereco, addr.numero, addr.complemento, addr.bairro, addr.cidade, addr.estado || addr.uf, addr.cep].filter(Boolean);
          if (parts.length > 0) return parts.join(', ');
        }
      }
    }

    return null;
  })();

  // CPF/CNPJ, data nascimento
  const cpfCnpj = (() => { const v = custom.cpf_cnpj || c.cpf || null; return v && typeof v === 'object' ? JSON.stringify(v) : v; })();
  const dataNascimento = (() => { const v = custom.data_nascimento || c.birthday || null; return v && typeof v === 'object' ? JSON.stringify(v) : v; })();
  const origem = (() => { const v = custom.origem || c.source || c.origem || null; return v && typeof v === 'object' ? (v.nome || v.name || JSON.stringify(v)) : v; })();

  // Tags
  const tags = Array.isArray(c.tags) ? c.tags : [];

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
        <div className="flex items-center gap-3 flex-1">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
            style={{ backgroundColor: getAvatarColor(c.id) }}
          >
            {getInitials(c.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-txt-primary truncate">{c.name}</h1>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-txt-secondary">
              <span className="flex items-center gap-1"><Phone size={14} /> {c.phone}</span>
              {c.email && <span className="flex items-center gap-1"><Mail size={14} /> {c.email}</span>}
            </div>
          </div>
        </div>
        <Button variant="secondary">
          <Edit2 size={16} /> Editar
        </Button>
        <Button variant="primary">
          <MessageSquare size={16} /> Mensagem
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-crm-primary/10 flex items-center justify-center">
              <TrendingUp size={20} className="text-crm-primary" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">LTV</p>
              <p className="text-lg font-bold text-crm-primary">{formatCurrency(ltv)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
              <Star size={20} className="text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Ticket Médio</p>
              <p className="text-lg font-bold text-txt-primary">{formatCurrency(avgTicket)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <ShoppingBag size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Total Pedidos</p>
              <p className="text-lg font-bold text-txt-primary">{totalOrders}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Calendar size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Última Compra</p>
              <p className="text-lg font-bold text-txt-primary">
                {lastOrderAt ? formatRelativeTime(lastOrderAt) : '—'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna principal (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Dados Pessoais */}
          <Card>
            <CardHeader>
              <CardTitle><User size={16} /> Dados Pessoais</CardTitle>
            </CardHeader>
            <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-txt-secondary mb-1">Telefone</p>
                <p className="text-sm font-medium text-txt-primary flex items-center gap-1">
                  <Phone size={14} className="text-txt-secondary" /> {c.phone}
                </p>
              </div>
              {c.email && (
                <div>
                  <p className="text-xs text-txt-secondary mb-1">E-mail</p>
                  <p className="text-sm font-medium text-txt-primary flex items-center gap-1">
                    <Mail size={14} className="text-txt-secondary" /> {c.email}
                  </p>
                </div>
              )}
              {cpfCnpj && (
                <div>
                  <p className="text-xs text-txt-secondary mb-1">CPF/CNPJ</p>
                  <p className="text-sm font-medium text-txt-primary flex items-center gap-1">
                    <Hash size={14} className="text-txt-secondary" /> {cpfCnpj}
                  </p>
                </div>
              )}
              {dataNascimento && (
                <div>
                  <p className="text-xs text-txt-secondary mb-1">Data de Nascimento</p>
                  <p className="text-sm font-medium text-txt-primary flex items-center gap-1">
                    <Calendar size={14} className="text-txt-secondary" /> {dataNascimento}
                  </p>
                </div>
              )}
              {origem && (
                <div>
                  <p className="text-xs text-txt-secondary mb-1">Origem</p>
                  <p className="text-sm font-medium text-txt-primary">{origem}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-txt-secondary mb-1">Cliente desde</p>
                <p className="text-sm font-medium text-txt-primary flex items-center gap-1">
                  <Calendar size={14} className="text-txt-secondary" /> {formatDate(c.created_at)}
                </p>
              </div>
            </div>
          </Card>

          {/* Endereço */}
          {fullAddress && (
            <Card>
              <CardHeader>
                <CardTitle><MapPin size={16} /> Endereço</CardTitle>
              </CardHeader>
              <div className="p-4 pt-0">
                <p className="text-sm text-txt-primary">{fullAddress}</p>
              </div>
            </Card>
          )}

          {/* Histórico de Pedidos */}
          <Card>
            <CardHeader>
              <CardTitle>
                <ShoppingBag size={16} /> Histórico de Pedidos ({orders.length})
              </CardTitle>
            </CardHeader>
            <div className="p-4 pt-0">
              <OrderHistory orders={orders} />
            </div>
          </Card>

          {/* Notas */}
          {(c.notes || c.notas) && (
            <Card>
              <CardHeader>
                <CardTitle>Notas</CardTitle>
              </CardHeader>
              <div className="p-4 pt-0">
                <p className="text-sm text-txt-secondary whitespace-pre-wrap">
                  {typeof (c.notes || c.notas) === 'object' ? JSON.stringify(c.notes || c.notas) : (c.notes || c.notas)}
                </p>
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar (1/3) */}
        <div className="space-y-6">
          {/* Preferências de Pagamento */}
          {Object.keys(paymentMethods).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle><CreditCard size={16} /> Formas de Pagamento</CardTitle>
              </CardHeader>
              <div className="p-4 pt-0 space-y-2">
                {Object.entries(paymentMethods)
                  .sort(([, a], [, b]) => b - a)
                  .map(([method, count]) => (
                    <div key={method} className="flex items-center justify-between">
                      <span className="text-sm text-txt-primary">{method}</span>
                      <span className="text-xs text-txt-secondary bg-surface-100 px-2 py-0.5 rounded-full">
                        {count}x
                      </span>
                    </div>
                  ))}
              </div>
            </Card>
          )}

          {/* Preferências de Entrega */}
          {Object.keys(deliveryMethods).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle><Truck size={16} /> Formas de Entrega</CardTitle>
              </CardHeader>
              <div className="p-4 pt-0 space-y-2">
                {Object.entries(deliveryMethods)
                  .sort(([, a], [, b]) => b - a)
                  .map(([method, count]) => (
                    <div key={method} className="flex items-center justify-between">
                      <span className="text-sm text-txt-primary">{method}</span>
                      <span className="text-xs text-txt-secondary bg-surface-100 px-2 py-0.5 rounded-full">
                        {count}x
                      </span>
                    </div>
                  ))}
              </div>
            </Card>
          )}

          {/* Tags */}
          <Card>
            <CardHeader>
              <CardTitle><Tag size={16} /> Tags</CardTitle>
            </CardHeader>
            <div className="p-4 pt-0">
              {tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag: string) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 bg-crm-primary/10 text-crm-primary text-xs rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-txt-secondary">Nenhuma tag</p>
              )}
            </div>
          </Card>

          {/* Detalhes Extras (custom_fields) */}
          {custom.grupos && (
            <Card>
              <CardHeader>
                <CardTitle>Grupos</CardTitle>
              </CardHeader>
              <div className="p-4 pt-0">
                <p className="text-sm text-txt-primary">
                  {Array.isArray(custom.grupos)
                    ? custom.grupos.map((g: any) => typeof g === 'object' ? g.nome || JSON.stringify(g) : g).join(', ')
                    : String(custom.grupos)}
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
