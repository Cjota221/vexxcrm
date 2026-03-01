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
  GitBranch,
  ArrowRight,
  Bot,
  UserCheck,
  MessageCircle,
  Info,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useChatsStore } from '@/store/chats';
import { useUIStore } from '@/store/ui';
import { useAuthStore } from '@/store/auth';
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
import type { Order, KanbanTransition, KanbanColumn } from '@/types';
import { AvatarImage } from '@/components/ui/AvatarImage';
import { MaskedField } from '@/lib/privacy';

/* ─── Abas disponíveis ───────────────────────────────────────── */

type BrainTab = 'identity' | 'orders' | 'tracking' | 'pipeline' | 'patterns' | 'anne';

const TABS: {
  key: BrainTab;
  label: string;
  shortLabel: string;
  icon: typeof User;
}[] = [
  { key: 'identity',  label: 'Identidade',    shortLabel: 'ID',       icon: User },
  { key: 'orders',    label: 'Pedidos',        shortLabel: 'Pedidos',  icon: ShoppingBag },
  { key: 'tracking',  label: 'Rastreio',       shortLabel: 'Rastreio', icon: Truck },
  { key: 'pipeline',  label: 'Pipeline',       shortLabel: 'Pipeline', icon: GitBranch },
  { key: 'patterns',  label: 'Padrões',        shortLabel: 'Padrões',  icon: BarChart3 },
  { key: 'anne',      label: 'Insights Anne',  shortLabel: 'Anne',     icon: Brain },
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
  chatId,
}: {
  client: Record<string, unknown>;
  orders: Order[];
  clientId: string;
  onRefresh: () => void;
  chatId?: string | null;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleOpenChat = () => {
    const name = (client.name as string) ?? '';
    window.dispatchEvent(
      new CustomEvent('vexx:open-chat', {
        detail: { chatId, suggestedText: `Olá ${name.split(' ')[0]}! ` },
      })
    );
  };

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

  // Sincronizar nameInput com o nome do cliente quando ele mudar (refetch, etc)
  useEffect(() => {
    if (!editingName) {
      setNameInput((c.name as string) ?? '');
    }
  }, [c.name, editingName]);

  const saveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === c.name) { setEditingName(false); return; }
    setSaving(true);
    try {
      // Optimistic update: já atualiza o estado local imediatamente
      // (o pai vai receber o novo client via refetch)
      await api.patch(`/api/clients/${clientId}`, { name: trimmed });
      // Depois sincroniza com o servidor
      onRefresh();
      setEditingName(false);
    } catch (err) {
      console.warn('[IdentityTab] Erro ao salvar nome:', err);
      // Em caso de erro, reverte para o nome anterior
      setNameInput((c.name as string) ?? '');
    }
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
        <AvatarImage
          src={c.avatar_url as string}
          name={(c.name as string) ?? '?'}
          size={56}
          rounded="2xl"
          className="border-2 border-gray-100"
        />

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

      {/* Contatos */}
      <SectionBlock title="Contatos">
        <div className="space-y-1.5">
          {(c.phone as string) && (
            <ContactRow
              icon={<Phone size={12} />}
              value={<MaskedField value={(c.phone as string) ?? ''} type="phone" copyable />}
            />
          )}
          {(c.email as string) && (
            <ContactRow
              icon={<Mail size={12} />}
              value={<MaskedField value={(c.email as string) ?? ''} type="email" copyable />}
            />
          )}
          {(c.cpf as string) && (
            <ContactRow
              icon={<User size={12} />}
              value={<MaskedField value={(c.cpf as string) ?? ''} type="cpf" copyable />}
            />
          )}
        </div>
      </SectionBlock>

      {/* Perfil Business WhatsApp */}
      <BusinessProfileSection phone={(c.phone as string) ?? ''} />

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

      {/* Botões de ação */}
      <div className="flex gap-2">
        {chatId && (
          <button
            onClick={handleOpenChat}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold text-white bg-crm-primary hover:bg-crm-primary/90 transition-colors"
          >
            <MessageCircle size={13} />
            Enviar Mensagem
          </button>
        )}
        <a
          href={`/clientes/${clientId}`}
          className={cn(
            'flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold',
            'text-crm-primary border border-crm-primary/30 hover:bg-crm-primary/5 transition-colors',
            chatId ? 'px-3' : 'flex-1'
          )}
        >
          <ExternalLink size={12} />
          {chatId ? 'Perfil' : 'Ver perfil completo'}
        </a>
      </div>
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
  confirmed:  { label: 'Confirmado',    color: 'text-blue-700',   bg: 'bg-blue-50',     icon: CheckCircle2 },
  processing: { label: 'Em processo',   color: 'text-blue-700',   bg: 'bg-blue-50',     icon: Package },
  shipped:    { label: 'Enviado',       color: 'text-violet-700', bg: 'bg-violet-50',   icon: Truck },
  in_transit: { label: 'Em trânsito',   color: 'text-violet-700', bg: 'bg-violet-50',   icon: Truck },
  delivered:  { label: 'Entregue',      color: 'text-emerald-700',bg: 'bg-emerald-50',  icon: CheckCircle2 },
  cancelled:  { label: 'Cancelado',     color: 'text-red-700',    bg: 'bg-red-50',      icon: XCircle },
  refunded:   { label: 'Reembolsado',   color: 'text-gray-700',   bg: 'bg-gray-50',     icon: XCircle },
  completed:  { label: 'Concluído',     color: 'text-emerald-700',bg: 'bg-emerald-50',  icon: CheckCircle2 },
};

function OrdersTab({ clientId, orders = [] }: { clientId: string; orders?: Order[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const isLoading = !orders || orders.length === 0;

  if (!orders || orders.length === 0) {
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
      {/* Aviso de sincronização */}
      <div className="flex items-start gap-2 p-2.5 bg-blue-50 rounded-lg border border-blue-200 text-[11px] text-blue-700">
        <Info size={12} className="shrink-0 mt-0.5" />
        <span>Pedidos atualizam a cada <strong>10 segundos</strong>. Clique 🔄 para atualizar agora.</span>
      </div>

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
              <div className="px-3 pb-3 border-t border-gray-100 bg-gray-50/50 space-y-2">
                {/* Itens do pedido */}
                {Array.isArray(o.items) && (o.items as Record<string, unknown>[]).length > 0 ? (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Itens</p>
                    {(o.items as Record<string, unknown>[]).map((item, i) => {
                      const nome = String(item.product_name ?? item.nome ?? item.name ?? 'Produto');
                      const qty = Number(item.quantity ?? item.quantidade ?? 1);
                      const unitPrice = Number(item.unit_price ?? item.price ?? item.preco_unitario ?? item.valor ?? 0);
                      const totalPrice = Number(item.total_price ?? item.valor ?? unitPrice * qty);
                      const variacaoRaw = String(item.variacao ?? item.variation ?? item.product_sku ?? '');
                      const numMatch = (nome + ' ' + variacaoRaw).match(/\b(3[3-9]|4[0-8]|[PpMmGg]{1,2}|[Pp]eq|[Mm]ed|[Gg]rand)\b/);
                      const numeracao = numMatch?.[0] ?? null;
                      const imageUrl = (item.image_url ?? item.imagem ?? null) as string | null;

                      return (
                        <div key={i} className="bg-white rounded-lg border border-gray-100 p-2 flex items-start gap-2.5">
                          {/* Foto do produto */}
                          <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-gray-100 flex items-center justify-center">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={nome}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <span className="text-[9px] text-gray-300">📦</span>
                            )}
                          </div>
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1">
                              <p className="text-[11px] text-gray-800 font-medium leading-tight line-clamp-2">{nome}</p>
                              <span className="text-[11px] font-bold text-gray-700 shrink-0 ml-1">{formatCurrency(totalPrice)}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-[9px] text-gray-400">Qtd: <span className="font-semibold text-gray-600">{qty}</span></span>
                              <span className="text-[9px] text-gray-400">Unit: <span className="font-semibold text-gray-600">{formatCurrency(unitPrice)}</span></span>
                              {numeracao && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-crm-primary/10 text-crm-primary rounded">
                                  Tam {numeracao}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-400 mt-2 italic">Nenhum item registrado neste pedido.</p>
                )}

                {/* Endereço de entrega */}
                {(o.shipping_address as Record<string, unknown>) && (() => {
                  const addr = o.shipping_address as Record<string, string>;
                  const linha = [addr.rua ?? addr.street, addr.numero ?? addr.number].filter(Boolean).join(', ');
                  const cidade = [addr.cidade ?? addr.city, addr.uf ?? addr.state].filter(Boolean).join(' - ');
                  if (!cidade) return null;
                  return (
                    <div className="flex items-start gap-1.5 pt-1 border-t border-gray-100 mt-1">
                      <MapPin size={10} className="text-gray-400 mt-0.5 shrink-0" />
                      <div className="text-[10px] text-gray-500 leading-tight">
                        {linha && <p>{linha}</p>}
                        <p>{cidade}{addr.cep ?? addr.zip ? ` · ${addr.cep ?? addr.zip}` : ''}</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Código de rastreio */}
                {(o.tracking_code as string) && (
                  <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-100">
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

function TrackingTab({ clientId, orders = [] }: { clientId: string; orders?: Order[] }) {
  const trackableOrders = orders.filter(o =>
    (o as unknown as Record<string, unknown>).tracking_code
  );

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
   ABA 4 — PIPELINE (histórico de movimentações kanban)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const KANBAN_COLUMN_CONFIG: Record<
  KanbanColumn,
  { label: string; color: string; bg: string; border: string }
> = {
  PRIMEIRO_CONTATO:    { label: 'Primeiro Contato',    color: 'text-sky-700',     bg: 'bg-sky-50',     border: 'border-sky-200' },
  EM_NEGOCIACAO:       { label: 'Em Negociação',        color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200' },
  AGUARDANDO_PAGAMENTO:{ label: 'Aguard. Pagamento',    color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200' },
  PAGO:                { label: 'Pago',                 color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  DESPACHADO:          { label: 'Despachado',           color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200' },
  CANCELADO:           { label: 'Cancelado',            color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200' },
  REATIVAR:            { label: 'Reativar',             color: 'text-orange-700',  bg: 'bg-orange-50',  border: 'border-orange-200' },
  CONCLUIDO:           { label: 'Concluído',            color: 'text-violet-700',  bg: 'bg-violet-50',  border: 'border-violet-200' },
};

function KanbanColumnBadge({ coluna }: { coluna: KanbanColumn | null }) {
  if (!coluna) return <span className="text-[10px] text-gray-400 italic">—</span>;
  const cfg = KANBAN_COLUMN_CONFIG[coluna] ?? { label: coluna, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' };
  return (
    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-md border', cfg.bg, cfg.color, cfg.border)}>
      {cfg.label}
    </span>
  );
}

function PipelineTab({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const [changingStage, setChangingStage] = useState(false);
  const [selectedStage, setSelectedStage] = useState<KanbanColumn | ''>('');
  const [moving, setMoving] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['kanban-pipeline', clientId],
    queryFn: async () => {
      const res = await api.get<{
        card: {
          coluna: KanbanColumn;
          chat_id: string;
          tags: string[];
          score_anne: number | null;
          tentativas_reativacao: number;
          updated_at: string;
        } | null;
        transitions: KanbanTransition[];
      }>(`/api/kanban/${clientId}`);
      return res.data;
    },
    enabled: !!clientId,
    staleTime: 15_000,
  });

  const handleMoveStage = async () => {
    if (!selectedStage || !data?.card) return;
    setMoving(true);
    try {
      await api.patch('/api/v2/kanban/move', {
        contato_id: clientId,
        chat_id: data.card.chat_id,
        de_coluna: data.card.coluna,
        para_coluna: selectedStage,
        motivo: 'Movido manualmente pelo atendente',
      });
      queryClient.invalidateQueries({ queryKey: ['kanban-pipeline', clientId] });
      queryClient.invalidateQueries({ queryKey: ['kanban-all-cards'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-summary'] });
      setChangingStage(false);
      setSelectedStage('');
    } catch {
      // silencioso
    } finally {
      setMoving(false);
    }
  };

  // Escutar SSE kanban_moved para refresh automático
  useEffect(() => {
    const handler = (e: Event) => {
      const evt = e as CustomEvent<{ client_id: string }>;
      if (evt.detail?.client_id === clientId) {
        queryClient.invalidateQueries({ queryKey: ['kanban-pipeline', clientId] });
      }
    };
    window.addEventListener('sse:kanban_moved', handler);
    return () => window.removeEventListener('sse:kanban_moved', handler);
  }, [clientId, queryClient]);

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-crm-primary" /></div>;
  }

  const card = data?.card ?? null;
  const transitions = data?.transitions ?? [];

  const PIPELINE_COLS: KanbanColumn[] = [
    'PRIMEIRO_CONTATO', 'EM_NEGOCIACAO', 'AGUARDANDO_PAGAMENTO', 'PAGO', 'DESPACHADO', 'CANCELADO', 'REATIVAR', 'CONCLUIDO',
  ];

  return (
    <div className="p-4 space-y-4">
      {/* Card atual + botão Mudar Etapa */}
      <div className={cn(
        'rounded-2xl border p-4',
        card ? 'bg-white border-gray-100' : 'bg-gray-50 border-gray-100'
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
            card ? 'bg-crm-primary/10' : 'bg-gray-100'
          )}>
            <GitBranch size={18} className={card ? 'text-crm-primary' : 'text-gray-300'} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Coluna atual</p>
            {card ? (
              <>
                <KanbanColumnBadge coluna={card.coluna} />
                <div className="flex items-center gap-2 mt-1.5">
                  {card.score_anne !== null && (
                    <div className="flex items-center gap-1">
                      <div className="w-12 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-crm-primary rounded-full"
                          style={{ width: `${Math.round((card.score_anne ?? 0) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-gray-400">{Math.round((card.score_anne ?? 0) * 100)}%</span>
                    </div>
                  )}
                  <span className="text-[9px] text-gray-400">
                    {formatRelativeTime(card.updated_at)}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-400 italic">Nenhum card de pipeline</p>
            )}
          </div>
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-lg text-gray-300 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
          >
            <RefreshCw size={12} />
          </button>
        </div>

        {/* Botão Mudar Etapa */}
        {card && !changingStage && (
          <button
            onClick={() => { setChangingStage(true); setSelectedStage(card.coluna); }}
            className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-crm-primary/30 text-crm-primary text-xs font-semibold hover:bg-crm-primary/5 transition-colors"
          >
            <ArrowRight size={12} />
            Mudar Etapa
          </button>
        )}

        {/* Seletor de etapa */}
        {changingStage && (
          <div className="mt-3 space-y-2">
            <select
              value={selectedStage}
              onChange={e => setSelectedStage(e.target.value as KanbanColumn)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-crm-primary/50 bg-white text-gray-800"
            >
              <option value="">Selecionar etapa...</option>
              {PIPELINE_COLS.map(col => (
                <option key={col} value={col}>
                  {KANBAN_COLUMN_CONFIG[col].label}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleMoveStage}
                disabled={!selectedStage || selectedStage === card?.coluna || moving}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-crm-primary text-white text-xs font-semibold hover:bg-crm-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {moving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                Confirmar
              </button>
              <button
                onClick={() => { setChangingStage(false); setSelectedStage(''); }}
                className="px-3 py-2 rounded-xl border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Histórico de movimentações */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
          Histórico de Pipeline
        </p>

        {transitions.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <GitBranch size={24} className="text-gray-200 mb-2" />
            <p className="text-xs text-gray-400">Nenhuma movimentação registrada.</p>
            <p className="text-[10px] text-gray-300 mt-0.5">As movimentações aparecem automaticamente.</p>
          </div>
        ) : (
          <div className="relative space-y-0">
            {/* Linha vertical */}
            <div className="absolute left-3.5 top-4 bottom-4 w-px bg-gray-100" />

            {transitions.map((t, i) => {
              const isAnne = t.autor === 'anne';
              return (
                <div key={t.id} className="relative flex gap-3 pb-3">
                  {/* Dot na timeline */}
                  <div className={cn(
                    'w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 z-10 bg-white',
                    isAnne
                      ? 'border-crm-primary/40'
                      : 'border-gray-300'
                  )}>
                    {isAnne
                      ? <Bot size={12} className="text-crm-primary" />
                      : <UserCheck size={12} className="text-gray-500" />
                    }
                  </div>

                  {/* Conteúdo */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <KanbanColumnBadge coluna={t.de_coluna as KanbanColumn | null} />
                      <ArrowRight size={10} className="text-gray-300 shrink-0" />
                      <KanbanColumnBadge coluna={t.para_coluna as KanbanColumn} />
                    </div>

                    {t.motivo && (
                      <p className="text-[10px] text-gray-500 mt-1 leading-relaxed line-clamp-2">{t.motivo}</p>
                    )}

                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={cn(
                        'text-[9px] font-semibold px-1.5 py-0.5 rounded',
                        isAnne ? 'text-crm-primary bg-crm-primary/8' : 'text-gray-500 bg-gray-100'
                      )}>
                        {isAnne ? '🤖 Anne' : '👤 Manual'}
                      </span>
                      <span className="text-[9px] text-gray-400">{formatRelativeTime(t.created_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ABA 5 — PADRÕES DE COMPRA
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface PatternsData {
  dia_ouro: { dia_semana: number; label: string; total_pedidos: number; total_gasto: number } | null;
  hora_ouro: { faixa_horario: string; label: string; total_pedidos: number } | null;
  logistica: { frete_medio: number; transportadora_mais_usada: string | null; total_fretes: number } | null;
  inventario: { numeracoes: string[]; categorias: string[]; top_produtos: Array<{ nome: string; quantidade: number; total: number }> };
  insights_anne: string[];
  ltv: number;
  ticket_medio: number;
  total_pedidos: number;
  dias_desde_ultima_compra: number | null;
  ciclo_recompra_medio: number | null;
  ltv_breakdown?: {
    paid:      { count: number; value: number };
    transit:   { count: number; value: number };
    cancelled: { count: number; value: number };
    total_all_orders: number;
  };
}

function PatternsTab({ clientId }: { clientId: string }) {
  const { data, isLoading, isError } = useQuery<PatternsData>({
    queryKey: ['client-patterns', clientId],
    queryFn: async () => {
      const res = await api.get<PatternsData>(`/api/clients/${clientId}/patterns`);
      return res.data;
    },
    staleTime: 5 * 60_000,
    enabled: !!clientId,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 size={24} className="animate-spin text-crm-primary" />
        <p className="text-xs text-gray-400">Calculando padrões de compra...</p>
      </div>
    );
  }

  // Cliente novo ou sem pedidos suficientes
  if (!isError && data && data.total_pedidos < 2) {
    return (
      <div className="flex flex-col items-center py-14 text-center px-6 gap-3">
        <div className="w-14 h-14 rounded-2xl bg-crm-primary/10 flex items-center justify-center">
          <BarChart3 size={22} className="text-crm-primary" />
        </div>
        <p className="text-sm font-bold text-gray-700">Perfil em construção</p>
        <p className="text-xs text-gray-400 leading-relaxed">
          Aguardando mais pedidos para análise. Com 2 ou mais pedidos a Anne identifica padrões de dia, hora e ciclo de recompra.
        </p>
        {data.total_pedidos === 1 && (
          <div className="bg-crm-primary/5 border border-crm-primary/20 rounded-xl p-3 w-full text-left">
            <p className="text-[10px] font-bold text-crm-primary mb-1">1 pedido registrado</p>
            <p className="text-[10px] text-gray-500">LTV: {formatCurrency(data.ltv)} · Ticket: {formatCurrency(data.ticket_medio)}</p>
          </div>
        )}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center py-12 text-center px-4 gap-2">
        <AlertTriangle size={24} className="text-orange-300" />
        <p className="text-xs font-semibold text-gray-600">Erro ao carregar padrões</p>
        <p className="text-[10px] text-gray-400">Verifique se os pedidos estão sincronizados com o FacilZap.</p>
      </div>
    );
  }

  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div className="p-4 space-y-4">

      {/* ── Métricas gerais ── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-crm-primary/5 border border-crm-primary/20 rounded-xl p-2.5 text-center">
          <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-0.5">LTV</p>
          <p className="text-sm font-black text-crm-primary">{formatCurrency(data.ltv)}</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 text-center">
          <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-0.5">Ticket Médio</p>
          <p className="text-sm font-black text-gray-800">{formatCurrency(data.ticket_medio)}</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 text-center">
          <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-0.5">Pedidos</p>
          <p className="text-sm font-black text-gray-800">{data.total_pedidos}</p>
        </div>
      </div>

      {/* ── Transparência LTV ── */}
      {data.ltv_breakdown && (
        <div className="bg-crm-primary/3 border border-crm-primary/15 rounded-xl px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Info size={11} className="text-crm-primary/60 shrink-0" />
            <p className="text-[9px] font-semibold text-crm-primary/70 uppercase tracking-wider">
              Como o LTV foi calculado
            </p>
          </div>
          <div className="space-y-1">
            {data.ltv_breakdown.paid.count > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  {data.ltv_breakdown.paid.count} pedido{data.ltv_breakdown.paid.count > 1 ? 's' : ''} pago{data.ltv_breakdown.paid.count > 1 ? 's' : ''}
                </span>
                <span className="text-[10px] font-semibold text-emerald-700">{formatCurrency(data.ltv_breakdown.paid.value)}</span>
              </div>
            )}
            {data.ltv_breakdown.transit.count > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  {data.ltv_breakdown.transit.count} pedido{data.ltv_breakdown.transit.count > 1 ? 's' : ''} em trânsito
                </span>
                <span className="text-[10px] font-semibold text-blue-700">{formatCurrency(data.ltv_breakdown.transit.value)}</span>
              </div>
            )}
            {data.ltv_breakdown.cancelled.count > 0 && (
              <div className="flex items-center justify-between opacity-60">
                <span className="text-[10px] text-gray-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                  {data.ltv_breakdown.cancelled.count} cancelado{data.ltv_breakdown.cancelled.count > 1 ? 's' : ''} (não contabilizado{data.ltv_breakdown.cancelled.count > 1 ? 's' : ''})
                </span>
                <span className="text-[10px] text-gray-400 line-through">{formatCurrency(data.ltv_breakdown.cancelled.value)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Ciclo de recompra ── */}
      {data.ciclo_recompra_medio !== null && (
        <div className={cn(
          'rounded-xl p-3 border flex items-center gap-3',
          data.dias_desde_ultima_compra !== null && data.ciclo_recompra_medio > 0 &&
          data.dias_desde_ultima_compra > data.ciclo_recompra_medio * 1.2
            ? 'bg-orange-50 border-orange-200'
            : 'bg-emerald-50 border-emerald-200'
        )}>
          <div className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
            data.dias_desde_ultima_compra !== null && data.ciclo_recompra_medio > 0 &&
            data.dias_desde_ultima_compra > data.ciclo_recompra_medio * 1.2
              ? 'bg-orange-100' : 'bg-emerald-100'
          )}>
            <Clock size={14} className={
              data.dias_desde_ultima_compra !== null && data.ciclo_recompra_medio > 0 &&
              data.dias_desde_ultima_compra > data.ciclo_recompra_medio * 1.2
                ? 'text-orange-600' : 'text-emerald-600'
            } />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Ciclo de Recompra</p>
            <p className="text-xs font-semibold text-gray-800">
              A cada <span className="font-black">{data.ciclo_recompra_medio}d</span>
              {data.dias_desde_ultima_compra !== null && (
                <span className="text-gray-400 font-normal"> · última há {data.dias_desde_ultima_compra}d</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* ── Dia de Ouro ── */}
      {data.dia_ouro && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Star size={10} className="text-amber-500" /> Dia de Ouro
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex flex-col items-center justify-center shrink-0">
              <span className="text-xs font-black text-amber-700">{DIAS[data.dia_ouro.dia_semana]}</span>
            </div>
            <div>
              <p className="text-sm font-bold text-amber-800">{data.dia_ouro.label}</p>
              <p className="text-[10px] text-amber-600">
                {data.dia_ouro.total_pedidos} pedido{data.dia_ouro.total_pedidos > 1 ? 's' : ''} · {formatCurrency(data.dia_ouro.total_gasto)} em compras
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Hora de Ouro ── */}
      {data.hora_ouro && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Clock size={10} className="text-sky-500" /> Hora de Ouro
          </p>
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center shrink-0">
              <Clock size={16} className="text-sky-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-sky-800">{data.hora_ouro.label}</p>
              <p className="text-[10px] text-sky-600">
                {data.hora_ouro.total_pedidos} pedido{data.hora_ouro.total_pedidos > 1 ? 's' : ''} neste horário
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Logística ── */}
      {data.logistica && data.logistica.total_fretes > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Truck size={10} className="text-gray-400" /> Logística
          </p>
          <div className="bg-white border border-gray-100 rounded-xl p-3 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-gray-400">Frete médio</span>
              <span className="text-xs font-bold text-gray-700">{formatCurrency(data.logistica.frete_medio)}</span>
            </div>
            {data.logistica.transportadora_mais_usada && (
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-gray-400">Transportadora favorita</span>
                <span className="text-xs font-bold text-gray-700 truncate max-w-30">{data.logistica.transportadora_mais_usada}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Numerações / Tamanhos ── */}
      {data.inventario.numeracoes.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Tag size={10} className="text-gray-400" /> Numerações
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.inventario.numeracoes.map(num => (
              <span key={num} className="text-[10px] font-bold px-2 py-1 bg-crm-primary/10 text-crm-primary rounded-lg border border-crm-primary/20">
                {num}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Top Produtos ── */}
      {data.inventario.top_produtos.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Package size={10} className="text-gray-400" /> Top {Math.min(3, data.inventario.top_produtos.length)} Produtos
          </p>
          <div className="space-y-1.5">
            {data.inventario.top_produtos.slice(0, 5).map((p, i) => {
              const MEDAL = ['🥇', '🥈', '🥉'];
              const isMedal = i < 3;
              return (
                <div key={i} className={cn(
                  'flex items-center gap-2 border rounded-xl px-3 py-2',
                  i === 0 ? 'bg-amber-50 border-amber-200' :
                  i === 1 ? 'bg-gray-50 border-gray-200' :
                  i === 2 ? 'bg-orange-50 border-orange-200' :
                  'bg-white border-gray-100'
                )}>
                  <span className="text-sm shrink-0 w-5 text-center">
                    {isMedal ? MEDAL[i] : <span className="text-[10px] font-black text-gray-300">#{i + 1}</span>}
                  </span>
                  <span className="flex-1 text-[11px] font-medium text-gray-700 truncate" title={p.nome}>{p.nome}</span>
                  <div className="shrink-0 text-right">
                    <span className="block text-[10px] font-bold text-gray-600">{p.quantidade}x</span>
                    <span className="block text-[9px] text-gray-400">{formatCurrency(p.total ?? 0)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Insights Anne ── */}
      {data.insights_anne.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Bot size={10} className="text-crm-primary" /> Insights da Anne
          </p>
          <div className="space-y-1.5">
            {data.insights_anne.map((insight, i) => (
              <div key={i} className="flex items-start gap-2 bg-crm-primary/5 border border-crm-primary/10 rounded-xl px-3 py-2">
                <Zap size={10} className="text-crm-primary mt-0.5 shrink-0" />
                <p className="text-[11px] text-gray-700 leading-relaxed">{insight}</p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ABA 6 — INSIGHTS ANNE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function AnneInsightsTab({ chatId, clientId }: { chatId: string; clientId?: string }) {
  const queryClient = useQueryClient();
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['anne-chat-log', chatId],
    queryFn: async () => {
      const res = await api.get<{
        entradas: Array<{
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

  // ── Chain of Thought — logs por clientId ─────────────────────────────
  interface ChainEntry {
    id: string;
    type: 'automation' | 'recovery';
    trigger_type?: string;
    source?: string;
    action_taken?: string;
    de_coluna?: string | null;
    para_coluna?: string | null;
    order_number?: string | null;
    tracking_code?: string | null;
    success?: boolean;
    error_msg?: string | null;
    status?: string;
    message_preview?: string;
    due_at?: string | null;
    sent_at?: string | null;
    created_at: string;
    chain_of_thought: string[];
  }

  const { data: chainData, isLoading: chainLoading } = useQuery({
    queryKey: ['anne-chain', clientId],
    queryFn: async () => {
      const res = await api.get<{ entries: ChainEntry[]; total: number }>(
        `/api/v2/anne/client-logs/${clientId}`,
      );
      return res.data;
    },
    staleTime: 30_000,
    enabled: !!clientId,
  });

  // ── Realtime: atualizar ao receber evento anne_notification via SSE ──
  useEffect(() => {
    const handler = (e: Event) => {
      const evt = e as CustomEvent<{ chat_id?: string }>;
      // Invalidar se for deste chat ou sem filtro (broadcast)
      if (!evt.detail?.chat_id || evt.detail.chat_id === chatId) {
        queryClient.invalidateQueries({ queryKey: ['anne-chat-log', chatId] });
        if (clientId) {
          queryClient.invalidateQueries({ queryKey: ['anne-chain', clientId] });
        }
      }
    };
    window.addEventListener('sse:anne_notification', handler);
    window.addEventListener('sse:kanban_moved', handler);
    return () => {
      window.removeEventListener('sse:anne_notification', handler);
      window.removeEventListener('sse:kanban_moved', handler);
    };
  }, [chatId, clientId, queryClient]);

  const TRIGGER_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    primeiro_contato:   { label: 'Primeiro Contato', color: 'text-sky-700', bg: 'bg-sky-50' },
    pedido_recebido:    { label: 'Pedido Recebido', color: 'text-blue-700', bg: 'bg-blue-50' },
    pagamento_aprovado: { label: 'Pagamento Aprovado', color: 'text-emerald-700', bg: 'bg-emerald-50' },
    sinal_rejeicao:     { label: 'Sinal de Rejeição', color: 'text-red-700', bg: 'bg-red-50' },
    engajamento_alto:   { label: 'Engajamento Alto', color: 'text-violet-700', bg: 'bg-violet-50' },
    ghosting:           { label: 'Ghosting', color: 'text-gray-600', bg: 'bg-gray-100' },
    saudacao:           { label: 'Saudação', color: 'text-teal-700', bg: 'bg-teal-50' },
    carrinho_abandono:  { label: 'Abandono de Carrinho', color: 'text-orange-700', bg: 'bg-orange-50' },
    codigo_rastreio:    { label: 'Código Rastreio', color: 'text-purple-700', bg: 'bg-purple-50' },
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

  const logs = data?.entradas ?? [];
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

      {/* ── Chain of Thought — Histórico de decisões da Anne ── */}
      {clientId && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Brain size={10} className="text-crm-primary" />
            Log de Decisões da Anne
          </p>

          {chainLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 size={16} className="animate-spin text-crm-primary" />
            </div>
          ) : !chainData?.entries.length ? (
            <div className="flex flex-col items-center py-6 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <Bot size={20} className="text-gray-200 mb-1.5" />
              <p className="text-[11px] text-gray-400">Nenhuma decisão registrada ainda.</p>
              <p className="text-[9px] text-gray-300 mt-0.5">As ações da Anne aparecerão aqui.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {chainData.entries.slice(0, 15).map((entry) => {
                const isExpanded = expandedLog === entry.id;
                const isRecovery = entry.type === 'recovery';
                const isSuccess = entry.success !== false;

                return (
                  <div
                    key={entry.id}
                    className={cn(
                      'border rounded-xl overflow-hidden transition-colors',
                      isRecovery
                        ? 'border-orange-100 bg-orange-50/50'
                        : isSuccess
                          ? 'border-gray-100 bg-white'
                          : 'border-red-100 bg-red-50/40',
                    )}
                  >
                    {/* Header da entrada */}
                    <button
                      onClick={() => setExpandedLog(isExpanded ? null : entry.id)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-black/5 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isRecovery ? (
                          <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-md shrink-0">
                            🛒 Recuperação
                          </span>
                        ) : (
                          <span className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0',
                            TRIGGER_LABELS[entry.trigger_type ?? '']?.bg ?? 'bg-gray-100',
                            TRIGGER_LABELS[entry.trigger_type ?? '']?.color ?? 'text-gray-600',
                          )}>
                            {TRIGGER_LABELS[entry.trigger_type ?? '']?.label ?? entry.trigger_type}
                          </span>
                        )}
                        {entry.de_coluna && entry.para_coluna && (
                          <span className="text-[9px] text-gray-400 truncate flex items-center gap-1">
                            <ArrowRight size={9} />
                            <span className="font-medium text-gray-600">{entry.para_coluna}</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[9px] text-gray-400">{formatRelativeTime(entry.created_at)}</span>
                        {isExpanded
                          ? <ChevronDown size={11} className="text-gray-400" />
                          : <ChevronRight size={11} className="text-gray-400" />
                        }
                      </div>
                    </button>

                    {/* Chain of Thought expandido */}
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-gray-100">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-2 mb-1.5">
                          💭 Raciocínio da Anne
                        </p>
                        <ol className="space-y-1">
                          {entry.chain_of_thought.map((step, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-[9px] font-black text-gray-300 w-3.5 shrink-0 mt-0.5">{idx + 1}.</span>
                              <span className="text-[11px] text-gray-600 leading-relaxed">{step}</span>
                            </li>
                          ))}
                        </ol>
                        {entry.message_preview && (
                          <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-2">
                            <p className="text-[9px] font-bold text-gray-400 mb-1">Mensagem preparada:</p>
                            <p className="text-[11px] text-gray-600 italic">&ldquo;{entry.message_preview}&rdquo;</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {(chainData.total ?? 0) > 15 && (
                <p className="text-[10px] text-gray-400 text-center py-1">
                  +{chainData.total - 15} entradas anteriores
                </p>
              )}
            </div>
          )}
        </div>
      )}
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

function ContactRow({ icon, value, copyable }: { icon: React.ReactNode; value: React.ReactNode; copyable?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-600">
      <span className="text-gray-400 shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">{value}</span>
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

/* ── Perfil Business WhatsApp ──────────────────────────────── */

interface BusinessProfile {
  is_business: boolean;
  description: string | null;
  email: string | null;
  website: string[];
  address: string | null;
  category: string | null;
  catalog_url: string | null;
  profile_pic_url: string | null;
}

function BusinessProfileSection({ phone }: { phone: string }) {
  const { data: bp, isLoading } = useQuery<BusinessProfile | null>({
    queryKey: ['business-profile', phone],
    queryFn: async () => {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      if (!cleanPhone || cleanPhone.length < 10) return null;
      const res = await api.get<BusinessProfile>(`/api/whatsapp/business-profile?phone=${cleanPhone}`);
      return res.data ?? null;
    },
    enabled: !!phone && phone.replace(/[^0-9]/g, '').length >= 10,
    staleTime: 5 * 60 * 1000, // 5min cache
    retry: 1,
  });

  if (isLoading) return null;
  if (!bp) return null;

  // Se não é business e não tem nenhum dado útil, não mostrar
  const hasData = bp.is_business || bp.description || bp.email || bp.website?.length || bp.address || bp.category;
  if (!hasData) return null;

  return (
    <SectionBlock
      title={bp.is_business ? '🏢 Empresa (Business)' : 'Perfil WhatsApp'}
      icon={bp.is_business ? undefined : <User size={12} />}
    >
      <div className="space-y-2">
        {/* Selo Business */}
        {bp.is_business && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-200 rounded-lg w-fit">
            <CheckCircle2 size={12} className="text-green-600" />
            <span className="text-[10px] font-bold text-green-700">Conta Business Verificada</span>
          </div>
        )}

        {/* Categoria */}
        {bp.category && (
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <Tag size={10} className="text-gray-400 shrink-0" />
            <span>{bp.category}</span>
          </div>
        )}

        {/* Descrição */}
        {bp.description && (
          <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">{bp.description}</p>
        )}

        {/* E-mail */}
        {bp.email && (
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <Mail size={10} className="text-gray-400 shrink-0" />
            <a href={`mailto:${bp.email}`} className="text-crm-primary hover:underline truncate">{bp.email}</a>
          </div>
        )}

        {/* Website(s) */}
        {bp.website && bp.website.length > 0 && bp.website.map((url, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
            <ExternalLink size={10} className="text-gray-400 shrink-0" />
            <a href={url.startsWith('http') ? url : `https://${url}`} target="_blank" rel="noopener noreferrer" className="text-crm-primary hover:underline truncate">
              {url.replace(/^https?:\/\//, '')}
            </a>
          </div>
        ))}

        {/* Endereço */}
        {bp.address && (
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <MapPin size={10} className="text-gray-400 shrink-0" />
            <span className="line-clamp-2">{bp.address}</span>
          </div>
        )}

        {/* Catálogo */}
        {bp.catalog_url && (
          <a
            href={bp.catalog_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-crm-primary hover:underline"
          >
            <ShoppingBag size={10} />
            Ver catálogo
          </a>
        )}
      </div>
    </SectionBlock>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   COMPONENTE PRINCIPAL — ClientBrainSidebar
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   BADGE PIPELINE — Visível em todas as abas
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function PipelineStageBadge({
  clientId,
  onClickPipeline,
}: {
  clientId: string;
  onClickPipeline: () => void;
}) {
  const { data } = useQuery({
    queryKey: ['kanban-pipeline', clientId],
    queryFn: async () => {
      const res = await api.get<{ card: { coluna: KanbanColumn; updated_at: string } | null }>(`/api/kanban/${clientId}`);
      return res.data;
    },
    enabled: !!clientId,
    staleTime: 30_000,
  });

  const coluna = data?.card?.coluna ?? null;
  if (!coluna) {
    return (
      <button
        onClick={onClickPipeline}
        className="flex items-center gap-1.5 px-3 pb-2 text-[10px] text-gray-300 hover:text-crm-primary transition-colors"
        title="Ver Pipeline"
      >
        <GitBranch size={10} />
        <span>Pipeline: sem etapa</span>
      </button>
    );
  }

  const cfg = KANBAN_COLUMN_CONFIG[coluna] ?? { label: coluna, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' };

  return (
    <button
      onClick={onClickPipeline}
      className={cn(
        'flex items-center gap-1.5 mx-3 mb-2 px-2.5 py-1.5 rounded-xl border w-[calc(100%-24px)] hover:opacity-80 transition-opacity',
        cfg.bg, cfg.border
      )}
      title="Clique para ver o histórico de pipeline"
    >
      <GitBranch size={10} className={cfg.color} />
      <span className={cn('text-[10px] font-bold truncate', cfg.color)}>Pipeline: {cfg.label}</span>
      <span className="ml-auto text-[9px] text-gray-400 shrink-0">ver →</span>
    </button>
  );
}

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
    queryKey: ['client', selectedChatId],
    queryFn: async () => {
      if (!selectedChatId) return null;
      const res = await api.get(`/api/clients/${selectedChatId}`);
      if (res.error) throw new Error(res.error);
      const raw = res.data as Record<string, unknown>;
      return (raw?.data ?? raw) as Record<string, unknown>;
    },
    enabled: !!selectedChatId,
    staleTime: 5_000, // 5 segundos: muito agressivo, sinc. rápida
    refetchOnMount: 'always',
    refetchInterval: 10_000, // refetch automático a cada 10 segundos (reduzido de 15s)
  });

  if (!selectedChatId) return null;

  const client = clientData as Record<string, unknown> | null;

  return (
    <aside className="w-[360px] shrink-0 flex flex-col bg-white border-l border-gray-200 h-full overflow-hidden">
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

      {/* ── Métricas fixas — visíveis em qualquer aba ── */}
      {client && (() => {
        const c = client as Record<string, unknown>;
        const ltv = (c.ltv as number) ?? 0;
        const ticket = (c.avg_ticket as number) ?? (c.ticket_medio as number) ?? 0;
        const totalPedidos = (c.total_orders as number) ?? 0;
        const clientId = (c.id as string) ?? selectedChatId;
        return (
          <div className="shrink-0 border-b border-gray-100 bg-white">
            <div className="grid grid-cols-3 gap-1.5 px-3 pt-2.5 pb-1.5">
              {/* LTV */}
              <div className="rounded-xl p-2 text-center border bg-crm-primary/5 border-crm-primary/20 min-w-0">
                <div className="flex items-center justify-center gap-0.5 mb-0.5">
                  <TrendingUp size={10} className="text-crm-primary shrink-0" />
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide truncate">LTV</p>
                </div>
                <p className="text-xs font-black text-crm-primary truncate" title={ltv > 0 ? formatCurrency(ltv) : '—'}>
                  {ltv > 0 ? formatCurrency(ltv) : '—'}
                </p>
              </div>
              {/* Ticket */}
              <div className="rounded-xl p-2 text-center border bg-gray-50 border-gray-100 min-w-0">
                <div className="flex items-center justify-center gap-0.5 mb-0.5">
                  <Star size={10} className="text-amber-500 shrink-0" />
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide truncate">Ticket</p>
                </div>
                <p className="text-xs font-black text-gray-800 truncate" title={ticket > 0 ? formatCurrency(ticket) : '—'}>
                  {ticket > 0 ? formatCurrency(ticket) : '—'}
                </p>
              </div>
              {/* Pedidos — clicável */}
              <button
                onClick={() => setActiveTab('orders')}
                className="rounded-xl p-2 text-center border bg-gray-50 border-gray-100 hover:bg-crm-primary/5 hover:border-crm-primary/20 transition-colors group min-w-0"
                title="Ver pedidos"
              >
                <div className="flex items-center justify-center gap-0.5 mb-0.5">
                  <ShoppingBag size={10} className="text-gray-400 group-hover:text-crm-primary transition-colors shrink-0" />
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide truncate">Pedidos</p>
                </div>
                <p className="text-xs font-black text-gray-800 group-hover:text-crm-primary transition-colors">
                  {String(totalPedidos)}
                </p>
              </button>
            </div>
            {/* Badge de etapa do pipeline — clicável vai para aba Pipeline */}
            <PipelineStageBadge
              clientId={clientId}
              onClickPipeline={() => setActiveTab('pipeline')}
            />
          </div>
        );
      })()}

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
                orders={(client?.recent_orders as Order[]) ?? []}
                clientId={(client.id as string) ?? selectedChatId}
                chatId={selectedChatId}
                onRefresh={() => {
                  queryClient.invalidateQueries({ queryKey: ['client', selectedChatId] });
                  queryClient.invalidateQueries({ queryKey: ['brain-client', selectedChatId] });
                  queryClient.invalidateQueries({ queryKey: ['chats'] });
                }}
              />
            )}
            {activeTab === 'orders' && (
              <OrdersTab 
                clientId={(client.id as string) ?? selectedChatId} 
                orders={(client?.recent_orders as Order[]) ?? []}
              />
            )}
            {activeTab === 'tracking' && (
              <TrackingTab 
                clientId={(client.id as string) ?? selectedChatId}
                orders={(client?.recent_orders as Order[]) ?? []}
              />
            )}
            {activeTab === 'pipeline' && (
              <PipelineTab clientId={(client.id as string) ?? selectedChatId} />
            )}
            {activeTab === 'patterns' && (
              <PatternsTab clientId={(client.id as string) ?? selectedChatId} />
            )}
            {activeTab === 'anne' && (
              <AnneInsightsTab chatId={selectedChatId} clientId={(client.id as string) ?? undefined} />
            )}
          </>
        )}
      </div>
    </aside>
  );
}
