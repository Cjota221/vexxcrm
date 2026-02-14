'use client';

import { useState } from 'react';
import {
  X,
  Search,
  Phone,
  ShoppingBag,
  DollarSign,
  Clock,
  Crown,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Bot,
  Users,
  CheckSquare,
  Square,
  Send,
} from 'lucide-react';
import { formatCurrency, formatRelativeTime, cn } from '@/lib/utils';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TIPOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export interface ClientListItem {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  rfm_segment?: string | null;
  total_orders?: number | null;
  total_spent?: number | null;
  avg_ticket?: number | null;
  last_order_at?: string | null;
  is_vip?: boolean;
  is_at_risk?: boolean;
  churn_probability?: number | null;
  // Extras sazonais
  seasonal_orders?: number;
  seasonal_spent?: number;
  seasonal_items?: number;
}

interface ClientListDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  headerColor?: string;
  clients: ClientListItem[];
  isLoading?: boolean;
  // Paginação
  page: number;
  totalPages: number;
  totalClients: number;
  onPageChange: (page: number) => void;
  // Busca
  search?: string;
  onSearchChange?: (search: string) => void;
  // Anne
  onAskAnne?: (clients: ClientListItem[]) => void;
  // Modo sazonal
  seasonalMode?: boolean;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   COMPONENTE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function ClientListDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  headerColor = 'from-crm-primary to-crm-secondary',
  clients,
  isLoading,
  page,
  totalPages,
  totalClients,
  onPageChange,
  search,
  onSearchChange,
  onAskAnne,
  seasonalMode = false,
}: ClientListDrawerProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === clients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(clients.map(c => c.id)));
    }
  };

  const selectedClients = clients.filter(c => selectedIds.has(c.id));

  const handleAskAnne = () => {
    if (onAskAnne && selectedClients.length > 0) {
      onAskAnne(selectedClients);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg z-61 bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className={cn('px-6 py-5 bg-linear-to-r shrink-0', headerColor)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {icon || <Users size={22} className="text-white" />}
              <div>
                <h2 className="text-lg font-bold text-white">{title}</h2>
                {subtitle && (
                  <p className="text-sm text-white/80">{subtitle}</p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-white/20 text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Total */}
          <div className="mt-3 flex items-center gap-4 text-sm text-white/90">
            <span className="flex items-center gap-1">
              <Users size={14} />
              {totalClients} clientes
            </span>
          </div>
        </div>

        {/* Search + Actions bar */}
        <div className="px-4 py-3 border-b border-surface-border bg-surface-50 shrink-0 space-y-2">
          {onSearchChange && (
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
              <input
                type="text"
                value={search || ''}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Buscar por nome ou telefone..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-surface-border rounded-xl focus:outline-none focus:ring-2 focus:ring-crm-primary/30 focus:border-crm-primary"
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={selectAll}
              className="flex items-center gap-1.5 text-xs text-txt-secondary hover:text-crm-primary transition-colors"
            >
              {selectedIds.size === clients.length && clients.length > 0 ? (
                <CheckSquare size={14} className="text-crm-primary" />
              ) : (
                <Square size={14} />
              )}
              {selectedIds.size > 0 ? `${selectedIds.size} selecionado(s)` : 'Selecionar todos'}
            </button>

            {onAskAnne && selectedIds.size > 0 && (
              <button
                onClick={handleAskAnne}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-crm-primary text-white hover:bg-crm-primary/90 transition-colors shadow-sm"
              >
                <Bot size={14} />
                Perguntar à Anne ({selectedIds.size})
              </button>
            )}
          </div>
        </div>

        {/* Lista de clientes */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-crm-primary mb-3" />
              <p className="text-sm text-txt-muted">Carregando clientes...</p>
            </div>
          ) : clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-txt-muted">
              <Users size={40} className="mb-3 opacity-30" />
              <p className="text-sm">Nenhum cliente encontrado</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-border">
              {clients.map((client) => {
                const isSelected = selectedIds.has(client.id);

                return (
                  <div
                    key={client.id}
                    className={cn(
                      'px-4 py-3 hover:bg-surface-50 transition-colors cursor-pointer',
                      isSelected && 'bg-crm-primary/5 border-l-2 border-l-crm-primary'
                    )}
                    onClick={() => toggleSelect(client.id)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <div className="mt-1 shrink-0">
                        {isSelected ? (
                          <CheckSquare size={16} className="text-crm-primary" />
                        ) : (
                          <Square size={16} className="text-txt-muted" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-txt-primary truncate">
                            {client.name || 'Sem nome'}
                          </p>
                          {client.is_vip && (
                            <Crown size={12} className="text-yellow-500 shrink-0" />
                          )}
                          {client.is_at_risk && (
                            <AlertTriangle size={12} className="text-red-500 shrink-0" />
                          )}
                        </div>

                        {/* Telefone */}
                        <div className="flex items-center gap-1 text-xs text-txt-muted mb-2">
                          <Phone size={10} />
                          <span>{client.phone || '—'}</span>
                        </div>

                        {/* Métricas */}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-txt-secondary">
                          {seasonalMode ? (
                            <>
                              {client.seasonal_orders != null && (
                                <span className="flex items-center gap-1">
                                  <ShoppingBag size={10} className="text-orange-500" />
                                  {client.seasonal_orders} pedidos no período
                                </span>
                              )}
                              {client.seasonal_spent != null && (
                                <span className="flex items-center gap-1">
                                  <DollarSign size={10} className="text-green-500" />
                                  {formatCurrency(client.seasonal_spent)} no período
                                </span>
                              )}
                              {client.seasonal_items != null && client.seasonal_items > 0 && (
                                <span className="flex items-center gap-1">
                                  📦 {client.seasonal_items} peças
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              {client.total_orders != null && (
                                <span className="flex items-center gap-1">
                                  <ShoppingBag size={10} className="text-blue-500" />
                                  {client.total_orders} pedidos
                                </span>
                              )}
                              {client.total_spent != null && (
                                <span className="flex items-center gap-1">
                                  <DollarSign size={10} className="text-green-500" />
                                  {formatCurrency(client.total_spent)}
                                </span>
                              )}
                              {client.avg_ticket != null && (
                                <span className="flex items-center gap-1">
                                  🎫 Ticket: {formatCurrency(client.avg_ticket)}
                                </span>
                              )}
                            </>
                          )}

                          {client.last_order_at && (
                            <span className="flex items-center gap-1">
                              <Clock size={10} className="text-gray-400" />
                              Último: {formatRelativeTime(client.last_order_at)}
                            </span>
                          )}

                          {client.churn_probability != null && client.churn_probability > 0 && (
                            <span className={cn(
                              'flex items-center gap-1',
                              client.churn_probability > 60 ? 'text-red-600' :
                              client.churn_probability > 30 ? 'text-orange-600' : 'text-green-600'
                            )}>
                              ⚡ Churn: {client.churn_probability}%
                            </span>
                          )}
                        </div>

                        {/* RFM badge */}
                        {client.rfm_segment && (
                          <div className="mt-1.5">
                            <span className="inline-block px-2 py-0.5 text-[10px] font-medium rounded-full bg-violet-100 text-violet-700">
                              {client.rfm_segment}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-surface-border bg-surface-50 shrink-0">
            <div className="flex items-center justify-between">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-border hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
                Anterior
              </button>
              <span className="text-xs text-txt-muted">
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-border hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Próxima
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Botão fixo Anne (quando há seleção) */}
        {onAskAnne && selectedIds.size > 0 && (
          <div className="px-4 py-3 border-t border-surface-border bg-white shrink-0">
            <button
              onClick={handleAskAnne}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-xl bg-linear-to-r from-crm-primary to-crm-secondary text-white hover:opacity-90 transition-opacity shadow-lg"
            >
              <Bot size={18} />
              Perguntar à Anne sobre {selectedIds.size} cliente(s)
              <Send size={14} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
