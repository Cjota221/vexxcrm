'use client';

import { useState } from 'react';
import { Loader2, Plus, RefreshCw, X, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch, formatDateTime } from '@/components/trafego/trafegoUtils';

interface AutoRule {
  id: string; nome: string; ativa: boolean;
  condicao: { metrica: string; operador: string; valor: number; janela_dias: number };
  acao: { tipo: string; incremento_pct?: number };
  vezes_executada: number; ultima_execucao?: string;
}

const METRICA_LABELS: Record<string, string> = {
  cpl: 'CPL (custo por lead)', roas: 'ROAS', ctr: 'CTR (%)',
  cpm: 'CPM', frequencia: 'Frequência', gasto: 'Gasto diário (R$)',
};
const ACAO_LABELS: Record<string, string> = {
  pausar_campanha:  'Pausar campanha',
  escalar_orcamento: 'Escalar orçamento',
  notificar:        'Notificar (sem ação)',
};

export function RulesPanel() {
  const [rules, setRules]       = useState<AutoRule[]>([]);
  const [loading, setLoading]   = useState(false);
  const [loaded, setLoaded]     = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Form state
  const [nome, setNome]           = useState('');
  const [metrica, setMetrica]     = useState<string>('cpl');
  const [operador, setOperador]   = useState<string>('maior_que');
  const [valor, setValor]         = useState('');
  const [janela, setJanela]       = useState('2');
  const [acao, setAcao]           = useState<string>('pausar_campanha');
  const [incremento, setIncremento] = useState('20');

  async function loadRules() {
    setLoading(true);
    try {
      const res = await authFetch('/api/trafego/rules');
      if (res.ok) { const j = await res.json() as { rules: AutoRule[] }; setRules(j.rules || []); setLoaded(true); }
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }

  async function toggleRule(rule: AutoRule) {
    const res = await authFetch('/api/trafego/rules', {
      method: 'PATCH',
      body: JSON.stringify({ id: rule.id, ativa: !rule.ativa }),
    });
    if (res.ok) setRules(prev => prev.map(r => r.id === rule.id ? { ...r, ativa: !r.ativa } : r));
  }

  async function deleteRule(id: string) {
    const res = await authFetch(`/api/trafego/rules?id=${id}`, { method: 'DELETE' });
    if (res.ok) setRules(prev => prev.filter(r => r.id !== id));
  }

  async function saveRule() {
    if (!nome.trim() || !valor) { setFeedback('Preencha todos os campos'); return; }
    setSaving(true); setFeedback(null);
    try {
      const res = await authFetch('/api/trafego/rules', {
        method: 'POST',
        body: JSON.stringify({
          nome: nome.trim(), ativa: true,
          condicao: { metrica, operador, valor: parseFloat(valor), janela_dias: parseInt(janela) || 1 },
          acao: { tipo: acao, ...(acao === 'escalar_orcamento' ? { incremento_pct: parseFloat(incremento) / 100 } : {}) },
        }),
      });
      const j = await res.json() as { ok?: boolean; rule?: AutoRule; error?: string };
      if (j.ok && j.rule) {
        setRules(prev => [j.rule!, ...prev]);
        setFeedback('✅ Regra criada!');
        setShowForm(false); setNome(''); setValor('');
      } else { setFeedback(j.error || 'Erro ao salvar'); }
    } catch (e) { setFeedback(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900">Regras automáticas</h2>
          <p className="text-xs text-gray-500 mt-0.5">Pausar, escalar ou notificar quando métricas atingirem limites</p>
        </div>
        <div className="flex gap-2">
          {!loaded && (
            <button onClick={loadRules} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 disabled:opacity-50">
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {loading ? 'Carregando...' : 'Carregar regras'}
            </button>
          )}
          {loaded && (
            <button onClick={() => setShowForm(f => !f)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">
              <Plus size={12} /> Nova regra
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className={cn('px-4 py-3 rounded-xl text-sm border',
          feedback.startsWith('✅') ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800')}>
          {feedback}
          <button onClick={() => setFeedback(null)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Formulário nova regra */}
      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-blue-900 text-sm">Nova regra</h3>
            <button onClick={() => setShowForm(false)} className="text-blue-400 hover:text-blue-600"><X size={16} /></button>
          </div>
          <div>
            <label className="block text-xs font-medium text-blue-800 mb-1">Nome da regra</label>
            <input type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Pausar CPL alto"
              className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-blue-800 mb-1">Métrica</label>
              <select value={metrica} onChange={e => setMetrica(e.target.value)}
                className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none appearance-none">
                {Object.entries(METRICA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-blue-800 mb-1">Condição</label>
              <select value={operador} onChange={e => setOperador(e.target.value)}
                className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none appearance-none">
                <option value="maior_que">maior que</option>
                <option value="menor_que">menor que</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-blue-800 mb-1">Valor</label>
              <input type="number" value={valor} onChange={e => setValor(e.target.value)} placeholder="Ex: 30"
                className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <div>
              <label className="block text-xs font-medium text-blue-800 mb-1">Por quantos dias</label>
              <select value={janela} onChange={e => setJanela(e.target.value)}
                className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none appearance-none">
                {[1,2,3,7].map(d => <option key={d} value={d}>{d} {d === 1 ? 'dia' : 'dias'}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-blue-800 mb-1">Ação</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(ACAO_LABELS).map(([k, v]) => (
                <button key={k} onClick={() => setAcao(k)}
                  className={cn('px-3 py-1.5 rounded-xl border text-xs font-medium transition-all',
                    acao === k ? 'bg-blue-600 text-white border-blue-600' : 'border-blue-200 text-blue-700 bg-white hover:bg-blue-100')}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          {acao === 'escalar_orcamento' && (
            <div>
              <label className="block text-xs font-medium text-blue-800 mb-1">Incremento (%)</label>
              <div className="flex gap-2">
                {[10, 20, 25, 30].map(p => (
                  <button key={p} onClick={() => setIncremento(String(p))}
                    className={cn('px-3 py-1.5 rounded-xl border text-xs font-medium',
                      incremento === String(p) ? 'bg-green-600 text-white border-green-600' : 'border-blue-200 text-blue-700 bg-white')}>
                    +{p}%
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)}
              className="flex-1 px-3 py-2 rounded-xl border border-blue-200 text-blue-700 text-sm hover:bg-blue-100">Cancelar</button>
            <button onClick={saveRule} disabled={saving}
              className="flex-1 px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 size={13} className="animate-spin" />} Salvar regra
            </button>
          </div>
        </div>
      )}

      {!loaded && !loading && (
        <div className="text-center py-10 text-gray-400">
          <Zap size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Clique em &quot;Carregar regras&quot; para ver e gerenciar suas automações</p>
        </div>
      )}

      {loaded && rules.length === 0 && !showForm && (
        <div className="text-center py-10 text-gray-400">
          <Zap size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma regra criada ainda</p>
          <p className="text-xs mt-1">Crie regras para pausar campanhas ou escalar orçamento automaticamente</p>
        </div>
      )}

      {rules.length > 0 && (
        <div className="space-y-3">
          {rules.map(rule => (
            <div key={rule.id} className={cn('bg-white rounded-2xl border p-4 space-y-2',
              rule.ativa ? 'border-gray-100' : 'border-gray-100 opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="font-semibold text-gray-900 text-sm">{rule.nome}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Se <strong>{METRICA_LABELS[rule.condicao.metrica] || rule.condicao.metrica}</strong>{' '}
                    {rule.condicao.operador === 'maior_que' ? '>' : '<'}{' '}
                    <strong>{rule.condicao.valor}</strong> por{' '}
                    <strong>{rule.condicao.janela_dias}</strong> {rule.condicao.janela_dias === 1 ? 'dia' : 'dias'}{' '}
                    → <strong>{ACAO_LABELS[rule.acao.tipo] || rule.acao.tipo}</strong>
                    {rule.acao.tipo === 'escalar_orcamento' && rule.acao.incremento_pct
                      ? ` (+${Math.round(rule.acao.incremento_pct * 100)}%)`
                      : ''}
                  </div>
                  {rule.ultima_execucao && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      Última execução: {formatDateTime(rule.ultima_execucao)} · {rule.vezes_executada}x executada
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggleRule(rule)}
                    className={cn('px-2.5 py-1 rounded-lg text-xs font-medium border transition-all',
                      rule.ativa ? 'border-green-200 text-green-600 bg-green-50' : 'border-gray-200 text-gray-500 bg-gray-50')}>
                    {rule.ativa ? 'Ativa' : 'Pausada'}
                  </button>
                  <button onClick={() => deleteRule(rule.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <X size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
