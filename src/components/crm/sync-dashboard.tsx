'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Database,
  Users,
  ShoppingCart,
  Package,
  AlertTriangle,
  CheckCircle,
  Clock,
  Play,
  Search,
  Link2,
  Activity,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';

/* ───────── Types ───────── */

interface SyncStats {
  total_clients: number;
  total_orders: number;
  total_products: number;
  orphan_orders: number;
  last_sync: string | null;
  data_quality_score: number;
}

interface SyncExecution {
  id: string;
  sync_type: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  total_records: number;
  records_processed: number;
  records_failed: number;
  integrity_check: Record<string, unknown> | null;
  error_log: unknown[] | null;
}

type ActionStatus = 'idle' | 'loading' | 'success' | 'error';

interface ActionState {
  status: ActionStatus;
  result?: unknown;
  error?: string;
}

/* ───────── API Helper ───────── */

async function apiCall(endpoint: string, token: string, method = 'GET', body?: unknown) {
  const res = await fetch(`/api/facilzap/sync-admin/${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

/* ───────── Component ───────── */

export function SyncDashboard() {
  const { accessToken } = useAuthStore();
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [executions, setExecutions] = useState<SyncExecution[]>([]);
  const [loading, setLoading] = useState(true);

  const [syncAction, setSyncAction] = useState<ActionState>({ status: 'idle' });
  const [auditAction, setAuditAction] = useState<ActionState>({ status: 'idle' });
  const [repairAction, setRepairAction] = useState<ActionState>({ status: 'idle' });

  // ─── Load data ───
  const loadData = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const [statsRes, execRes] = await Promise.all([
        apiCall('stats', accessToken),
        apiCall('executions', accessToken),
      ]);
      setStats(statsRes.data);
      setExecutions(execRes.data || []);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Actions ───
  const runFullSync = async () => {
    if (!accessToken) return;
    setSyncAction({ status: 'loading' });
    try {
      const res = await apiCall('full-sync', accessToken, 'POST', {});
      setSyncAction({ status: 'success', result: res.data });
      loadData();
    } catch (err: unknown) {
      setSyncAction({ status: 'error', error: (err as Error).message });
    }
  };

  const runAudit = async () => {
    if (!accessToken) return;
    setAuditAction({ status: 'loading' });
    try {
      const res = await apiCall('audit', accessToken, 'POST', { mode: 'full' });
      setAuditAction({ status: 'success', result: res.data });
      loadData();
    } catch (err: unknown) {
      setAuditAction({ status: 'error', error: (err as Error).message });
    }
  };

  const runRepairOrphans = async () => {
    if (!accessToken) return;
    setRepairAction({ status: 'loading' });
    try {
      const res = await apiCall('repair-orphans', accessToken, 'POST', { createMissingClients: true });
      setRepairAction({ status: 'success', result: res.data });
      loadData();
    } catch (err: unknown) {
      setRepairAction({ status: 'error', error: (err as Error).message });
    }
  };

  // ─── Quality color ───
  const qualityColor = (score: number) => {
    if (score >= 95) return 'text-emerald-600';
    if (score >= 80) return 'text-amber-600';
    return 'text-red-600';
  };

  const qualityBg = (score: number) => {
    if (score >= 95) return 'bg-emerald-50 border-emerald-200';
    if (score >= 80) return 'bg-amber-50 border-amber-200';
    return 'bg-red-50 border-red-200';
  };

  if (!accessToken) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Faça login para acessar o painel de engenharia de dados
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Database className="w-7 h-7 text-[#1e3a5f]" />
            Engenharia de Dados
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Sync resiliente, auditoria forense e reparo automático
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <StatsSection stats={stats} loading={loading} qualityColor={qualityColor} qualityBg={qualityBg} />

      <ActionsSection
        syncAction={syncAction}
        auditAction={auditAction}
        repairAction={repairAction}
        onSync={runFullSync}
        onAudit={runAudit}
        onRepair={runRepairOrphans}
      />

      <ExecutionsSection executions={executions} />
    </div>
  );
}

/* ───────── Sub Components ───────── */

function StatCard({
  icon,
  label,
  value,
  bgColor,
  alert,
}: {
  icon: React.ReactNode;
  label: string;
  value?: number | null;
  bgColor: string;
  alert?: boolean;
}) {
  return (
    <div className={`${bgColor} rounded-xl p-4 border border-gray-100`}>
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className={`text-xl font-bold ${alert ? 'text-amber-600' : 'text-gray-800'}`}>
            {(value ?? 0).toLocaleString('pt-BR')}
          </p>
        </div>
      </div>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  description,
  onClick,
  state,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  state: ActionState;
  color: 'blue' | 'purple' | 'amber';
}) {
  const colorMap = {
    blue: 'bg-blue-600 hover:bg-blue-700',
    purple: 'bg-purple-600 hover:bg-purple-700',
    amber: 'bg-amber-600 hover:bg-amber-700',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h4 className="font-semibold text-gray-800 flex items-center gap-2 mb-1">
        {icon} {title}
      </h4>
      <p className="text-xs text-gray-500 mb-4">{description}</p>
      <button
        onClick={onClick}
        disabled={state.status === 'loading'}
        className={`w-full py-2 px-4 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${colorMap[color]}`}
      >
        {state.status === 'loading' ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Executando...
          </>
        ) : state.status === 'success' ? (
          <>
            <CheckCircle className="w-4 h-4" />
            Concluído!
          </>
        ) : state.status === 'error' ? (
          <>
            <AlertTriangle className="w-4 h-4" />
            Erro — Tentar novamente
          </>
        ) : (
          <>
            <TrendingUp className="w-4 h-4" />
            Executar
          </>
        )}
      </button>
      {state.status === 'error' && state.error && (
        <p className="mt-2 text-xs text-red-500">{state.error}</p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: '✅ Sucesso' },
    running: { bg: 'bg-blue-100', text: 'text-blue-700', label: '🔄 Rodando' },
    failed: { bg: 'bg-red-100', text: 'text-red-700', label: '❌ Falhou' },
    partial: { bg: 'bg-amber-100', text: 'text-amber-700', label: '⚠️ Parcial' },
  };

  const c = config[status] || { bg: 'bg-gray-100', text: 'text-gray-700', label: status };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function ResultPanel({ title, data }: { title: string; data: Record<string, unknown> }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h4 className="font-semibold text-gray-800 mb-3">{title}</h4>
      <pre className="bg-gray-50 rounded-lg p-4 text-xs text-gray-700 overflow-x-auto max-h-60 overflow-y-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function StatsSection({
  stats,
  loading,
  qualityColor,
  qualityBg,
}: {
  stats: SyncStats | null;
  loading: boolean;
  qualityColor: (score: number) => string;
  qualityBg: (score: number) => string;
}) {
  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }
  if (!stats) return null;
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="w-5 h-5 text-blue-600" />}
          label="Clientes"
          value={stats.total_clients}
          bgColor="bg-blue-50"
        />
        <StatCard
          icon={<ShoppingCart className="w-5 h-5 text-purple-600" />}
          label="Pedidos"
          value={stats.total_orders}
          bgColor="bg-purple-50"
        />
        <StatCard
          icon={<Package className="w-5 h-5 text-green-600" />}
          label="Produtos"
          value={stats.total_products}
          bgColor="bg-green-50"
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5 text-amber-600" />}
          label="Órfãos"
          value={stats.orphan_orders}
          bgColor="bg-amber-50"
          alert={stats.orphan_orders > 0}
        />
      </div>

      <div className={`border rounded-xl p-6 ${qualityBg(stats.data_quality_score)}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-600">Score de Qualidade de Dados</h3>
            <p className={`text-4xl font-bold mt-1 ${qualityColor(stats.data_quality_score)}`}>
              {stats.data_quality_score.toFixed(1)}%
            </p>
          </div>
          <div className="text-right text-sm text-gray-500">
            {stats.last_sync ? (
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                Último sync: {new Date(stats.last_sync).toLocaleString('pt-BR')}
              </div>
            ) : (
              <span>Nenhum sync realizado</span>
            )}
          </div>
        </div>

        <div className="mt-4 w-full bg-white/60 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${
              stats.data_quality_score >= 95
                ? 'bg-emerald-500'
                : stats.data_quality_score >= 80
                  ? 'bg-amber-500'
                  : 'bg-red-500'
            }`}
            style={{ width: `${Math.min(100, stats.data_quality_score)}%` }}
          />
        </div>
      </div>
    </>
  );
}

function ActionsSection({
  syncAction,
  auditAction,
  repairAction,
  onSync,
  onAudit,
  onRepair,
}: {
  syncAction: ActionState;
  auditAction: ActionState;
  repairAction: ActionState;
  onSync: () => void;
  onAudit: () => void;
  onRepair: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ActionCard
          icon={<Play className="w-5 h-5" />}
          title="Sync Completo"
          description="Sync resiliente com paginação, retry e checkpoints"
          onClick={onSync}
          state={syncAction}
          color="blue"
        />
        <ActionCard
          icon={<Search className="w-5 h-5" />}
          title="Auditoria Forense"
          description="Checksum completo: API FacilZap vs banco local"
          onClick={onAudit}
          state={auditAction}
          color="purple"
        />
        <ActionCard
          icon={<Link2 className="w-5 h-5" />}
          title="Reparar Órfãos"
          description="Re-vincular pedidos + auto-criar clientes"
          onClick={onRepair}
          state={repairAction}
          color="amber"
        />
      </div>

      {syncAction.status === 'success' && syncAction.result ? (
        <ResultPanel title="Resultado do Sync" data={syncAction.result as Record<string, unknown>} />
      ) : null}
      {auditAction.status === 'success' && auditAction.result ? (
        <ResultPanel title="Resultado da Auditoria" data={auditAction.result as Record<string, unknown>} />
      ) : null}
      {repairAction.status === 'success' && repairAction.result ? (
        <ResultPanel title="Resultado do Reparo" data={repairAction.result as Record<string, unknown>} />
      ) : null}
    </div>
  );
}

function ExecutionsSection({ executions }: { executions: SyncExecution[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <Activity className="w-5 h-5 text-gray-600" />
        <h3 className="font-semibold text-gray-800">Histórico de Execuções</h3>
      </div>
      {executions.length === 0 ? (
        <div className="px-6 py-8 text-center text-gray-400">
          Nenhuma execução registrada ainda
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-gray-600 font-medium">Tipo</th>
                <th className="px-4 py-3 text-left text-gray-600 font-medium">Status</th>
                <th className="px-4 py-3 text-left text-gray-600 font-medium">Início</th>
                <th className="px-4 py-3 text-right text-gray-600 font-medium">Registros</th>
                <th className="px-4 py-3 text-right text-gray-600 font-medium">Erros</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {executions.slice(0, 15).map((exec) => (
                <tr key={exec.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {exec.sync_type === 'full' ? '🔄 Full Sync' :
                     exec.sync_type === 'incremental' ? '📥 Incremental' :
                     exec.sync_type}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={exec.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(exec.started_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {exec.records_processed}/{exec.total_records}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={exec.records_failed > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}>
                      {exec.records_failed}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
