'use client';

import { useState } from 'react';
import {
  Radar,
  Loader2,
  CheckCircle,
  Crown,
  Zap,
  Target,
  AlertTriangle,
  XCircle,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/auth';
import type { SentinelaResult, HealthClassification } from '@/types';

const DIST_CONFIG: Record<HealthClassification, {
  icon: typeof Crown;
  color: string;
  bg: string;
  label: string;
}> = {
  VIP: { icon: Crown, color: 'text-amber-600', bg: 'bg-amber-50', label: 'VIP' },
  Ativo: { icon: Zap, color: 'text-green-600', bg: 'bg-green-50', label: 'Ativo' },
  Oportunidade: { icon: Target, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Oportunidade' },
  Risco: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50', label: 'Risco' },
  Perdido: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Perdido' },
};

export function SentinelaButton() {
  const [isRunning, setIsRunning] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [result, setResult] = useState<SentinelaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { accessToken } = useAuthStore();

  const executeScan = async () => {
    setIsRunning(true);
    setShowModal(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/sentinela/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken || ''}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Erro ao executar varredura');
        return;
      }

      setResult(data.data);
    } catch {
      setError('Erro de conexão ao executar Sentinela');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        onClick={executeScan}
        disabled={isRunning}
        className="gap-2"
      >
        {isRunning ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Radar size={16} />
        )}
        {isRunning ? 'Analisando...' : 'Sentinela'}
      </Button>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
              <div className="flex items-center gap-2">
                <Radar size={20} className="text-crm-primary" />
                <h2 className="text-lg font-bold text-txt-primary">
                  {isRunning ? 'Sentinela em Ação' : result ? 'Análise Completa' : 'Erro'}
                </h2>
              </div>
              {!isRunning && (
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1 rounded-lg hover:bg-surface-100 text-txt-muted"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Conteúdo */}
            <div className="px-6 py-4">
              {/* Carregando */}
              {isRunning && (
                <div className="text-center py-8">
                  <Loader2 size={48} className="animate-spin text-crm-primary mx-auto mb-4" />
                  <p className="text-txt-primary font-medium">Analisando todos os clientes...</p>
                  <p className="text-sm text-txt-secondary mt-1">
                    Calculando métricas, scores e classificações
                  </p>
                  <div className="mt-6 w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-crm-primary rounded-full animate-pulse" style={{ width: '60%' }} />
                  </div>
                </div>
              )}

              {/* Erro */}
              {error && !isRunning && (
                <div className="text-center py-8">
                  <XCircle size={48} className="text-red-500 mx-auto mb-4" />
                  <p className="text-red-600 font-medium">{error}</p>
                  <Button
                    variant="secondary"
                    className="mt-4"
                    onClick={executeScan}
                  >
                    Tentar novamente
                  </Button>
                </div>
              )}

              {/* Resultado */}
              {result && !isRunning && (
                <div className="space-y-5">
                  {/* Resumo */}
                  <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl">
                    <CheckCircle size={24} className="text-green-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-800">
                        {result.totalProcessados} clientes analisados em {result.tempoExecucao}
                      </p>
                      {result.erros.length > 0 && (
                        <p className="text-xs text-orange-600 mt-0.5">
                          {result.erros.length} erro(s) durante processamento
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Distribuição */}
                  <div>
                    <h3 className="text-sm font-semibold text-txt-primary mb-3">
                      Distribuição da Base
                    </h3>
                    <div className="space-y-2">
                      {(Object.entries(DIST_CONFIG) as [HealthClassification, typeof DIST_CONFIG.VIP][]).map(([key, cfg]) => {
                        const count = result.distribuicao[key] || 0;
                        const pct = result.totalProcessados > 0
                          ? Math.round((count / result.totalProcessados) * 100)
                          : 0;
                        const Icon = cfg.icon;

                        return (
                          <div key={key} className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                              <Icon size={16} className={cfg.color} />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-sm text-txt-primary">{cfg.label}</span>
                                <span className="text-sm font-bold text-txt-primary">
                                  {count} <span className="text-txt-secondary font-normal">({pct}%)</span>
                                </span>
                              </div>
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    key === 'VIP' ? 'bg-amber-500' :
                                    key === 'Ativo' ? 'bg-green-500' :
                                    key === 'Oportunidade' ? 'bg-blue-500' :
                                    key === 'Risco' ? 'bg-orange-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Mudanças de Status */}
                  {result.mudancasStatus.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-txt-primary mb-3">
                        Mudanças de Status ({result.mudancasStatus.length})
                      </h3>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {result.mudancasStatus.slice(0, 20).map((m, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm p-2 bg-surface-bg rounded-lg">
                            <span className="text-txt-primary font-medium truncate flex-1">
                              {m.clienteNome}
                            </span>
                            <span className="text-txt-secondary shrink-0">{m.statusAnterior}</span>
                            <span className="text-txt-muted">→</span>
                            <span className={`font-medium shrink-0 ${
                              m.statusNovo === 'VIP' ? 'text-amber-600' :
                              m.statusNovo === 'Ativo' ? 'text-green-600' :
                              m.statusNovo === 'Oportunidade' ? 'text-blue-600' :
                              m.statusNovo === 'Risco' ? 'text-orange-600' : 'text-red-600'
                            }`}>
                              {m.statusNovo}
                            </span>
                          </div>
                        ))}
                        {result.mudancasStatus.length > 20 && (
                          <p className="text-xs text-txt-secondary text-center py-1">
                            + {result.mudancasStatus.length - 20} outras mudanças
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            {result && !isRunning && (
              <div className="px-6 py-3 border-t border-surface-border flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowModal(false)}>
                  Fechar
                </Button>
                <Button variant="primary" onClick={() => { setShowModal(false); window.location.reload(); }}>
                  Atualizar Lista
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
