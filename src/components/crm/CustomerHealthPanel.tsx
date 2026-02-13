'use client';

import { useState } from 'react';
import {
  Heart,
  TrendingUp,
  TrendingDown,
  Minus,
  ShoppingBag,
  RefreshCw,
  Crown,
  AlertTriangle,
  XCircle,
  Zap,
  Target,
  Lightbulb,
  Package,
  Loader2,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';
import type { CustomerHealth, HealthClassification } from '@/types';

interface CustomerHealthPanelProps {
  clientId: string;
}

const CLASSIFICATION_CONFIG: Record<HealthClassification, {
  color: string;
  bg: string;
  border: string;
  icon: typeof Crown;
  label: string;
  badgeVariant: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}> = {
  VIP: {
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: Crown,
    label: '👑 VIP',
    badgeVariant: 'warning',
  },
  Ativo: {
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: Zap,
    label: '⚡ Ativo',
    badgeVariant: 'success',
  },
  Oportunidade: {
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: Target,
    label: '🎯 Oportunidade',
    badgeVariant: 'info',
  },
  Risco: {
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    icon: AlertTriangle,
    label: '⚠️ Risco',
    badgeVariant: 'warning',
  },
  Perdido: {
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: XCircle,
    label: '❌ Perdido',
    badgeVariant: 'danger',
  },
};

const TendenciaIcon = ({ tipo }: { tipo: string }) => {
  if (tipo === 'aumentando') return <TrendingUp size={14} className="text-green-500" />;
  if (tipo === 'diminuindo') return <TrendingDown size={14} className="text-red-500" />;
  return <Minus size={14} className="text-gray-400" />;
};

const TendenciaLabel: Record<string, string> = {
  aumentando: 'Aumentando',
  diminuindo: 'Diminuindo',
  estavel: 'Estável',
};

interface HealthResponse {
  data: CustomerHealth;
  cached: boolean;
}

export function CustomerHealthPanel({ clientId }: CustomerHealthPanelProps) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const { accessToken } = useAuthStore();

  const { data: healthData, isLoading, error } = useQuery<HealthResponse>({
    queryKey: ['client-health', clientId],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/health`, {
        headers: { Authorization: `Bearer ${accessToken || ''}` },
      });
      if (!res.ok) throw new Error('Erro ao calcular saúde');
      return res.json();
    },
    staleTime: 6 * 60 * 60 * 1000, // 6 horas
    retry: 1,
    enabled: !!accessToken,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.fetchQuery<HealthResponse>({
        queryKey: ['client-health', clientId, 'refresh'],
        queryFn: async () => {
          const res = await fetch(`/api/clients/${clientId}/health?refresh=true`, {
            headers: { Authorization: `Bearer ${accessToken || ''}` },
          });
          return res.json();
        },
      });
      queryClient.invalidateQueries({ queryKey: ['client-health', clientId] });
    } finally {
      setRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <div className="p-6 flex items-center justify-center gap-3">
          <Loader2 size={20} className="animate-spin text-crm-primary" />
          <span className="text-sm text-txt-secondary">Calculando saúde do cliente...</span>
        </div>
      </Card>
    );
  }

  if (error || !healthData?.data) {
    return (
      <Card>
        <div className="p-6 text-center">
          <Heart size={32} className="mx-auto text-txt-muted mb-2" />
          <p className="text-sm text-txt-secondary">Não foi possível calcular a saúde</p>
          <Button variant="ghost" size="sm" onClick={handleRefresh} className="mt-2">
            <RefreshCw size={14} /> Tentar novamente
          </Button>
        </div>
      </Card>
    );
  }

  const health = healthData.data;
  const config = CLASSIFICATION_CONFIG[health.classificacao.nivel as HealthClassification];
  const Icon = config.icon;

  return (
    <div className="space-y-4">
      {/* Header com Score */}
      <Card className={`${config.border} border-2`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Heart size={16} className="text-red-500" />
              Saúde do Cliente
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Calculando...' : 'Atualizar'}
            </Button>
          </div>
        </CardHeader>

        <div className="px-4 pb-4">
          {/* Score bar + Classificação */}
          <div className="flex items-center gap-4 mb-4">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${config.bg}`}>
              <Icon size={16} className={config.color} />
              <span className={`text-sm font-bold ${config.color}`}>{config.label}</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-txt-secondary">Score de Saúde</span>
                <span className="text-sm font-bold text-txt-primary">{health.classificacao.score}/100</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    health.classificacao.score >= 80 ? 'bg-amber-500' :
                    health.classificacao.score >= 60 ? 'bg-green-500' :
                    health.classificacao.score >= 40 ? 'bg-blue-500' :
                    health.classificacao.score >= 20 ? 'bg-orange-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${health.classificacao.score}%` }}
                />
              </div>
            </div>
          </div>

          {/* Mini KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center p-2 bg-surface-bg rounded-lg">
              <p className="text-xs text-txt-secondary mb-0.5">Inativo há</p>
              <p className="text-lg font-bold text-txt-primary">
                {health.metricas.diasInatividade > 900 ? '—' : `${health.metricas.diasInatividade}d`}
              </p>
            </div>
            <div className="text-center p-2 bg-surface-bg rounded-lg">
              <p className="text-xs text-txt-secondary mb-0.5">Ticket Médio</p>
              <p className="text-lg font-bold text-txt-primary">
                {formatCurrency(health.metricas.comportamentoCompra.ticketMedio)}
              </p>
            </div>
            <div className="text-center p-2 bg-surface-bg rounded-lg">
              <p className="text-xs text-txt-secondary mb-0.5">Frequência</p>
              <p className="text-lg font-bold text-txt-primary">
                {health.metricas.frequenciaCompra.mediaComprasMes.toFixed(1)}/mês
              </p>
            </div>
            <div className="text-center p-2 bg-surface-bg rounded-lg">
              <p className="text-xs text-txt-secondary mb-0.5">LTV</p>
              <p className="text-lg font-bold text-crm-primary">
                {formatCurrency(health.metricas.comportamentoCompra.valorTotalGasto)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Produtos Preferidos */}
      {health.metricas.comportamentoCompra.produtosPreferidos.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Package size={16} /> Produtos Preferidos
            </CardTitle>
          </CardHeader>
          <div className="px-4 pb-4 space-y-2">
            {health.metricas.comportamentoCompra.produtosPreferidos.map((prod, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-crm-primary/10 text-crm-primary text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-txt-primary truncate">{prod.nome}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-crm-primary/60 rounded-full"
                        style={{ width: `${prod.percentualCompras}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-txt-secondary shrink-0">
                      {prod.percentualCompras}% · {prod.quantidade}x
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tendências */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp size={16} /> Tendências
          </CardTitle>
        </CardHeader>
        <div className="px-4 pb-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-txt-secondary">Frequência</span>
            <div className="flex items-center gap-1.5">
              <TendenciaIcon tipo={health.metricas.tendencias.crescimentoFrequencia} />
              <span className="text-sm text-txt-primary">
                {TendenciaLabel[health.metricas.tendencias.crescimentoFrequencia] || 'Estável'}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-txt-secondary">Ticket Médio</span>
            <div className="flex items-center gap-1.5">
              <TendenciaIcon tipo={health.metricas.tendencias.crescimentoTicket} />
              <span className="text-sm text-txt-primary">
                {TendenciaLabel[health.metricas.tendencias.crescimentoTicket] || 'Estável'}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-surface-border">
            <span className="text-sm text-txt-secondary">Últimos 3 meses</span>
            <div className="text-right">
              <span className="text-sm font-medium text-txt-primary">
                {health.metricas.tendencias.ultimosTresMeses.pedidos} pedidos
              </span>
              <span className="text-xs text-txt-secondary ml-2">
                {formatCurrency(health.metricas.tendencias.ultimosTresMeses.valorTotal)}
              </span>
            </div>
          </div>
          {health.metricas.frequenciaCompra.primeiraCompra && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-txt-secondary">Tempo como cliente</span>
              <span className="text-sm text-txt-primary">
                {health.metricas.frequenciaCompra.mesesComoCliente} meses
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* Recomendações */}
      {health.classificacao.recomendacoes.length > 0 && (
        <Card className="border-crm-primary/20 border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Lightbulb size={16} className="text-amber-500" /> Recomendações
            </CardTitle>
          </CardHeader>
          <div className="px-4 pb-4 space-y-2">
            {health.classificacao.recomendacoes.map((rec, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-crm-primary mt-0.5">•</span>
                <p className="text-sm text-txt-primary">{rec}</p>
              </div>
            ))}
          </div>
          <div className="px-4 pb-3">
            <p className="text-[11px] text-txt-muted italic">
              {health.classificacao.razao}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
