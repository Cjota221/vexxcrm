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
} from 'lucide-react';
import { useClient } from '@/hooks/useClients';
import { ClientCard } from '@/components/crm/ClientCard';
import { OrderHistory } from '@/components/crm/OrderHistory';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function ClienteDetalhe() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;
  const { data: client, isLoading } = useClient(clientId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-surface-200 rounded w-48 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-64 bg-surface-200 rounded-xl animate-pulse" />
          <div className="h-64 bg-surface-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-20">
        <p className="text-txt-secondary">Cliente não encontrado</p>
        <Button variant="ghost" onClick={() => router.back()} className="mt-4">
          <ArrowLeft size={16} /> Voltar
        </Button>
      </div>
    );
  }

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
          <h1 className="text-2xl font-bold text-txt-primary">{client.name}</h1>
          <p className="text-sm text-txt-secondary">{client.phone}</p>
        </div>
        <Button variant="secondary">
          <Edit2 size={16} /> Editar
        </Button>
        <Button variant="primary">
          <MessageSquare size={16} /> Enviar mensagem
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Info do cliente */}
          <ClientCard client={client} />

          {/* Notas */}
          <Card>
            <CardHeader>
              <CardTitle>Notas</CardTitle>
            </CardHeader>
            <div className="p-4 pt-0">
              <p className="text-sm text-txt-secondary">
                {client.notas || 'Nenhuma nota adicionada.'}
              </p>
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Pedidos */}
          <Card>
            <CardHeader>
              <CardTitle>
                <ShoppingBag size={16} /> Últimos Pedidos
              </CardTitle>
            </CardHeader>
            <div className="p-4 pt-0">
              <OrderHistory orders={[]} />
            </div>
          </Card>

          {/* Tags */}
          <Card>
            <CardHeader>
              <CardTitle>
                <Tag size={16} /> Tags
              </CardTitle>
            </CardHeader>
            <div className="p-4 pt-0">
              {client.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {client.tags.map((tag) => (
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
        </div>
      </div>
    </div>
  );
}
