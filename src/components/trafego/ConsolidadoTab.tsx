'use client';

import { useState } from 'react';
import { BarChart3, Globe, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch, brl, n0 } from '@/components/trafego/trafegoUtils';

interface ConsolidadoContaSummary {
  spend: number; revenue: number; leads: number; clicks: number; roas: number; cpl: number; ativas: number; pausadas: number;
}
interface ConsolidadoConta {
  accountId: string; accountName: string; currency: string;
  campaigns: Array<{ id: string; nome: string; status: string; spend: number; revenue: number; leads: number; roas: number; cpl: number }>;
  summary: ConsolidadoContaSummary | null;
  error?: string;
}

export function ConsolidadoTab() {
  const [accountIds, setAccountIds] = useState('');
  const [period, setPeriod]         = useState<'7d' | '15d' | '30d'>('7d');
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<{ contas: ConsolidadoConta[]; grand: ConsolidadoContaSummary & { roas: number; cpl: number } } | null>(null);
  const [error, setError]           = useState<string | null>(null);

  async function buscar() {
    const ids = accountIds.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    if (!ids.length) { setError('Informe ao menos uma conta (act_XXXXXXXX)'); return; }
    setLoading(true); setError(null);
    try {
      const res = await authFetch('/api/trafego/consolidado', {
        method: 'POST',
        body: JSON.stringify({ account_ids: ids, period }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Erro desconhecido'); return; }
      setResult(json);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-bold text-gray-900">Dashboard Multi-conta</h2>
        <p className="text-xs text-gray-400 mt-0.5">Compare métricas de várias contas Meta lado a lado</p>
      </div>

      {/* Inputs */}
      <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-3">
        <div>
          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">IDs das contas (act_XXXX)</label>
          <textarea
            value={accountIds}
            onChange={e => setAccountIds(e.target.value)}
            placeholder={'act_123456789\nact_987654321'}
            rows={3}
            className="mt-1 w-full text-sm border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white border border-gray-200 rounded-xl p-1 gap-1">
            {(['7d', '15d', '30d'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={cn('px-3 py-1 rounded-lg text-xs font-medium transition-all', period === p ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100')}>
                {p}
              </button>
            ))}
          </div>
          <button onClick={buscar} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
            {loading ? 'Buscando...' : 'Consolidar'}
          </button>
        </div>
        {error && <div className="text-red-600 text-xs">{error}</div>}
      </div>

      {/* Grand total */}
      {result && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Gasto total',   value: brl(result.grand.spend) },
              { label: 'Retorno',       value: brl(result.grand.revenue) },
              { label: 'ROAS',          value: result.grand.roas.toFixed(2) + 'x' },
              { label: 'Leads',         value: n0(result.grand.leads) },
            ].map(m => (
              <div key={m.label} className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{m.label}</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{m.value}</div>
              </div>
            ))}
          </div>

          {/* Per-account cards */}
          <div className="space-y-3">
            {result.contas.map(conta => (
              <div key={conta.accountId} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">{conta.accountName}</div>
                    <div className="text-[11px] text-gray-400">{conta.accountId}</div>
                  </div>
                  {conta.error ? (
                    <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-lg">{conta.error}</span>
                  ) : (
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span>{conta.summary?.ativas || 0} ativas</span>
                      <span>{conta.summary?.pausadas || 0} pausadas</span>
                    </div>
                  )}
                </div>
                {conta.summary && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {[
                      { l: 'Gasto',   v: brl(conta.summary.spend) },
                      { l: 'Retorno', v: brl(conta.summary.revenue) },
                      { l: 'ROAS',    v: conta.summary.roas.toFixed(2) + 'x' },
                      { l: 'Leads',   v: n0(conta.summary.leads) },
                      { l: 'Cliques', v: n0(conta.summary.clicks) },
                      { l: 'CPL',     v: brl(conta.summary.cpl) },
                    ].map(m => (
                      <div key={m.l} className="text-center bg-gray-50 rounded-xl py-2">
                        <div className="text-[10px] text-gray-500 uppercase">{m.l}</div>
                        <div className="text-sm font-bold text-gray-900 mt-0.5">{m.v}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {!result && !loading && (
        <div className="text-center py-12 text-gray-300">
          <Globe size={40} className="mx-auto mb-3" />
          <p className="text-sm text-gray-500">Informe os IDs das contas e clique em Consolidar</p>
        </div>
      )}
    </div>
  );
}
