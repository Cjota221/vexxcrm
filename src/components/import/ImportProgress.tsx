'use client';

import { Loader2 } from 'lucide-react';

interface ImportProgressProps {
  /** 0 a 100 */
  progress: number;
  /** Mensagem de status (ex: "Processando lote 3 de 12...") */
  statusMessage?: string;
  /** Se o processamento está ativo */
  isProcessing: boolean;
}

/**
 * Barra de progresso animada para processamento de importação.
 */
export function ImportProgress({ progress, statusMessage, isProcessing }: ImportProgressProps) {
  if (!isProcessing) return null;

  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className="space-y-4 p-6 bg-white border border-slate-100 rounded-2xl">
      <div className="flex items-center gap-3">
        <Loader2 size={20} className="text-crm-primary animate-spin" />
        <p className="text-sm font-medium text-txt-primary">Processando importação...</p>
      </div>

      {/* Barra de progresso */}
      <div className="relative w-full h-3 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-crm-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${clampedProgress}%` }}
        />
        {/* Shimmer overlay */}
        {clampedProgress < 100 && (
          <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/30 to-transparent animate-pulse" />
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-txt-muted">
          {statusMessage || 'Analisando dados e deduplicando...'}
        </p>
        <span className="text-xs font-semibold text-crm-primary">
          {clampedProgress.toFixed(0)}%
        </span>
      </div>

      <p className="text-[11px] text-txt-muted text-center">
        Não feche esta página. O processamento pode levar alguns minutos para arquivos grandes.
      </p>
    </div>
  );
}
