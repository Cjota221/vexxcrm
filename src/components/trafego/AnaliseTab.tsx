'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import { CheckCircle, Loader2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch, brl } from '@/components/trafego/trafegoUtils';

interface AcaoPendente {
  id: string;
  agent: string;
  action_type: string;
  alvo_nome?: string;
  motivo: string;
  urgencia: string;
  status: string;
  created_at: string;
}

export function AnaliseTab() {
  const [loading, setLoading]           = useState(true);
  const [analisando, setAnalisando]     = useState(false);
  const [acoes, setAcoes]               = useState<AcaoPendente[]>([]);
  const [analise, setAnalise]           = useState<{
    resumo_executivo?: string;
    situacao_geral?: string;
    metricas_consolidadas?: {
      gasto_total: number; retorno_total: number; roas_medio: number;
      leads_total: number; cpl_medio: number; campanhas_ativas: number; campanhas_problemas: number;
    };
  } | null>(null);
  const [aprovando, setAprovando]       = useState<string | null>(null);
  const [feedback, setFeedback]         = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/ai-team/analise-performance');
      if (res.ok) {
        const json = await res.json() as {
          ultima_analise?: { analyst_output?: typeof analise };
          acoes_pendentes?: AcaoPendente[];
        };
        setAcoes(json.acoes_pendentes || []);
        setAnalise(json.ultima_analise?.analyst_output || null);
      }
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function handleAnalisar() {
    setAnalisando(true);
    try {
      const res = await authFetch('/api/ai-team/analise-performance', { method: 'POST' });
      const json = await res.json() as { ok?: boolean; analise?: typeof analise; error?: string };
      if (json.ok && json.analise) {
        setAnalise(json.analise);
        await carregar();
        setFeedback('Análise concluída! Ações adicionadas à fila de aprovação.');
        setTimeout(() => setFeedback(null), 5000);
      } else {
        setFeedback(json.error || 'Erro ao analisar campanhas');
        setTimeout(() => setFeedback(null), 5000);
      }
    } catch (e) {
      setFeedback(String(e));
    } finally {
      setAnalisando(false);
    }
  }

  async function handleAprovar(id: string, aprovar: boolean) {
    setAprovando(id);
    try {
      const token = useAuthStore.getState().accessToken;
      const res = await fetch(`/api/ai-team/actions/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: aprovar ? 'approved' : 'rejected' }),
      });
      if (res.ok) {
        setAcoes(prev => prev.filter(a => a.id !== id));
        setFeedback(aprovar ? 'Ação aprovada!' : 'Ação rejeitada.');
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch { /* silencioso */ }
    finally { setAprovando(null); }
  }

  const situacaoColor = {
    otima:   'text-green-700 bg-green-50 border-green-200',
    boa:     'text-blue-700 bg-blue-50 border-blue-200',
    atencao: 'text-amber-700 bg-amber-50 border-amber-200',
    critica: 'text-red-700 bg-red-50 border-red-200',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900">Análise de Performance</h2>
          <p className="text-xs text-gray-400 mt-0.5">José analisa suas campanhas e identifica oportunidades</p>
        </div>
        <button
          onClick={handleAnalisar}
          disabled={analisando}
          className="flex items-center gap-2 px-4 py-2 bg-crm-primary text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          {analisando ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          {analisando ? 'Analisando...' : 'Analisar agora'}
        </button>
      </div>

      {feedback && (
        <div className={cn(
          'rounded-xl px-4 py-3 text-sm flex items-center gap-2',
          feedback.includes('Erro') || feedback.includes('erro')
            ? 'bg-red-50 border border-red-200 text-red-800'
            : 'bg-green-50 border border-green-200 text-green-800'
        )}>
          {feedback}
        </div>
      )}

      {loading && (
        <div className="text-center py-12 text-gray-400 text-sm">
          <Loader2 size={24} className="animate-spin mx-auto mb-2" />
          Carregando análise...
        </div>
      )}

      {/* Resumo do José */}
      {!loading && analise && (
        <div className={cn(
          'rounded-2xl border p-5',
          situacaoColor[(analise.situacao_geral as keyof typeof situacaoColor) || 'boa']
        )}>
          <div className="flex items-start gap-3">
            <span className="text-2xl">👨</span>
            <div>
              <div className="font-semibold text-sm mb-1">José analisou suas campanhas:</div>
              <p className="text-sm leading-relaxed">{analise.resumo_executivo || 'Sem análise disponível ainda.'}</p>
            </div>
          </div>
          {analise.metricas_consolidadas && (
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-current/20">
              <div className="text-center">
                <div className="font-bold text-lg">{brl(analise.metricas_consolidadas.gasto_total)}</div>
                <div className="text-xs opacity-70">Investido</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-lg">{analise.metricas_consolidadas.roas_medio.toFixed(1)}x</div>
                <div className="text-xs opacity-70">ROAS médio</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-lg">{analise.metricas_consolidadas.campanhas_problemas}</div>
                <div className="text-xs opacity-70">Com problema</div>
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && !analise && (
        <div className="text-center py-8 bg-gray-50 rounded-2xl border border-gray-100">
          <Zap size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Nenhuma análise realizada ainda</p>
          <p className="text-gray-400 text-xs mt-1">Clique em &quot;Analisar agora&quot; para o José verificar suas campanhas</p>
        </div>
      )}

      {/* Fila de aprovação */}
      {!loading && acoes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Ações aguardando aprovação ({acoes.length})
          </h3>
          <div className="space-y-3">
            {acoes.map((acao) => (
              <div
                key={acao.id}
                className={cn(
                  'rounded-2xl border p-4',
                  acao.urgencia === 'imediata' ? 'bg-red-50 border-red-200' :
                  'bg-amber-50 border-amber-200'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900">
                        {acao.alvo_nome || 'Campanha'}
                      </span>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium',
                        acao.urgencia === 'imediata' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      )}>
                        {acao.urgencia === 'imediata' ? '🔴 Urgente' :
                         acao.urgencia === 'proximas_24h' ? '🟡 Hoje' : '🟢 Esta semana'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{acao.motivo}</p>
                    <p className="text-xs text-gray-400 mt-1">Sugerido por: {acao.agent}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleAprovar(acao.id, false)}
                      disabled={aprovando === acao.id}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-100 disabled:opacity-50"
                    >
                      Rejeitar
                    </button>
                    <button
                      onClick={() => handleAprovar(acao.id, true)}
                      disabled={aprovando === acao.id}
                      className="px-3 py-1.5 rounded-lg bg-crm-primary text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
                    >
                      {aprovando === acao.id ? <Loader2 size={11} className="animate-spin" /> : null}
                      Aprovar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && acoes.length === 0 && analise && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 flex items-center gap-2">
          <CheckCircle size={16} />
          Nenhuma ação pendente — tudo em ordem!
        </div>
      )}
    </div>
  );
}
