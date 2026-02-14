'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  ShoppingBag,
  Package,
  TrendingUp,
  Receipt,
  UserPlus,
  DollarSign,
  Truck,
  CheckCircle,
  BarChart3,
  ShoppingCart,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import type { DashboardKPIs } from '@/types';

/**
 * Dashboard — Página inicial com KPIs e visão geral.
 */
export default function DashboardPage() {
  const router = useRouter();

  // Verificar autenticação
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
      }
    };
    checkAuth();
  }, [router]);

  const { data: kpis, isLoading: isLoadingKpis } = useQuery({
    queryKey: ['dashboard-kpis'],
    queryFn: async () => {
      const response = await api.get<DashboardKPIs>('/api/dashboard');
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    refetchInterval: 60_000,
  });

  const kpiCards = [
    {
      label: 'Total de Clientes',
      value: kpis?.total_clients ?? 0,
      icon: <Users size={22} />,
      color: 'text-crm-primary',
      bg: 'bg-crm-primary/10',
    },
    {
      label: 'Total Pedidos',
      value: kpis?.total_orders ?? 0,
      icon: <ShoppingBag size={22} />,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Pedidos Pagos',
      value: kpis?.total_paid ?? 0,
      icon: <CheckCircle size={22} />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Pedidos Entregues',
      value: kpis?.total_delivered ?? 0,
      icon: <Truck size={22} />,
      color: 'text-sky-600',
      bg: 'bg-sky-50',
    },
    {
      label: 'Faturamento Total',
      value: formatCurrency(kpis?.total_revenue ?? 0),
      icon: <DollarSign size={22} />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Faturamento Pago',
      value: formatCurrency(kpis?.paid_revenue ?? 0),
      icon: <TrendingUp size={22} />,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'Ticket Médio',
      value: formatCurrency(kpis?.avg_ticket ?? 0),
      icon: <Receipt size={22} />,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      label: 'Peças Vendidas',
      value: (kpis?.total_pieces_sold ?? 0).toLocaleString('pt-BR'),
      icon: <ShoppingCart size={22} />,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      label: 'Novos Clientes (mês)',
      value: kpis?.new_clients_month ?? 0,
      icon: <UserPlus size={22} />,
      color: 'text-crm-primary',
      bg: 'bg-crm-primary/10',
    },
    {
      label: 'Total Produtos',
      value: kpis?.messages_today ?? 0,
      icon: <Package size={22} />,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
  ];

  if (isLoadingKpis) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-txt-primary">Dashboard</h1>
          <p className="text-sm text-txt-secondary mt-1">Visão geral do seu negócio</p>
        </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-24 bg-surface-200 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-txt-primary">Dashboard</h1>
        <p className="text-sm text-txt-secondary mt-1">
          Visão geral do seu negócio
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {kpiCards.map((kpi) => (
          <Card key={kpi.label} hover padding="md">
            <div className="space-y-3">
              <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center ${kpi.color}`}>
                {kpi.icon}
              </div>
              <p className="text-sm text-txt-secondary">{kpi.label}</p>
              <p className="text-2xl font-bold text-txt-primary">{kpi.value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Links rápidos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card
          hover
          className="cursor-pointer"
          onClick={() => router.push('/pedidos')}
        >
          <div className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <ShoppingBag size={24} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-txt-primary">Pedidos</h3>
              <p className="text-xs text-txt-secondary mt-0.5">
                {kpis?.total_orders ?? 0} pedidos · {formatCurrency(kpis?.total_revenue ?? 0)} faturado · {(kpis?.total_pieces_sold ?? 0).toLocaleString('pt-BR')} peças
              </p>
            </div>
          </div>
        </Card>

        <Card
          hover
          className="cursor-pointer"
          onClick={() => router.push('/clientes')}
        >
          <div className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-crm-primary/10 flex items-center justify-center">
              <Users size={24} className="text-crm-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-txt-primary">Clientes</h3>
              <p className="text-xs text-txt-secondary mt-0.5">
                {kpis?.total_clients ?? 0} clientes · {kpis?.new_clients_month ?? 0} novos este mês
              </p>
            </div>
          </div>
        </Card>

        <Card
          hover
          className="cursor-pointer"
          onClick={() => router.push('/produtos')}
        >
          <div className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center">
              <Package size={24} className="text-violet-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-txt-primary">Produtos</h3>
              <p className="text-xs text-txt-secondary mt-0.5">
                {kpis?.messages_today ?? 0} produtos no catálogo
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
