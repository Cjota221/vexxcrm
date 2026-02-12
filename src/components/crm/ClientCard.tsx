'use client';

import {
  Phone,
  Mail,
  Calendar,
  Tag,
  TrendingUp,
  ShoppingBag,
  Star,
  Edit2,
} from 'lucide-react';
import type { Client } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate, getInitials, getAvatarColor } from '@/lib/utils';

interface ClientCardProps {
  client: Client;
  onEdit?: () => void;
}

const STATUS_MAP: Record<Client['status'], { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  novo: { label: 'Novo', variant: 'info' },
  ativo: { label: 'Ativo', variant: 'success' },
  vip: { label: 'VIP', variant: 'warning' },
  risco: { label: 'Em risco', variant: 'danger' },
  inativo: { label: 'Inativo', variant: 'neutral' },
};

export function ClientCard({ client, onEdit }: ClientCardProps) {
  const status = STATUS_MAP[client.status];

  return (
    <div className="bg-white rounded-xl border border-surface-200 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold shrink-0"
          style={{ backgroundColor: getAvatarColor(client.id) }}
        >
          {getInitials(client.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-txt-primary truncate">{client.name}</h3>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-txt-secondary flex items-center gap-1">
              <Phone size={12} /> {client.phone}
            </span>
            {client.email && (
              <span className="text-xs text-txt-secondary flex items-center gap-1">
                <Mail size={12} /> {client.email}
              </span>
            )}
          </div>
        </div>
        {onEdit && (
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-txt-secondary hover:text-crm-primary hover:bg-surface-100 transition-colors"
          >
            <Edit2 size={14} />
          </button>
        )}
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-surface-50 rounded-lg p-2 text-center">
          <p className="text-xs text-txt-secondary flex items-center justify-center gap-1">
            <TrendingUp size={12} /> LTV
          </p>
          <p className="text-sm font-semibold text-crm-primary">{formatCurrency(client.ltv)}</p>
        </div>
        <div className="bg-surface-50 rounded-lg p-2 text-center">
          <p className="text-xs text-txt-secondary flex items-center justify-center gap-1">
            <Star size={12} /> Ticket
          </p>
          <p className="text-sm font-semibold text-txt-primary">{formatCurrency(client.ticket_medio)}</p>
        </div>
        <div className="bg-surface-50 rounded-lg p-2 text-center">
          <p className="text-xs text-txt-secondary flex items-center justify-center gap-1">
            <ShoppingBag size={12} /> Pedidos
          </p>
          <p className="text-sm font-semibold text-txt-primary">{client.total_pedidos}</p>
        </div>
      </div>

      {/* Tags */}
      {client.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <Tag size={12} className="text-txt-secondary mt-0.5" />
          {client.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 bg-crm-primary/10 text-crm-primary text-xs rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Info extra */}
      <div className="text-xs text-txt-secondary space-y-1 border-t border-surface-100 pt-3">
        {client.ultima_compra && (
          <p className="flex items-center gap-1">
            <Calendar size={12} /> Última compra: {formatDate(client.ultima_compra)}
          </p>
        )}
        <p className="flex items-center gap-1">
          <Calendar size={12} /> Cliente desde: {formatDate(client.created_at)}
        </p>
      </div>
    </div>
  );
}
