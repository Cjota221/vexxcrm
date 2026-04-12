'use client';

import { useState } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch, brl2, n0, pct } from '@/components/trafego/trafegoUtils';

interface ABMetric { vencedor: 'a' | 'b' | 'tie'; diff_pct?: number }
interface ABResult {
  a: Record<string, unknown> & { nome: string; spend: number; roas: number; cpl: number; ctr: number; cpm: number; leads: number; thruplay: number };
  b: Record<string, unknown> & { nome: string; spend: number; roas: number; cpl: number; ctr: number; cpm: number; leads: number; thruplay: number };
  comparativo: { roas: ABMetric; cpl: ABMetric; ctr: ABMetric; cpm: ABMetric; thruplay: ABMetric; leads: ABMetric } | null;
  vencedor_geral: 'a' | 'b' | 'empate';
  score: { a: number; b: number };
  period: string;
}

export function ABTestTab() {
  const [campaignA, setCampaignA] = useState('');
  const [campaignB, setCampaignB] = useState('');
  const [period, setPeriod]       = useState<'7d' | '15d' | '30d'>('7d');
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<ABResult | null>(null);
  const [error, setError]         = useState<string | null>(null);

  async function comparar() {
    if (!campaignA.trim() || !campaignB.trim()) { setError('Informe os IDs das duas campanhas'); return; }
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`/api/trafego/abtest?campaign_a=${encodeURIComponent(campaignA.trim())}&campaign_b=${encodeURIComponent(campaignB.trim())}&period=${period}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Erro desconhecido'); return; }
      setResult(json);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  const METRICAS = [
    { key: 'roas',     label: 'ROAS',   fmt: (v: number) => v.toFixed(2) + 'x', lowerIsBetter: false },
    { key: 'cpl',      label: 'CPL',    fmt: brl2,                               lowerIsBetter: true  },
    { key: 'ctr',      label: 'CTR',    fmt: (v: number) => pct(v),              lowerIsBetter: false },
    { key: 'cpm',      label: 'CPM',    fmt: brl2,                               lowerIsBetter: true  },
    { key: 'leads',    label: 'Leads',  fmt: n0,                                 lowerIsBetter: false },
    { key: 'thruplay', label: 'ThruPlay', fmt: n0,                               lowerIsBetter: false },
  ] as const;

  function winnerColor(w: 'a' | 'b' | 'tie', side: 'a' | 'b') {
    if (w === 'tie') return '';
    return w === side ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-100 text-red-700';
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-bold text-gray-900">Comparador A/B</h2>
        <p className="text-xs text-gray-400 mt-0.5">Compare métricas de duas campanhas lado a lado</p>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Campanha A — ID</label>
          <input value={campaignA} onChange={e => setCampaignA(e.target.value)} placeholder="123456789"
            className="mt-1 w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Campanha B — ID</label>
          <input value={campaignB} onChange={e => setCampaignB(e.target.value)} placeholder="987654321"
            className="mt-1 w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {(['7d', '15d', '30d'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all', period === p ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100')}>
              {p}
            </button>
          ))}
        </div>
        <button onClick={comparar} disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          {loading ? 'Comparando...' : 'Comparar'}
        </button>
        {error && <span className="text-red-600 text-xs">{error}</span>}
      </div>

      {result && (
        <div className="space-y-4">
          {/* Vencedor */}
          <div className={cn('rounded-2xl border p-4 text-center',
            result.vencedor_geral === 'a' ? 'bg-green-50 border-green-200' :
            result.vencedor_geral === 'b' ? 'bg-blue-50 border-blue-200' :
            'bg-gray-50 border-gray-200')}>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Vencedor geral</div>
            <div className="text-2xl font-bold text-gray-900">
              {result.vencedor_geral === 'empate' ? 'Empate' :
               result.vencedor_geral === 'a' ? `Campanha A — ${result.a.nome}` : `Campanha B — ${result.b.nome}`}
            </div>
            <div className="text-sm text-gray-500 mt-1">Score: A {result.score.a} × B {result.score.b}</div>
          </div>

          {/* Tabela de métricas */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase w-24">Métrica</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-blue-600 uppercase">A — {result.a.nome.slice(0, 20)}</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-purple-600 uppercase">B — {result.b.nome.slice(0, 20)}</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase">Δ%</th>
                </tr>
              </thead>
              <tbody>
                {METRICAS.map(m => {
                  const comp = result.comparativo?.[m.key];
                  const valA = result.a[m.key] as number;
                  const valB = result.b[m.key] as number;
                  const winner = comp?.vencedor || 'tie';
                  return (
                    <tr key={m.key} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-3 font-medium text-gray-700 text-xs uppercase tracking-wide">{m.label}</td>
                      <td className={cn('px-4 py-3 text-center rounded-none font-semibold border', winnerColor(winner, 'a'))}>
                        {m.fmt(valA)}
                        {winner === 'a' && <span className="ml-1 text-[10px]">✓</span>}
                      </td>
                      <td className={cn('px-4 py-3 text-center font-semibold border', winnerColor(winner, 'b'))}>
                        {m.fmt(valB)}
                        {winner === 'b' && <span className="ml-1 text-[10px]">✓</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-500">
                        {comp?.diff_pct !== undefined ? (comp.diff_pct > 0 ? '+' : '') + comp.diff_pct.toFixed(1) + '%' : '—'}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-700 text-xs uppercase tracking-wide">Gasto</td>
                  <td className="px-4 py-3 text-center font-semibold text-gray-800">{brl2(result.a.spend)}</td>
                  <td className="px-4 py-3 text-center font-semibold text-gray-800">{brl2(result.b.spend)}</td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!result && !loading && (
        <div className="text-center py-12 text-gray-300">
          <Zap size={40} className="mx-auto mb-3" />
          <p className="text-sm text-gray-500">Informe os IDs das campanhas para comparar</p>
        </div>
      )}
    </div>
  );
}
