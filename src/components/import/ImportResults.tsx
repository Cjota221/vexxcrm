'use client';

import { CheckCircle, AlertTriangle, Users, UserPlus, Sparkles, XCircle, Download, RotateCcw } from 'lucide-react';

interface ImportStats {
  total: number;
  merged: number;
  created: number;
  enriched: number;
  skipped: number;
  errors: number;
}

interface ImportDetail {
  row: number;
  name?: string;
  phone?: string;
  action: 'created' | 'merged' | 'enriched' | 'skipped' | 'error';
  reason?: string;
}

interface ImportResultsProps {
  stats: ImportStats;
  details: ImportDetail[];
  onReset: () => void;
}

/**
 * Painel de resultados da importação com métricas e detalhes.
 */
export function ImportResults({ stats, details, onReset }: ImportResultsProps) {
  const hasErrors = stats.errors > 0;
  const successRate =
    stats.total > 0 ? (((stats.created + stats.merged + stats.enriched) / stats.total) * 100).toFixed(1) : '0';

  const metricCards = [
    {
      label: 'Linhas Processadas',
      value: stats.total,
      icon: Users,
      color: 'text-slate-600',
      bg: 'bg-slate-50',
    },
    {
      label: 'Clientes Atualizados',
      value: stats.merged,
      icon: CheckCircle,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      desc: 'Deduplicados (CPF/Telefone)',
    },
    {
      label: 'Novos Clientes',
      value: stats.created,
      icon: UserPlus,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'Enriquecidos',
      value: stats.enriched,
      icon: Sparkles,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      desc: 'Campos novos preenchidos',
    },
    {
      label: 'Ignorados',
      value: stats.skipped,
      icon: AlertTriangle,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      desc: 'Sem telefone/nome',
    },
    {
      label: 'Erros',
      value: stats.errors,
      icon: XCircle,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
  ];

  const downloadCSVReport = () => {
    const header = 'Linha,Nome,Telefone,Ação,Motivo\n';
    const rows = details
      .map(
        (d) =>
          `${d.row},"${d.name || ''}","${d.phone || ''}","${d.action}","${d.reason || ''}"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `importacao-resultado-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Success Banner */}
      <div
        className={`flex items-center gap-3 p-4 rounded-2xl border ${
          hasErrors
            ? 'bg-amber-50 border-amber-200'
            : 'bg-green-50 border-green-200'
        }`}
      >
        {hasErrors ? (
          <AlertTriangle size={24} className="text-amber-500" />
        ) : (
          <CheckCircle size={24} className="text-green-500" />
        )}
        <div>
          <p className="text-sm font-semibold text-txt-primary">
            {hasErrors
              ? 'Importação concluída com alertas'
              : 'Importação concluída com sucesso!'}
          </p>
          <p className="text-xs text-txt-muted mt-0.5">
            Taxa de sucesso: {successRate}% — {stats.merged + stats.created + stats.enriched} de {stats.total} linhas processadas
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {metricCards.map((card) => (
          <div
            key={card.label}
            className={`${card.bg} p-4 rounded-xl border border-transparent`}
          >
            <div className="flex items-center gap-2 mb-1">
              <card.icon size={16} className={card.color} />
              <span className={`text-lg font-bold ${card.color}`}>{card.value}</span>
            </div>
            <p className="text-xs font-medium text-txt-primary">{card.label}</p>
            {card.desc && <p className="text-[11px] text-txt-muted mt-0.5">{card.desc}</p>}
          </div>
        ))}
      </div>

      {/* Detail table */}
      {details.length > 0 && (
        <div className="border border-slate-100 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between p-3 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-semibold text-txt-primary">
              Detalhes ({Math.min(details.length, 100)} primeiras linhas)
            </p>
            <button
              onClick={downloadCSVReport}
              className="flex items-center gap-1.5 text-xs text-crm-primary hover:underline"
            >
              <Download size={12} /> Baixar relatório
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-txt-muted font-medium">Linha</th>
                  <th className="text-left px-3 py-2 text-txt-muted font-medium">Nome</th>
                  <th className="text-left px-3 py-2 text-txt-muted font-medium">Telefone</th>
                  <th className="text-left px-3 py-2 text-txt-muted font-medium">Ação</th>
                  <th className="text-left px-3 py-2 text-txt-muted font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {details.map((d, i) => (
                  <tr key={i} className="border-t border-slate-50 hover:bg-slate-50/50">
                    <td className="px-3 py-2 text-txt-muted">{d.row}</td>
                    <td className="px-3 py-2 text-txt-primary">{d.name || '—'}</td>
                    <td className="px-3 py-2 text-txt-muted font-mono">{d.phone || '—'}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          d.action === 'created'
                            ? 'bg-green-100 text-green-700'
                            : d.action === 'merged'
                            ? 'bg-blue-100 text-blue-700'
                            : d.action === 'enriched'
                            ? 'bg-amber-100 text-amber-700'
                            : d.action === 'error'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {d.action === 'created'
                          ? 'Novo'
                          : d.action === 'merged'
                          ? 'Atualizado'
                          : d.action === 'enriched'
                          ? 'Enriquecido'
                          : d.action === 'error'
                          ? 'Erro'
                          : 'Ignorado'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-txt-muted max-w-50 truncate">
                      {d.reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-center gap-3 pt-2">
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-txt-primary hover:bg-slate-50 transition-colors"
        >
          <RotateCcw size={14} />
          Nova Importação
        </button>
      </div>
    </div>
  );
}
