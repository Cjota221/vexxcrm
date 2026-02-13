'use client';

import {
  Calculator,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Loader2,
} from 'lucide-react';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TIPOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface CalculateRFMButtonProps {
  onCalculate: () => void;
  isCalculating: boolean;
  lastReport: {
    execution: {
      started_at: string;
      finished_at: string;
      duration_secs: number;
      algorithm_version: string;
    };
    stats: {
      total_processed: number;
      total_updated: number;
      total_errors: number;
      segment_changes: number;
      upgrades: number;
      downgrades: number;
    };
    distribution: Record<string, number>;
  } | null;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   COMPONENTE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function CalculateRFMButton({ onCalculate, isCalculating, lastReport }: CalculateRFMButtonProps) {
  return (
    <div className="bg-white rounded-2xl border border-surface-border shadow-sm">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-crm-primary/10 flex items-center justify-center">
              <Calculator size={20} className="text-crm-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-txt-primary">Motor RFM</h3>
              <p className="text-xs text-txt-muted">
                Calcular scores para todos os clientes
              </p>
            </div>
          </div>
        </div>

        {/* Botão principal */}
        <button
          onClick={onCalculate}
          disabled={isCalculating}
          className={`
            w-full py-3 px-6 rounded-xl font-semibold text-sm
            flex items-center justify-center gap-2
            transition-all duration-200
            ${isCalculating
              ? 'bg-crm-primary/50 text-white cursor-not-allowed'
              : 'bg-crm-primary text-white hover:bg-crm-primary-hover shadow-md hover:shadow-lg active:scale-[0.98]'
            }
          `}
        >
          {isCalculating ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Calculando RFM... Aguarde
            </>
          ) : (
            <>
              <RefreshCw size={18} />
              {lastReport ? 'Recalcular RFM' : 'Calcular RFM Agora'}
            </>
          )}
        </button>

        {/* Último relatório */}
        {lastReport && (
          <div className="mt-4 pt-4 border-t border-surface-border">
            <p className="text-xs font-medium text-txt-secondary mb-3 flex items-center gap-1">
              <CheckCircle size={12} className="text-green-500" />
              Último cálculo
            </p>

            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 rounded-lg bg-surface-50">
                <p className="text-sm font-bold text-txt-primary">{lastReport.stats.total_processed}</p>
                <p className="text-[10px] text-txt-muted">Processados</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-surface-50">
                <p className="text-sm font-bold text-txt-primary">{lastReport.stats.total_updated}</p>
                <p className="text-[10px] text-txt-muted">Atualizados</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-surface-50">
                <p className="text-sm font-bold text-txt-primary">{lastReport.stats.segment_changes}</p>
                <p className="text-[10px] text-txt-muted">Mudanças</p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-txt-muted">
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {lastReport.execution.duration_secs}s de processamento
              </span>
              <span className="flex items-center gap-1">
                {lastReport.stats.upgrades > 0 && (
                  <span className="text-green-600 flex items-center gap-0.5">
                    <ArrowUpRight size={10} /> {lastReport.stats.upgrades} upgrades
                  </span>
                )}
                {lastReport.stats.downgrades > 0 && (
                  <span className="text-red-600 flex items-center gap-0.5 ml-2">
                    <TrendingDown size={10} /> {lastReport.stats.downgrades} downgrades
                  </span>
                )}
              </span>
            </div>

            {lastReport.stats.total_errors > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-orange-600 bg-orange-50 rounded-lg p-2">
                <AlertCircle size={12} />
                {lastReport.stats.total_errors} erros durante o cálculo
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
