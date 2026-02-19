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
  ChevronDown,
  ChevronUp,
  TrendingDown,
  DollarSign,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import type { SentinelaResult, HealthClassification } from '@/types';

const DIST_CONFIG: Record<HealthClassification, {
  icon: typeof Crown;
  color: string;
  bg: string;
  barColor: string;
  label: string;
}> = {
  VIP:          { icon: Crown,          color: 'text-amber-600',  bg: 'bg-amber-50',  barColor: 'bg-amber-500',  label: 'VIP' },
  Ativo:        { icon: Zap,            color: 'text-green-600',  bg: 'bg-green-50',  barColor: 'bg-green-500',  label: 'Ativo' },
  Oportunidade: { icon: Target,         color: 'text-blue-600',   bg: 'bg-blue-50',   barColor: 'bg-blue-500',   label: 'Oportunidade' },
  Risco:        { icon: AlertTriangle,  color: 'text-orange-600', bg: 'bg-orange-50', barColor: 'bg-orange-500', label: 'Risco' },
  Perdido:      { icon: XCircle,        color: 'text-red-600',    bg: 'bg-red-50',    barColor: 'bg-red-500',    label: 'Perdido' },
};

function formatCurrency(value: number): string {
  if (!value || value === 0) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function SentinelaButton() {
  const [isRunning, setIsRunning] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [result, setResult] = useState<SentinelaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [showVips, setShowVips] = useState(true);
  const [showMudancas, setShowMudancas] = useState(true);
  const [progress, setProgress] = useState(0);

  const executeScan = async () => {
    setIsRunning(true);
    setShowModal(true);
    setResult(null);
    setError(null);
    setProgress(0);

    // Progresso incremental (real via SSE pode ser adicionado futuramente)
    const progressTimer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) { clearInterval(progressTimer); return 90; }
        const increment = prev < 40 ? 8 : prev < 70 ? 4 : 1;
        return Math.min(prev + increment, 90);
      });
    }, 600);

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        // Tentar refresh da sessão antes de desistir
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshed?.session?.access_token) {
          setError('Sessão expirada. Recarregue a página e tente novamente.');
          return;
        }
      }

      // Pegar token atualizado após possível refresh
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const token = currentSession?.access_token;

      if (!token) {
        setError('Não foi possível obter token de autenticação. Faça login novamente.');
        return;
      }

      const res = await fetch('/api/sentinela/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      clearInterval(progressTimer);
      setProgress(100);

      if (!res.ok) {
        setError(data.error || 'Erro ao executar varredura');
        return;
      }

      setResult(data.data);
    } catch {
      clearInterval(progressTimer);
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <Radar size={20} className="text-crm-primary" />
                <h2 className="text-lg font-bold text-txt-primary">
                  {isRunning ? 'Sentinela em Ação…' : result ? 'Análise Completa' : 'Sentinela'}
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

              {/* ── CARREGANDO ── */}
              {isRunning && (
                <div className="text-center py-8">
                  <Radar size={48} className="text-crm-primary mx-auto mb-4 animate-pulse" />
                  <p className="text-txt-primary font-medium">Analisando todos os clientes…</p>
                  <p className="text-sm text-txt-secondary mt-1">
                    Calculando LTV, scores e classificações
                  </p>
                  <div className="mt-6 w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-full bg-crm-primary rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-txt-muted mt-2">{progress}%</p>
                </div>
              )}

              {/* ── ERRO ── */}
              {error && !isRunning && (
                <div className="text-center py-8">
                  <XCircle size={48} className="text-red-500 mx-auto mb-4" />
                  <p className="text-red-600 font-medium">{error}</p>
                  <Button variant="secondary" className="mt-4" onClick={executeScan}>
                    Tentar novamente
                  </Button>
                </div>
              )}

              {/* ── RESULTADO ── */}
              {result && !isRunning && (
                <div className="space-y-5">

                  {/* Resumo */}
                  <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl">
                    <CheckCircle size={24} className="text-green-600 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-800">
                        {result.totalProcessados} clientes analisados em {result.tempoExecucao}
                      </p>
                      {result.ltvMedioBase > 0 && (
                        <p className="text-xs text-green-700 mt-0.5 flex items-center gap-1">
                          <DollarSign size={12} />
                          LTV médio da base: <strong className="ml-0.5">{formatCurrency(result.ltvMedioBase)}</strong>
                        </p>
                      )}
                      {result.erros.length > 0 && (
                        <button
                          onClick={() => setShowErrors(v => !v)}
                          className="flex items-center gap-1 text-xs text-orange-600 mt-1 hover:text-orange-800"
                        >
                          <AlertTriangle size={12} />
                          {result.erros.length} erro(s) — ver detalhes
                          {showErrors ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Lista de erros expandível */}
                  {showErrors && result.erros.length > 0 && (
                    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                      <p className="text-xs font-semibold text-orange-700 mb-2">Detalhes dos erros:</p>
                      <ul className="space-y-1 max-h-32 overflow-y-auto">
                        {result.erros.map((e, i) => (
                          <li key={i} className="text-xs text-orange-800 font-mono bg-white rounded px-2 py-1">
                            {e}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Distribuição */}
                  <div>
                    <h3 className="text-sm font-semibold text-txt-primary mb-3">Distribuição da Base</h3>
                    {result.totalProcessados === 0 ? (
                      <p className="text-sm text-txt-muted text-center py-4">Sem dados suficientes</p>
                    ) : (
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
                                    className={`h-full rounded-full transition-all duration-700 ${cfg.barColor}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* ── VIP EM RISCO ── */}
                  {result.vipsEmRisco && result.vipsEmRisco.length > 0 && (
                    <div>
                      <button
                        onClick={() => setShowVips(v => !v)}
                        className="w-full flex items-center justify-between text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 hover:bg-red-100 transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <TrendingDown size={16} />
                          VIP em Risco ({result.vipsEmRisco.length})
                        </span>
                        {showVips ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                      {showVips && (
                        <div className="mt-2 space-y-2 max-h-52 overflow-y-auto">
                          {result.vipsEmRisco.slice(0, 10).map((v, i) => (
                            <div key={i} className="border border-red-100 bg-red-50/50 rounded-xl p-3 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-txt-primary truncate max-w-[55%]">
                                  {v.clienteNome}
                                </span>
                                <div className="flex items-center gap-3 text-xs text-txt-secondary shrink-0">
                                  <span className="flex items-center gap-1">
                                    <Clock size={11} />
                                    {v.diasInatividade}d sem compra
                                  </span>
                                  <span className="flex items-center gap-1 font-medium text-amber-700">
                                    <DollarSign size={11} />
                                    {formatCurrency(v.ltv)}
                                  </span>
                                </div>
                              </div>
                              {v.ticketMedio > 0 && (
                                <p className="text-xs text-txt-muted">
                                  Ticket médio: {formatCurrency(v.ticketMedio)}
                                </p>
                              )}
                              {v.logInteligencia && (
                                <p className="text-xs text-red-700 italic border-t border-red-100 pt-1 mt-1">
                                  {v.logInteligencia}
                                </p>
                              )}
                            </div>
                          ))}
                          {result.vipsEmRisco.length > 10 && (
                            <p className="text-xs text-txt-secondary text-center py-1">
                              + {result.vipsEmRisco.length - 10} outros VIPs em risco
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── MUDANÇAS DE STATUS ── */}
                  {result.mudancasStatus.length > 0 ? (
                    <div>
                      <button
                        onClick={() => setShowMudancas(v => !v)}
                        className="w-full flex items-center justify-between text-sm font-semibold text-txt-primary mb-2"
                      >
                        <span>Mudanças de Status ({result.mudancasStatus.length})</span>
                        {showMudancas ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                      {showMudancas && (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {result.mudancasStatus.slice(0, 20).map((m, i) => (
                            <div key={i} className="p-2.5 bg-surface-bg rounded-xl space-y-1">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-txt-primary font-medium truncate flex-1">
                                  {m.clienteNome}
                                </span>
                                <span className="text-txt-secondary shrink-0 text-xs">{m.statusAnterior}</span>
                                <span className="text-txt-muted text-xs">→</span>
                                <span className={`font-semibold shrink-0 text-xs ${
                                  m.statusNovo === 'VIP'          ? 'text-amber-600'  :
                                  m.statusNovo === 'Ativo'        ? 'text-green-600'  :
                                  m.statusNovo === 'Oportunidade' ? 'text-blue-600'   :
                                  m.statusNovo === 'Risco'        ? 'text-orange-600' : 'text-red-600'
                                }`}>
                                  {m.statusNovo}
                                </span>
                              </div>
                              {m.logInteligencia && (
                                <p className="text-xs text-txt-muted italic pl-0.5">
                                  {m.logInteligencia}
                                </p>
                              )}
                            </div>
                          ))}
                          {result.mudancasStatus.length > 20 && (
                            <p className="text-xs text-txt-secondary text-center py-1">
                              + {result.mudancasStatus.length - 20} outras mudanças
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-3 bg-surface-bg rounded-xl">
                      <CheckCircle size={20} className="text-green-500 mx-auto mb-1" />
                      <p className="text-sm text-txt-secondary">
                        Nenhuma mudança de status — base estável
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            {result && !isRunning && (
              <div className="px-6 py-3 border-t border-surface-border flex justify-end gap-2 sticky bottom-0 bg-white">
                <Button variant="ghost" onClick={() => setShowModal(false)}>
                  Fechar
                </Button>
                <Button
                  variant="primary"
                  onClick={() => { setShowModal(false); window.location.reload(); }}
                >
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
