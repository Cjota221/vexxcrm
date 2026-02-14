'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  Users,
  ShoppingBag,
  TrendingUp,
  AlertCircle,
  Zap
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';

const HEALTH_STATUS_CONFIG = {
  excellent: { label: 'Excelente', color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle },
  good: { label: 'Bom', color: 'text-blue-600', bg: 'bg-blue-50', icon: Activity },
  warning: { label: 'Atenção', color: 'text-yellow-600', bg: 'bg-yellow-50', icon: AlertTriangle },
  critical: { label: 'Crítico', color: 'text-red-600', bg: 'bg-red-50', icon: AlertCircle },
};

const SEVERITY_CONFIG = {
  ok: { label: 'OK', variant: 'success' as const },
  warning: { label: 'Atenção', variant: 'warning' as const },
  critical: { label: 'Crítico', variant: 'danger' as const },
};

export function SystemHealthCheck() {
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Query health check
  const { data: health, isLoading, refetch } = useQuery({
    queryKey: ['system-health'],
    queryFn: async () => {
      const response = await api.get('/maintenance/health-check');
      return response.data;
    },
    refetchInterval: 60000, // Atualiza a cada 1 minuto
  });

  // Mutation para recalcular stats
  const recalcMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/maintenance/recalc-stats');
      return response.data;
    },
    onSuccess: (data) => {
      alert(`✅ Sucesso! ${data.summary.clients_updated} clientes atualizados, ${data.summary.inconsistencies_found} inconsistências corrigidas.`);
      refetch();
    },
    onError: (error: any) => {
      alert(`❌ Erro: ${error.response?.data?.error || error.message}`);
    },
  });

  if (isLoading) {
    return (
      <Card>
        <div className="p-6">
          <div className="flex items-center gap-3">
            <RefreshCw className="animate-spin" size={20} />
            <span>Verificando saúde do sistema...</span>
          </div>
        </div>
      </Card>
    );
  }

  if (!health) {
    return null;
  }

  const statusConfig = HEALTH_STATUS_CONFIG[health.health_status];
  const StatusIcon = statusConfig.icon;

  return (
    <div className="space-y-6">
      {/* Header com Score */}
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-2xl ${statusConfig.bg} flex items-center justify-center`}>
                <StatusIcon size={32} className={statusConfig.color} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-txt-primary">Saúde do Sistema</h3>
                <p className="text-sm text-txt-secondary mt-1">
                  Score: <span className={`font-bold ${statusConfig.color}`}>{health.health_score}/100</span> - {statusConfig.label}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                Atualizar
              </Button>
              <Button
                onClick={() => recalcMutation.mutate()}
                disabled={recalcMutation.isPending}
              >
                <Zap size={16} />
                {recalcMutation.isPending ? 'Recalculando...' : 'Recalcular Stats'}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Estatísticas Gerais */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Users size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Total Clientes</p>
              <p className="text-xl font-bold text-txt-primary">{health.summary.total_clients}</p>
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
              <p className="text-xl font-bold text-txt-primary">{health.summary.total_orders}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <AlertTriangle size={20} className="text-red-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Pedidos Órfãos</p>
              <p className="text-xl font-bold text-txt-primary">{health.summary.orphan_orders}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
              <TrendingUp size={20} className="text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Inconsistências</p>
              <p className="text-xl font-bold text-txt-primary">{health.summary.inconsistent_clients}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Problemas Detectados */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pedidos Órfãos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Pedidos Órfãos</span>
              <Badge variant={SEVERITY_CONFIG[health.issues.orphans.severity].variant}>
                {SEVERITY_CONFIG[health.issues.orphans.severity].label}
              </Badge>
            </CardTitle>
          </CardHeader>
          <div className="p-6 pt-0 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-txt-secondary">Total:</span>
              <span className="font-bold text-txt-primary">{health.issues.orphans.count}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-txt-secondary">Percentual:</span>
              <span className="font-bold text-txt-primary">{health.issues.orphans.percentage}%</span>
            </div>
            {health.issues.orphans.count > 0 && (
              <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
                <p className="text-xs text-yellow-800">
                  ⚠️ {health.issues.orphans.count} pedidos sem cliente vinculado. Execute re-vinculação.
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Inconsistências */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Inconsistências</span>
              <Badge variant={SEVERITY_CONFIG[health.issues.inconsistencies.severity].variant}>
                {SEVERITY_CONFIG[health.issues.inconsistencies.severity].label}
              </Badge>
            </CardTitle>
          </CardHeader>
          <div className="p-6 pt-0 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-txt-secondary">Total:</span>
              <span className="font-bold text-txt-primary">{health.issues.inconsistencies.count}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-txt-secondary">Percentual:</span>
              <span className="font-bold text-txt-primary">{health.issues.inconsistencies.percentage}%</span>
            </div>
            {health.issues.inconsistencies.count > 0 && (
              <div className="mt-4">
                <p className="text-xs text-txt-secondary mb-2">Top 5 maiores discrepâncias:</p>
                <div className="space-y-2">
                  {health.issues.inconsistencies.top_10.slice(0, 5).map((item: any) => (
                    <div key={item.id} className="text-xs p-2 bg-surface-50 rounded">
                      <p className="font-medium text-txt-primary">{item.name || 'Sem nome'}</p>
                      <p className="text-txt-secondary">
                        Era {item.saved} → Agora {item.real} ({item.diff > 0 ? '+' : ''}{item.diff})
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Recomendações */}
      {health.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recomendações</CardTitle>
          </CardHeader>
          <div className="p-6 pt-0 space-y-3">
            {health.recommendations.map((rec: any, idx: number) => (
              <div 
                key={idx}
                className={`p-4 rounded-lg border-l-4 ${
                  rec.priority === 'high' ? 'bg-red-50 border-red-500' :
                  rec.priority === 'medium' ? 'bg-yellow-50 border-yellow-500' :
                  'bg-blue-50 border-blue-500'
                }`}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle 
                    size={20} 
                    className={
                      rec.priority === 'high' ? 'text-red-600' :
                      rec.priority === 'medium' ? 'text-yellow-600' :
                      'text-blue-600'
                    } 
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-txt-primary mb-1">
                      {rec.priority === 'high' ? '🔴 Alta Prioridade' :
                       rec.priority === 'medium' ? '🟡 Média Prioridade' :
                       '🔵 Baixa Prioridade'}
                    </p>
                    <p className="text-sm text-txt-secondary">{rec.message}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
