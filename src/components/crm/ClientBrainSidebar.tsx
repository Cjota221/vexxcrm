'use client';

/**
 * ClientBrainSidebar — "Cérebro do Cliente" v4
 *
 * Sidebar direita 320px com 4 abas:
 *  [🪪 Identidade]   [📦 Pedidos FacilZap]   [🚚 Rastreio]   [🧠 Anne]
 *
 * Design: fundo branco (#FFFFFF) com cards cinza claros (#F7F8FA)
 * para contrastar com o chat escuro ao centro.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  User,
  ShoppingBag,
  Truck,
  Brain,
  RefreshCw,
  Loader2,
  Phone,
  Mail,
  Calendar,
  TrendingUp,
  Star,
  MapPin,
  ExternalLink,
  Check,
  Pencil,
  Plus,
  Trash2,
  StickyNote,
  Crown,
  Zap,
  Target,
  AlertTriangle,
  XCircle,
  Package,
  Clock,
  CheckCircle2,
  Copy,
  Activity,
  BarChart3,
  Tag,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useChatsStore } from '@/store/chats';
import { useUIStore } from '@/store/ui';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import {
  formatCurrency,
  formatDate,
  formatRelativeTime,
  getInitials,
  getAvatarColor,
  cn,
} from '@/lib/utils';
import type { Order } from '@/types';

/* ─── Abas disponíveis ───────────────────────────────────────── */

type BrainTab = 'identity' | 'orders' | 'tracking' | 'anne';

const TABS: {
  key: BrainTab;
  label: string;
  shortLabel: string;
  icon: typeof User;
}[] = [
  { key: 'identity', label: 'Identidade', shortLabel: 'ID', icon: User },
  { key: 'orders', label: 'Pedidos', shortLabel: 'Pedidos', icon: ShoppingBag },
  { key: 'tracking', label: 'Rastreio', shortLabel: 'Rastreio', icon: Truck },
  { key: 'anne', label: 'Insights Anne', shortLabel: 'Anne', icon: Brain },
];

const STATUS_MAP: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }
> = {
  novo: { label: 'Novo', variant: 'info' },
  ativo: { label: 'Ativo', variant: 'success' },
  active: { label: 'Ativo', variant: 'success' },
  vip: { label: 'VIP', variant: 'warning' },
  risco: { label: 'Em risco', variant: 'danger' },
  inativo: { label: 'Inativo', variant: 'neutral' },
  inactive: { label: 'Inativo', variant: 'neutral' },
  blocked: { label: 'Bloqueado', variant: 'danger' },
};

const HEALTH_CONFIG: Record<
  string,
  { icon: typeof Crown; color: string; bg: string; label: string }
> = {
  VIP:          { icon: Crown,         color: 'text-amber-600',   bg: 'bg-amber-50',   label: 'VIP' },
  Ativo:        { icon: Zap,           color: 'text-green-600',   bg: 'bg-green-50',   label: 'Ativo' },
  Oportunidade: { icon: Target,        color: 'text-blue-600',    bg: 'bg-blue-50',    label: 'Oportunidade' },
  Risco:        { icon: AlertTriangle, color: 'text-orange-600',  bg: 'bg-orange-50',  label: 'Em Risco' },
  Perdido:      { icon: XCircle,       color: 'text-red-500',     bg: 'bg-red-50',     label: 'Perdido' },
};

/* ─── Props ─────────────────────────────────────────────────── */

interface ClientBrainSidebarProps {
  onClose: () => void;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ABA 1 — IDENTIDADE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function IdentityTab({
  client,
  orders,
  clientId,
  onRefresh,
}: {
  client: Record<string, unknown>;
  orders: Order[];
  clientId: string;
  onRefresh: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const c = client as Record<string, unknown> & { name?: string };
  const status = STATUS_MAP[(c.status as string) ?? ''] ?? { label: 'Ativo', variant: 'success' as const };
  const isVirtual = c.is_virtual === true;

  // Saúde do cliente
  const cf = (c.custom_fields && typeof c.custom_fields === 'object')
    ? c.custom_fields as Record<string, unknown>
    : {};
  const healthLevel = (cf.health_classification as string) ?? null;
  const healthScore = (cf.health_score as number) ?? null;
  const healthConfig = healthLevel ? HEALTH_CONFIG[healthLevel] : null;

  const startEdit = () => {
    setNameInput((c.name as string) ?? '');
    setEditingName(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const saveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === c.name) { setEditingName(false); return; }
    setSaving(true);
    try {
      await api.patch(`/api/clients/${clientId}`, { name: trimmed });
      onRefresh();
      setEditingName(false);
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  // Extrair endereço do cliente ou do último pedido
  const address = useMemo(() => {
    if ((c as Record<string, unknown>).address_city || (c as Record<string, unknown>).address_state) {
      return {
        street: (c as Record<string, unknown>).address_street as string,
        number: (c as Record<string, unknown>).address_number as string,
        neighborhood: (c as Record<string, unknown>).address_neighborhood as string,
        city: (c as Record<string, unknown>).address_city as string,
        state: (c as Record<string, unknown>).address_state as string,
        zip: (c as Record<string, unknown>).address_zip as string,
        fromOrder: false,
      };
    }
    for (const order of orders) {
      const raw = (order as unknown as Record<string, unknown>).metadata;
      const meta = typeof raw === 'string'
        ? (() => { try { return JSON.parse(raw); } catch { return {}; } })()
        : (raw ?? {});
      const addr = (meta as Record<string, unknown>).endereco || (meta as Record<string, unknown>).address || (meta as Record<string, unknown>).shipping_address;
      if (addr && typeof addr === 'object') {
        const a = addr as Record<string, string>;
        if (a.cidade || a.city) {
          return {
            street: a.rua ?? a.logradouro ?? a.street ?? '',
            number: a.numero ?? a.number ?? '',
            neighborhood: a.bairro ?? a.neighborhood ?? '',
            city: a.cidade ?? a.city ?? '',
            state: a.uf ?? a.estado ?? a.state ?? '',
            zip: a.cep ?? a.zip ?? '',
            fromOrder: true,
          };
        }
      }
    }
    return null;
  }, [c, orders]);

  return (
    <div className="space-y-4 p-4">
      {/* Avatar + nome + status */}
      {isVirtual && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-amber-800">Contato sem cadastro</p>
            <p className="text-[10px] text-amber-600 mt-0.5">Sincronize o FacilZap para vincular.</p>
          </div>
        </div>
      )}

      <div className="flex items-start gap-3">
        {(c.avatar_url as string) ? (
          <img
            src={c.avatar_url as string}
            alt={c.name as string}
            className="w-14 h-14 rounded-2xl object-cover shrink-0 border-2 border-gray-100"
          />
        ) : (
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-lg shrink-0"
            style={{ backgroundColor: getAvatarColor((c.name as string) ?? '') }}
          >
            {getInitials((c.name as string) ?? '?')}
          </div>
        )}

        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input
                ref={inputRef}
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                className="flex-1 min-w-0 px-2 py-1 text-sm border border-crm-primary rounded-lg focus:outline-none"
                disabled={saving}
              />
              <button
                onClick={saveName}
                disabled={saving}
                className="p-1.5 rounded-lg bg-crm-primary text-white disabled:opacity-50"
              >
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              </button>
              <button onClick={() => setEditingName(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                <X size={11} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-sm font-bold text-gray-900 truncate">{(c.name as string) ?? 'Sem nome'}</h3>
              <button onClick={startEdit} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-crm-primary transition-colors" title="Editar nome">
                <Pencil size={11} />
              </button>
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <Badge variant={status.variant}>{status.label}</Badge>
            {isVirtual && <Badge variant="warning">Visitante</Badge>}
            {(c.name_manual as boolean) && (
              <span className="text-[9px] text-crm-primary font-semibold bg-crm-primary/10 px-1.5 py-0.5 rounded">✎ manual</span>
            )}
          </div>
        </div>
      </div>

      {/* Health Score */}
      {healthConfig && healthScore !== null && (
        <div className={cn('flex items-center gap-3 p-3 rounded-xl border', healthConfig.bg, 'border-transparent')}>
          {(() => {
            const HIcon = healthConfig.icon;
            return <HIcon size={18} className={healthConfig.color} />;
          })()}
          <div className="flex-1 min-w-0">
            <p className={cn('text-sm font-bold', healthConfig.color)}>{healthConfig.label}</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 bg-white rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full', healthConfig.color.replace('text-', 'bg-'))}
                  style={{ width: `${healthScore}%` }}
                />
              </div>
              <span className={cn('text-[10px] font-bold shrink-0', healthConfig.color)}>
                {healthScore}/100
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Métricas 3 cards */}
      <div className="grid grid-cols-3 gap-2">
        <MetricCard
          icon={<TrendingUp size={12} className="text-crm-primary" />}
          label="LTV"
          value={formatCurrency((c.ltv as number) ?? 0)}
          highlight
        />
        <MetricCard
          icon={<Star size={12} className="text-amber-500" />}
          label="Ticket"
          value={formatCurrency((c.avg_ticket as number) ?? (c.ticket_medio as number) ?? 0)}
        />
        <MetricCard
          icon={<ShoppingBag size={12} className="text-gray-500" />}
          label="Pedidos"
          value={String((c.total_orders as number) ?? orders.length ?? 0)}
        />
      </div>

      {/* Contatos */}
      <SectionBlock title="Contatos">
        <div className="space-y-1.5">
          {(c.phone as string) && (
            <ContactRow icon={<Phone size={12} />} value={(c.phone as string) ?? ''} copyable />
          )}
          {(c.email as string) && (
            <ContactRow icon={<Mail size={12} />} value={(c.email as string) ?? ''} copyable />
          )}
          {(c.cpf as string) && (
            <ContactRow icon={<User size={12} />} value={`CPF: ${c.cpf as string}`} />
          )}
        </div>
      </SectionBlock>

      {/* Datas */}
      <SectionBlock title="Histórico">
        <div className="space-y-1.5">
          {((c.last_order_at as string) ?? (c.ultima_compra as string)) && (
            <InfoRow icon={<Clock size={12} />} label="Última compra" value={formatRelativeTime((c.last_order_at as string) ?? (c.ultima_compra as string) ?? '')} />
          )}
          {(c.birthday as string) && (
            <InfoRow icon={<Calendar size={12} />} label="Aniversário" value={formatDate(c.birthday as string)} />
          )}
          <InfoRow icon={<Calendar size={12} />} label="Cliente desde" value={formatDate(c.created_at as string ?? '')} />
        </div>
      </SectionBlock>

      {/* Tags */}
      {Array.isArray(c.tags) && (c.tags as string[]).length > 0 && (
        <SectionBlock title="Tags">
          <div className="flex flex-wrap gap-1">
            {(c.tags as string[]).map(tag => (
              <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-crm-primary/8 text-crm-primary text-[10px] font-semibold rounded-full border border-crm-primary/20">
                <Tag size={9} />
                {tag}
              </span>
            ))}
          </div>
        </SectionBlock>
      )}

      {/* Endereço */}
      {address && (
        <SectionBlock title={`Endereço${address.fromOrder ? ' (do pedido)' : ''}`} icon={<MapPin size={12} />}>
          <div className="text-xs text-gray-600 space-y-0.5">
            {(address.street || address.number) && (
              <p>{[address.street, address.number].filter(Boolean).join(', ')}</p>
            )}
            {address.neighborhood && <p>{address.neighborhood}</p>}
            <p>{[address.city, address.state].filter(Boolean).join(' - ')}{address.zip ? ` · ${address.zip}` : ''}</p>
          </div>
        </SectionBlock>
      )}

      {/* Link perfil */}
      <a
        href={`/clientes/${clientId}`}
        className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl text-xs font-semibold text-crm-primary border border-crm-primary/30 hover:bg-crm-primary/5 transition-colors"
      >
        <ExternalLink size={12} />
        Ver perfil completo
      </a>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ABA 2 — PEDIDOS FACILZAP
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ORDER_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; icon: typeof Package }
> = {
  pending:    { label: 'Pendente',      color: 'text-amber-700',  bg: 'bg-amber-50',    icon: Clock },
  processing: { label: 'Em processo',   color: 'text-blue-700',   bg: 'bg-blue-50',     icon: Package },
  shipped:    { label: 'Enviado',       color: 'text-violet-700', bg: 'bg-violet-50',   icon: Truck },
  delivered:  { label: 'Entregue',      color: 'text-emerald-700',bg: 'bg-emerald-50',  icon: CheckCircle2 },
  cancelled:  { label: 'Cancelado',     color: 'text-red-700',    bg: 'bg-red-50',      icon: XCircle },
  completed:  { label: 'Concluído',     color: 'text-emerald-700',bg: 'bg-emerald-50',  icon: CheckCircle2 },
};

function OrdersTab({ orders, isLoading }: { orders: Order[]; isLoading: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-crm-primary" />
      </div>
    );
  }

  if (!orders.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
          <ShoppingBag size={20} className="text-gray-300" />
        </div>
        <p className="text-sm font-semibold text-gray-500">Sem pedidos</p>
        <p className="text-xs text-gray-400 mt-1">Nenhum pedido FacilZap sincronizado ainda.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2.5">
      {/* Resumo rápido */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <MetricCard
          icon={<ShoppingBag size={12} className="text-crm-primary" />}
          label="Total pedidos"
          value={String(orders.length)}
          highlight
        />
        <MetricCard
          icon={<TrendingUp size={12} className="text-emerald-600" />}
          label="Total gasto"
          value={formatCurrency(orders.reduce((s, o) => s + ((o as unknown as Record<string, unknown>).total as number ?? 0), 0))}
        />
      </div>

      {/* Lista de pedidos */}
      {orders.map(order => {
        const o = order as unknown as Record<string, unknown>;
        const status = (o.status as string) ?? 'pending';
        const cfg = ORDER_STATUS_CONFIG[status] ?? ORDER_STATUS_CONFIG.pending;
        const Icon = cfg.icon;
        const isExp = expanded === (o.id as string);

        return (
          <div
            key={o.id as string}
            className="border border-gray-100 rounded-xl overflow-hidden bg-white"
          >
            {/* Header do pedido */}
            <button
              onClick={() => setExpanded(isExp ? null : (o.id as string))}
              className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-gray-50 transition-colors"
            >
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', cfg.bg)}>
                <Icon size={14} className={cfg.color} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-800 truncate">
                    #{String(o.external_id ?? o.id).slice(-8).toUpperCase()}
                  </p>
                  <span className="text-xs font-bold text-gray-700 shrink-0">
                    {formatCurrency((o.total as number) ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className={cn('text-[10px] font-semibold', cfg.color)}>{cfg.label}</span>
                  <span className="text-[10px] text-gray-400">
                    {o.created_at ? formatRelativeTime(o.created_at as string) : ''}
                  </span>
                </div>
              </div>
              {isExp ? <ChevronDown size={13} className="text-gray-400 shrink-0" /> : <ChevronRight size={13} className="text-gray-400 shrink-0" />}
            </button>

            {/* Detalhes expandidos */}
            {isExp && (
              <div className="px-3 pb-3 border-t border-gray-100 bg-gray-50/50">
                {/* Itens */}
                {Array.isArray(o.items) && (o.items as Record<string, unknown>[]).length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {(o.items as Record<string, unknown>[]).slice(0, 5).map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700 truncate flex-1">
                          {String((item as Record<string, unknown>).product_name ?? (item as Record<string, unknown>).nome ?? 'Produto')}
                          {' '}
                          <span className="text-gray-400">
                            ×{String((item as Record<string, unknown>).quantity ?? 1)}
                          </span>
                        </span>
                        <span className="text-gray-600 font-semibold shrink-0 ml-2">
                          {formatCurrency((item as Record<string, unknown>).price as number ?? 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Código de rastreio */}
                {(o.tracking_code as string) && (
                  <div className="flex items-center gap-2 mt-2 p-2 bg-white rounded-lg border border-gray-100">
                    <Truck size={12} className="text-violet-500 shrink-0" />
                    <span className="text-xs font-mono text-gray-700 flex-1 truncate">{o.tracking_code as string}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(o.tracking_code as string)}
                      className="p-1 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                      title="Copiar rastreio"
                    >
                      <Copy size={11} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ABA 3 — RASTREIO AUTOMÁTICO
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function TrackingTab({ orders, isLoading }: { orders: Order[]; isLoading: boolean }) {
  const trackableOrders = orders.filter(o =>
    (o as unknown as Record<string, unknown>).tracking_code
  );

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-crm-primary" /></div>;
  }

  if (!trackableOrders.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
          <Truck size={20} className="text-gray-300" />
        </div>
        <p className="text-sm font-semibold text-gray-500">Sem rastreios</p>
        <p className="text-xs text-gray-400 mt-1">Nenhum pedido com código de rastreio encontrado.</p>
        <p className="text-xs text-gray-400 mt-0.5">Os códigos são sincronizados automaticamente do FacilZap.</p>
      </div>
    );
  }

  const TRACKING_STEPS = [
    'Pedido confirmado',
    'Em preparação',
    'Saiu para entrega',
    'Em trânsito',
    'Entregue',
  ];

  return (
    <div className="p-4 space-y-4">
      {trackableOrders.map(order => {
        const o = order as unknown as Record<string, unknown>;
        const status = (o.status as string) ?? 'pending';
        const stepMap: Record<string, number> = {
          pending: 0,
          processing: 1,
          shipped: 2,
          in_transit: 3,
          delivered: 4,
          completed: 4,
        };
        const currentStep = stepMap[status] ?? 0;

        return (
          <div key={o.id as string} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-800">
                  Pedido #{String(o.external_id ?? o.id).slice(-8).toUpperCase()}
                </p>
                <span className="text-xs text-gray-400">{formatCurrency((o.total as number) ?? 0)}</span>
              </div>
              {/* Código de rastreio */}
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] text-gray-400">Rastreio:</span>
                <span className="text-[10px] font-mono font-semibold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded">
                  {o.tracking_code as string}
                </span>
                <button
                  onClick={() => navigator.clipboard.writeText(o.tracking_code as string)}
                  className="p-0.5 rounded text-gray-400 hover:text-gray-600"
                >
                  <Copy size={10} />
                </button>
              </div>
            </div>

            {/* Steps */}
            <div className="px-4 py-4">
              <div className="relative">
                {/* Linha de progresso */}
                <div className="absolute top-3.5 left-3.5 w-[calc(100%-28px)] h-0.5 bg-gray-100">
                  <div
                    className="h-full bg-crm-primary transition-all duration-500"
                    style={{ width: `${(currentStep / (TRACKING_STEPS.length - 1)) * 100}%` }}
                  />
                </div>

                {/* Pontos dos steps */}
                <div className="relative flex justify-between">
                  {TRACKING_STEPS.map((step, i) => {
                    const isDone = i <= currentStep;
                    const isCurrent = i === currentStep;
                    return (
                      <div key={step} className="flex flex-col items-center gap-1.5" style={{ width: `${100 / TRACKING_STEPS.length}%` }}>
                        <div className={cn(
                          'w-7 h-7 rounded-full border-2 flex items-center justify-center z-10 transition-all',
                          isDone
                            ? 'border-crm-primary bg-crm-primary'
                            : 'border-gray-200 bg-white',
                          isCurrent && 'ring-2 ring-crm-primary/30'
                        )}>
                          {isDone
                            ? <Check size={12} className="text-white" />
                            : <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                          }
                        </div>
                        <p className={cn(
                          'text-[9px] text-center leading-tight',
                          isDone ? 'text-crm-primary font-semibold' : 'text-gray-400'
                        )}>
                          {step}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ABA 4 — INSIGHTS ANNE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function AnneInsightsTab({ chatId }: { chatId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['anne-chat-log', chatId],
    queryFn: async () => {
      const res = await api.get<{
        data: Array<{
          id: string;
          trigger: string;
          score: number;
          acao: string;
          resultado: string;
          escalona_para_humano: boolean;
          created_at: string;
        }>;
        stats: {
          gatilhos_24h: number;
          executados_24h: number;
          escalados_24h: number;
          taxa_automacao: string;
        };
      }>(`/api/v2/anne/log?chat_id=${chatId}&dias=7`);
      return res.data;
    },
    staleTime: 30_000,
    enabled: !!chatId,
  });

  const TRIGGER_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    primeiro_contato:   { label: 'Primeiro Contato', color: 'text-sky-700', bg: 'bg-sky-50' },
    pedido_recebido:    { label: 'Pedido Recebido', color: 'text-blue-700', bg: 'bg-blue-50' },
    pagamento_aprovado: { label: 'Pagamento Aprovado', color: 'text-emerald-700', bg: 'bg-emerald-50' },
    sinal_rejeicao:     { label: 'Sinal de Rejeição', color: 'text-red-700', bg: 'bg-red-50' },
    engajamento_alto:   { label: 'Engajamento Alto', color: 'text-violet-700', bg: 'bg-violet-50' },
    ghosting:           { label: 'Ghosting', color: 'text-gray-600', bg: 'bg-gray-100' },
  };

  const RESULTADO_CONFIG: Record<string, { label: string; color: string }> = {
    executado: { label: 'Executado', color: 'text-emerald-600' },
    sugerido:  { label: 'Sugerido', color: 'text-blue-600' },
    ignorado:  { label: 'Ignorado', color: 'text-gray-400' },
    escalado:  { label: 'Escalado', color: 'text-orange-600' },
  };

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-crm-primary" /></div>;
  }

  const logs = data?.data ?? [];
  const stats = data?.stats;

  return (
    <div className="p-4 space-y-4">
      {/* Stats grid */}
      {stats && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Últimas 24h</p>
          <div className="grid grid-cols-2 gap-2">
            <MetricCard icon={<Activity size={12} className="text-crm-primary" />} label="Gatilhos" value={String(stats.gatilhos_24h)} highlight />
            <MetricCard icon={<BarChart3 size={12} className="text-emerald-600" />} label="Taxa Auto." value={stats.taxa_automacao} />
            <MetricCard icon={<CheckCircle2 size={12} className="text-blue-500" />} label="Executados" value={String(stats.executados_24h)} />
            <MetricCard icon={<AlertTriangle size={12} className="text-orange-500" />} label="Escalados" value={String(stats.escalados_24h)} />
          </div>
        </div>
      )}

      {/* Log de gatilhos */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Histórico (7 dias)</p>
        {logs.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <Brain size={24} className="text-gray-200 mb-2" />
            <p className="text-xs text-gray-400">Nenhuma ação da Anne nesta conversa ainda.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map(log => {
              const trig = TRIGGER_LABELS[log.trigger] ?? { label: log.trigger, color: 'text-gray-600', bg: 'bg-gray-50' };
              const res = RESULTADO_CONFIG[log.resultado] ?? { label: log.resultado, color: 'text-gray-500' };
              return (
                <div key={log.id} className="bg-white border border-gray-100 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-md', trig.bg, trig.color)}>
                      {trig.label}
                    </span>
                    <span className={cn('text-[10px] font-semibold shrink-0', res.color)}>
                      {res.label}
                    </span>
                  </div>
                  {log.acao && (
                    <p className="text-xs text-gray-600 mt-1.5">{log.acao}</p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-crm-primary rounded-full"
                          style={{ width: `${Math.round(log.score * 100)}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-gray-400">{Math.round(log.score * 100)}% conf.</span>
                    </div>
                    {log.escalona_para_humano && (
                      <span className="text-[9px] font-semibold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                        👤 humano
                      </span>
                    )}
                    <span className="text-[9px] text-gray-400">{formatRelativeTime(log.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recomendações da saúde */}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   UTILITÁRIOS DE UI
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function MetricCard({
  icon, label, value, highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      'rounded-xl p-2.5 text-center border',
      highlight ? 'bg-crm-primary/5 border-crm-primary/20' : 'bg-gray-50 border-gray-100'
    )}>
      <div className="flex items-center justify-center gap-1 mb-0.5">
        {icon}
        <p className="text-[9px] text-gray-400 uppercase tracking-wide">{label}</p>
      </div>
      <p className={cn('text-sm font-black', highlight ? 'text-crm-primary' : 'text-gray-800')}>
        {value}
      </p>
    </div>
  );
}

function ContactRow({ icon, value, copyable }: { icon: React.ReactNode; value: string; copyable?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-600">
      <span className="text-gray-400 shrink-0">{icon}</span>
      <span className="flex-1 truncate">{value}</span>
      {copyable && (
        <button
          onClick={() => navigator.clipboard.writeText(value)}
          className="p-1 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
        >
          <Copy size={10} />
        </button>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-gray-400 shrink-0">{icon}</span>
      <span className="text-gray-400 shrink-0">{label}:</span>
      <span className="text-gray-700 font-medium truncate">{value}</span>
    </div>
  );
}

function SectionBlock({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {icon && <span className="text-gray-400">{icon}</span>}
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{title}</p>
      </div>
      {children}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   COMPONENTE PRINCIPAL — ClientBrainSidebar
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function ClientBrainSidebar({ onClose }: ClientBrainSidebarProps) {
  const { selectedChatId } = useChatsStore();
  const [activeTab, setActiveTab] = useState<BrainTab>('identity');
  const queryClient = useQueryClient();
  const prevChatRef = useRef<string | null>(null);

  // Resetar aba ao trocar de conversa
  useEffect(() => {
    if (selectedChatId && selectedChatId !== prevChatRef.current) {
      setActiveTab('identity');
      if (prevChatRef.current) {
        queryClient.removeQueries({ queryKey: ['brain-client', prevChatRef.current] });
      }
      prevChatRef.current = selectedChatId;
    }
  }, [selectedChatId, queryClient]);

  const {
    data: clientData,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['brain-client', selectedChatId],
    queryFn: async () => {
      if (!selectedChatId) return null;
      const res = await api.get(`/api/clients/${selectedChatId}`);
      if (res.error) throw new Error(res.error);
      const raw = res.data as Record<string, unknown>;
      return (raw?.data ?? raw) as Record<string, unknown>;
    },
    enabled: !!selectedChatId,
    staleTime: 30_000,
    refetchOnMount: 'always',
  });

  if (!selectedChatId) return null;

  const client = clientData as Record<string, unknown> | null;
  const orders: Order[] = (client?.recent_orders as Order[]) ?? [];

  return (
    <aside className="w-80 shrink-0 flex flex-col bg-white border-l border-gray-200 h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-crm-primary/10 flex items-center justify-center">
            <Brain size={14} className="text-crm-primary" />
          </div>
          <h3 className="text-sm font-bold text-gray-900">Cérebro do Cliente</h3>
          {isFetching && <Loader2 size={12} className="animate-spin text-crm-primary" />}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            title="Recarregar"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* ── Abas ── */}
      <div className="flex border-b border-gray-100 shrink-0 bg-gray-50/50">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-all border-b-2',
                isActive
                  ? 'text-crm-primary border-crm-primary bg-white'
                  : 'text-gray-400 border-transparent hover:text-gray-600 hover:bg-white'
              )}
            >
              <Icon size={14} />
              <span>{tab.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* ── Conteúdo ── */}
      <div className="flex-1 overflow-y-auto bg-surface-bg">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-crm-primary" />
          </div>
        ) : !client ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
              <User size={20} className="text-gray-300" />
            </div>
            <p className="text-sm text-gray-500 font-semibold">Cliente não encontrado</p>
            <p className="text-xs text-gray-400 mt-1">Sincronize os dados para vincular este contato.</p>
          </div>
        ) : (
          <>
            {activeTab === 'identity' && (
              <IdentityTab
                client={client}
                orders={orders}
                clientId={(client.id as string) ?? selectedChatId}
                onRefresh={() => {
                  queryClient.invalidateQueries({ queryKey: ['brain-client', selectedChatId] });
                  queryClient.invalidateQueries({ queryKey: ['chats'] });
                }}
              />
            )}
            {activeTab === 'orders' && (
              <OrdersTab orders={orders} isLoading={isLoading} />
            )}
            {activeTab === 'tracking' && (
              <TrackingTab orders={orders} isLoading={isLoading} />
            )}
            {activeTab === 'anne' && (
              <AnneInsightsTab chatId={selectedChatId} />
            )}
          </>
        )}
      </div>
    </aside>
  );
}
