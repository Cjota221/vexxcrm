'use client';

import React, { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { Loader2, Zap, CheckCircle, XCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgenteLog {
  passo: number;
  titulo: string;
  detalhe: string;
  status: 'ok' | 'erro' | 'info';
}

interface CampanhaCriada {
  tipo: string;
  nome: string;
  campaignId: string;
  adsetId: string;
  adId: string;
  orcamentoReais: number;
}

interface AgenteResultado {
  logs: AgenteLog[];
  campanhasCriadas: CampanhaCriada[];
  erros: string[];
  resumo: string;
}

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().accessToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const EXEMPLOS = [
  'Temos R$50/dia. Sobe campanhas para público frio e WhatsApp.',
  'R$100 diário. Cria para frio, quente e WhatsApp.',
  'R$30 por dia em público quente.',
];

function LogItem({ log }: { log: AgenteLog }) {
  const [open, setOpen] = useState(false);
  const iconMap = {
    ok:   <CheckCircle size={14} className="text-emerald-500 shrink-0" />,
    erro: <XCircle     size={14} className="text-red-500 shrink-0" />,
    info: <Info        size={14} className="text-blue-400 shrink-0" />,
  };
  const bgMap = {
    ok:   'border-emerald-100 bg-emerald-50/50',
    erro: 'border-red-100 bg-red-50/50',
    info: 'border-gray-100 bg-gray-50/30',
  };
  return (
    <div className={cn('rounded-lg border px-3 py-2', bgMap[log.status])}>
      <button
        className="flex items-center gap-2 w-full text-left"
        onClick={() => setOpen(o => !o)}
      >
        {iconMap[log.status]}
        <span className="text-xs font-medium text-gray-700 flex-1">{log.titulo}</span>
        <span className="text-[10px] text-gray-400 font-mono">#{log.passo}</span>
        {open ? <ChevronUp size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
      </button>
      {open && (
        <p className="mt-1.5 ml-5 text-[11px] text-gray-500 leading-relaxed">{log.detalhe}</p>
      )}
    </div>
  );
}

interface Props {
  pageId: string;
  whatsappNumber?: string;
}

export function AgenteTrafegoPanel({ pageId, whatsappNumber }: Props) {
  const [instrucao, setInstrucao] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<AgenteResultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function executar() {
    if (!instrucao.trim()) return;
    setLoading(true);
    setResultado(null);
    setError(null);

    try {
      const res = await fetch('/api/meta/agente', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ instrucao, page_id: pageId, whatsapp_number: whatsappNumber }),
      });
      const data = await res.json() as AgenteResultado & { error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? 'Erro desconhecido');
      } else {
        setResultado(data);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <Zap size={16} className="text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Agente Orquestrador de Tráfego</h3>
          <p className="text-xs text-gray-500">Descreva o que quer fazer e o agente cria as campanhas automaticamente</p>
        </div>
      </div>

      {/* Input de instrução */}
      <div className="space-y-2">
        <textarea
          value={instrucao}
          onChange={e => setInstrucao(e.target.value)}
          placeholder="Ex: Temos R$50/dia. Sobe campanhas para público frio e WhatsApp."
          rows={3}
          className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none placeholder:text-gray-400"
        />

        {/* Exemplos */}
        <div className="flex flex-wrap gap-1.5">
          {EXEMPLOS.map((ex, i) => (
            <button
              key={i}
              onClick={() => setInstrucao(ex)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-violet-300 hover:text-violet-600 transition-colors"
            >
              {ex.slice(0, 40)}…
            </button>
          ))}
        </div>
      </div>

      {/* Botão */}
      <button
        onClick={executar}
        disabled={loading || !instrucao.trim()}
        className={cn(
          'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all',
          loading || !instrucao.trim()
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-violet-600 text-white hover:bg-violet-700 shadow-sm',
        )}
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
        {loading ? 'Executando agente…' : 'Executar agente'}
      </button>

      {/* Erro de rede */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <div className="space-y-4">
          {/* Resumo */}
          <div className={cn(
            'px-4 py-3 rounded-xl border text-sm font-medium',
            resultado.campanhasCriadas.length > 0
              ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
              : 'bg-amber-50 border-amber-100 text-amber-700',
          )}>
            {resultado.resumo}
          </div>

          {/* Campanhas criadas */}
          {resultado.campanhasCriadas.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Campanhas criadas</p>
              <div className="space-y-2">
                {resultado.campanhasCriadas.map((c, i) => (
                  <div key={i} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-800">{c.nome}</p>
                      <p className="text-[11px] text-gray-400 font-mono mt-0.5">{c.campaignId}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-gray-700">
                        R${c.orcamentoReais.toFixed(2)}<span className="font-normal text-gray-400">/dia</span>
                      </p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">PAUSADA</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Log de passos */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Log de execução</p>
            <div className="space-y-1.5">
              {resultado.logs.map((log, i) => (
                <LogItem key={i} log={log} />
              ))}
            </div>
          </div>

          {/* Erros */}
          {resultado.erros.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-red-700 mb-1">Erros</p>
              <ul className="space-y-0.5">
                {resultado.erros.map((e, i) => (
                  <li key={i} className="text-xs text-red-600">{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
