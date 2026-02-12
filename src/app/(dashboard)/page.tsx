'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  MessageCircle,
  Megaphone,
  Send,
  TrendingUp,
  Receipt,
  UserPlus,
  Clock,
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

  // Verificar autenticação de forma simples
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('📊 Dashboard: Não autenticado, redirecionando...');
        router.push('/login');
      } else {
        console.log('📊 Dashboard: ✅ Autenticado');
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
    refetchInterval: 60_000, // Atualizar a cada 1 minuto
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
      label: 'Conversas Ativas',
      value: kpis?.active_chats ?? 0,
      icon: <MessageCircle size={22} />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Campanhas Rodando',
      value: kpis?.running_campaigns ?? 0,
      icon: <Megaphone size={22} />,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
    {
      label: 'Mensagens Hoje',
      value: kpis?.messages_today ?? 0,
      icon: <Send size={22} />,
      color: 'text-sky-600',
      bg: 'bg-sky-50',
    },
    {
      label: 'Receita Total',
      value: formatCurrency(kpis?.total_revenue ?? 0),
      icon: <TrendingUp size={22} />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Ticket Médio',
      value: formatCurrency(kpis?.avg_ticket ?? 0),
      icon: <Receipt size={22} />,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      label: 'Novos Clientes (mês)',
      value: kpis?.new_clients_month ?? 0,
      icon: <UserPlus size={22} />,
      color: 'text-crm-primary',
      bg: 'bg-crm-primary/10',
    },
    {
      label: 'Tempo Resposta',
      value: `${kpis?.response_time_avg ?? 0}min`,
      icon: <Clock size={22} />,
      color: 'text-rose-600',
      bg: 'bg-rose-50',
    },
  ];

  if (isLoadingKpis) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando dados...</p>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => (
          <Card key={kpi.label} hover padding="md">
            {isLoadingKpis ? (
              <div className="space-y-3">
                <div className="skeleton h-10 w-10 rounded-xl" />
                <div className="skeleton h-4 w-20" />
                <div className="skeleton h-8 w-24" />
              </div>
            ) : (
              <div className="space-y-3">
                <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center ${kpi.color}`}>
                  {kpi.icon}
                </div>
                <p className="text-sm text-txt-secondary">{kpi.label}</p>
                <p className="text-2xl font-bold text-txt-primary">{kpi.value}</p>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Placeholder: Gráficos e mais seções */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-lg font-semibold text-txt-primary mb-4">Vendas dos últimos 30 dias</h3>
          <div className="h-64 flex items-center justify-center text-txt-muted text-sm">
            📊 Gráfico será implementado aqui
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-txt-primary mb-4">Últimas conversas</h3>
          <div className="h-64 flex items-center justify-center text-txt-muted text-sm">
            💬 Lista de conversas recentes
          </div>
        </Card>
      </div>
    </div>
  );
}
