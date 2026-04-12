'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, CloudDownload, Copy, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch, brl, brl2, n0, formatDateTime } from '@/components/trafego/trafegoUtils';

export function RelatorioTab() {
  const [loading, setLoading]     = useState(false);
  const [relatorio, setRelatorio] = useState<{
    periodo?: string;
    gerado_em?: string;
    resumo?: { gasto_total: number; retorno_total: number; roas_medio: number; leads_total: number; cpl_medio: number };
    campanhas?: Array<{ nome: string; status: string; health: string; spend: number; leads: number; cpl: number; roas: number }>;
    texto_relatorio?: string;
  } | null>(null);
  const [periodo, setPeriodo] = useState<'last_7d' | 'last_14d' | 'last_30d'>('last_7d');
  const [copiado, setCopiado] = useState(false);

  const gerarRelatorio = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/ai-team/relatorio?periodo=${p}`);
      if (res.ok) {
        const json = await res.json();
        setRelatorio(json);
      }
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { gerarRelatorio(periodo); }, [gerarRelatorio, periodo]);

  function copiarTexto() {
    if (!relatorio?.texto_relatorio) return;
    navigator.clipboard.writeText(relatorio.texto_relatorio);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  const healthColors: Record<string, string> = {
    great: 'text-green-700',
    ok:    'text-amber-700',
    bad:   'text-red-700',
    paused:'text-gray-500',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bold text-gray-900">Relatório de Performance</h2>
          <p className="text-xs text-gray-400 mt-0.5">Gerado pelo Cláudio em português simples</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {([
              { value: 'last_7d',  label: '7 dias' },
              { value: 'last_14d', label: '15 dias' },
              { value: 'last_30d', label: '30 dias' },
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setPeriodo(value)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  periodo === value ? 'bg-crm-primary text-white shadow-sm' : 'bg-transparent text-gray-600 hover:bg-gray-200'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <a
            href={`/api/trafego/export?format=csv&period=${periodo === 'last_7d' ? '7d' : periodo === 'last_14d' ? '15d' : '30d'}`}
            download
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
          >
            <CloudDownload size={13} /> Exportar CSV
          </a>
          <button
            onClick={() => gerarRelatorio(periodo)}
            disabled={loading}
            className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center py-12 text-gray-400 text-sm">
          <Loader2 size={24} className="animate-spin mx-auto mb-2" />
          Cláudio está gerando seu relatório...
        </div>
      )}

      {!loading && relatorio && (
        <div className="space-y-5">
          {/* Cards de resumo */}
          {relatorio.resumo && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="text-xs text-gray-500 mb-1">Investido</div>
                <div className="font-bold text-gray-900">{brl(relatorio.resumo.gasto_total)}</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="text-xs text-gray-500 mb-1">Retorno</div>
                <div className="font-bold text-gray-900">{brl(relatorio.resumo.retorno_total)}</div>
              </div>
              <div className={cn(
                'rounded-xl p-4 border',
                relatorio.resumo.roas_medio >= 3 ? 'bg-green-50 border-green-200' :
                relatorio.resumo.roas_medio >= 1.5 ? 'bg-amber-50 border-amber-200' :
                'bg-red-50 border-red-200'
              )}>
                <div className="text-xs text-gray-500 mb-1">ROAS médio</div>
                <div className="font-bold text-gray-900">{relatorio.resumo.roas_medio.toFixed(1)}x</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="text-xs text-gray-500 mb-1">Leads</div>
                <div className="font-bold text-gray-900">{relatorio.resumo.leads_total}</div>
                {relatorio.resumo.cpl_medio > 0 && (
                  <div className="text-xs text-gray-400">{brl(relatorio.resumo.cpl_medio)}/lead</div>
                )}
              </div>
            </div>
          )}

          {/* Campanhas resumidas */}
          {relatorio.campanhas && relatorio.campanhas.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Campanhas</h3>
              <div className="space-y-2">
                {relatorio.campanhas.map((c, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 px-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm font-medium', healthColors[c.health] || 'text-gray-700')}>
                        {c.health === 'great' ? '✅' : c.health === 'bad' ? '⚠️' : c.health === 'paused' ? '⏸️' : '🟡'}
                        {' '}{c.nome}
                      </span>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      <span className="font-medium text-gray-700">{brl(c.spend)}</span>
                      {c.leads > 0 && <span className="ml-2">{c.leads} leads · {brl(c.cpl)}/lead</span>}
                      <span className="ml-2">ROAS {c.roas.toFixed(1)}x</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Texto do relatório (Cláudio) */}
          {relatorio.texto_relatorio && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🧠</span>
                  <span className="font-semibold text-gray-900 text-sm">Relatório do Cláudio</span>
                </div>
                <button
                  onClick={copiarTexto}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  <Copy size={12} />
                  {copiado ? 'Copiado!' : 'Copiar para WhatsApp'}
                </button>
              </div>
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                {relatorio.texto_relatorio}
              </pre>
            </div>
          )}

          {relatorio.gerado_em && (
            <p className="text-xs text-gray-400 text-center">
              Gerado em {formatDateTime(relatorio.gerado_em)}
            </p>
          )}
        </div>
      )}

      {!loading && !relatorio && (
        <div className="text-center py-8 bg-gray-50 rounded-2xl border border-gray-100">
          <BarChart3 size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Clique em atualizar para gerar o relatório</p>
        </div>
      )}
    </div>
  );
}
