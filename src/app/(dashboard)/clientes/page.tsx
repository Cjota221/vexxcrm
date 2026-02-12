'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  Filter,
  Download,
  Users,
  TrendingUp,
  ShoppingBag,
  AlertTriangle,
} from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatRelativeTime, getInitials, getAvatarColor, debounce } from '@/lib/utils';
import type { Client, ClientStatus } from '@/types';

const STATUS_MAP: Record<ClientStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  novo: { label: 'Novo', variant: 'info' },
  ativo: { label: 'Ativo', variant: 'success' },
  vip: { label: 'VIP', variant: 'warning' },
  risco: { label: 'Em risco', variant: 'danger' },
  inativo: { label: 'Inativo', variant: 'neutral' },
};

export default function ClientesPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ClientStatus | ''>('');

  const { data, isLoading } = useClients({
    search: search || undefined,
    status: statusFilter || undefined,
  });

  const clients = data?.data ?? [];
  const total = data?.total ?? 0;

  const handleSearch = debounce((value: string) => {
    setSearch(value);
  }, 300);

  // Métricas rápidas
  const totalClients = total;
  const vipClients = clients.filter((c: Client) => c.status === 'vip').length;
  const riskClients = clients.filter((c: Client) => c.status === 'risco').length;
  const totalLTV = clients.reduce((acc: number, c: Client) => acc + c.ltv, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-txt-primary">Clientes</h1>
          <p className="text-sm text-txt-secondary mt-1">{totalClients} clientes cadastrados</p>
        </div>
        <Button variant="primary">
          <Plus size={16} />
          Novo Cliente
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-crm-primary/10 flex items-center justify-center">
              <Users size={20} className="text-crm-primary" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Total</p>
              <p className="text-lg font-bold text-txt-primary">{totalClients}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
              <TrendingUp size={20} className="text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">VIP</p>
              <p className="text-lg font-bold text-txt-primary">{vipClients}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <AlertTriangle size={20} className="text-red-500" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Em Risco</p>
              <p className="text-lg font-bold text-txt-primary">{riskClients}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <ShoppingBag size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">LTV Total</p>
              <p className="text-lg font-bold text-txt-primary">{formatCurrency(totalLTV)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <div className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Buscar por nome, telefone ou e-mail..."
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ClientStatus | '')}
            className="input text-sm py-2 px-3 min-w-[150px]"
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_MAP).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <Button variant="ghost">
            <Download size={16} />
            Exportar
          </Button>
        </div>
      </Card>

      {/* Tabela de clientes */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200">
                <th className="text-left text-xs font-medium text-txt-secondary px-4 py-3">Cliente</th>
                <th className="text-left text-xs font-medium text-txt-secondary px-4 py-3">Telefone</th>
                <th className="text-left text-xs font-medium text-txt-secondary px-4 py-3">Status</th>
                <th className="text-right text-xs font-medium text-txt-secondary px-4 py-3">LTV</th>
                <th className="text-right text-xs font-medium text-txt-secondary px-4 py-3">Pedidos</th>
                <th className="text-right text-xs font-medium text-txt-secondary px-4 py-3">Última compra</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-surface-100">
                    <td className="px-4 py-3"><div className="h-4 bg-surface-200 rounded w-32 animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-surface-200 rounded w-28 animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-surface-200 rounded w-16 animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-surface-200 rounded w-20 animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-surface-200 rounded w-10 animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-surface-200 rounded w-24 animate-pulse" /></td>
                  </tr>
                ))
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-txt-secondary">
                    Nenhum cliente encontrado
                  </td>
                </tr>
              ) : (
                clients.map((client: Client) => {
                  const status = STATUS_MAP[client.status];
                  return (
                    <tr
                      key={client.id}
                      onClick={() => router.push(`/clientes/${client.id}`)}
                      className="border-b border-surface-100 hover:bg-surface-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                            style={{ backgroundColor: getAvatarColor(client.id) }}
                          >
                            {getInitials(client.name)}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-txt-primary">{client.name}</p>
                            {client.email && (
                              <p className="text-xs text-txt-secondary">{client.email}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-txt-primary">{client.phone}</td>
                      <td className="px-4 py-3">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-txt-primary">
                        {formatCurrency(client.ltv)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-txt-primary">
                        {client.total_pedidos}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-txt-secondary">
                        {client.ultima_compra ? formatRelativeTime(client.ultima_compra) : '—'}
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
