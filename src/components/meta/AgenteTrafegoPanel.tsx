'use client';

import { useState, useRef } from 'react';
import { useAuthStore } from '@/store/auth';
import {
  Bot, DollarSign, Users, MessageCircle,
  TrendingUp, CheckCircle, XCircle, Loader2,
  Sparkles, ChevronRight, Play, AlertCircle, ShoppingBag,
} from 'lucide-react';
import type { TipoCampanha } from '@/lib/services/meta-adset-creator.service';
import { cn } from '@/lib/utils';

/* ─── Tipos ──────────────────────────────────────────────────────────────── */

interface Step {
  id: string;
  status: 'pending' | 'running' | 'ok' | 'error';
  label: string;
  detalhe?: string;
}

interface DoneEvent {
  ok: boolean;
  resumo?: string;
  erro?: string;
  resultados?: Array<{ tipo: TipoCampanha; ok: boolean; erro?: string; campaignId?: string }>;
}

type Fase = 'config' | 'confirmacao' | 'executando' | 'concluido';

const TIPOS_CONFIG = {
  frio:     { label: 'Público frio',   icon: Users,         desc: 'Novos clientes por interesse' },
  quente:   { label: 'Público quente', icon: TrendingUp,    desc: 'Remarketing — já te conhecem' },
  whatsapp: { label: 'WhatsApp',       icon: MessageCircle, desc: 'Mensagens diretas' },
  catalogo: { label: 'Catálogo',       icon: ShoppingBag,   desc: 'Anúncios dinâmicos de produtos' },
} as const;

const CATALOGOS = [
  { id: '740174445143215', nome: 'CJ Rasteirinhas Atacado' },
  { id: '860022402952098', nome: 'Fácilzap 2024' },
] as const;

const PESOS: Record<TipoCampanha, number> = { frio: 0.3, quente: 0.2, whatsapp: 0.5, catalogo: 0.4 };

/* ─── Componente ─────────────────────────────────────────────────────────── */

export function AgenteTrafegoPanel() {
  const [fase, setFase]             = useState<Fase>('config');
  const [orcamento, setOrcamento]   = useState(50);
  const [tipos, setTipos]           = useState<TipoCampanha[]>(['frio', 'whatsapp']);
  const [nome, setNome]             = useState('');
  const [catalogoId, setCatalogoId] = useState(CATALOGOS[0].id);
  const [steps, setSteps]           = useState<Step[]>([]);
  const [done, setDone]             = useState<DoneEvent | null>(null);
  const esRef                       = useRef<EventSource | null>(null);

  function calcOrc(tipo: TipoCampanha): number {
    const totalPeso = tipos.reduce((a, t) => a + PESOS[t], 0);
    return Math.round((orcamento * PESOS[tipo]) / totalPeso);
  }

  function toggleTipo(tipo: TipoCampanha) {
    setTipos(prev => prev.includes(tipo) ? prev.filter(t => t !== tipo) : [...prev, tipo]);
  }

  function voltar() {
    esRef.current?.close();
    setFase('config');
    setDone(null);
    setSteps([]);
  }

  function executar() {
    setFase('executando');
    setSteps([]);
    setDone(null);

    const accessToken = useAuthStore.getState().accessToken ?? '';
    const params = new URLSearchParams({
      token:      accessToken,
      orcamento:  String(orcamento),
      tipos:      tipos.join(','),
      nome:       nome || `Agente ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`,
      catalogoId,
    });

    const es = new EventSource(`/api/meta/agente/stream?${params}`);
    esRef.current = es;

    es.addEventListener('step', (e) => {
      const step = JSON.parse((e as MessageEvent).data) as Step;
      setSteps(prev => {
        const idx = prev.findIndex(s => s.id === step.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = step; return next; }
        return [...prev, step];
      });
    });

    es.addEventListener('done', (e) => {
      const result = JSON.parse((e as MessageEvent).data) as DoneEvent;
      setDone(result);
      setFase('concluido');
      es.close();
    });

    es.onerror = () => {
      setDone({ ok: false, erro: 'Conexão perdida com o servidor' });
      setFase('concluido');
      es.close();
    };
  }

  /* ── Config ──────────────────────────────────────────────────────────── */
  if (fase === 'config') return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-[#1e3a5f]/5 to-purple-50 rounded-2xl border border-[#1e3a5f]/10">
        <div className="w-10 h-10 rounded-xl bg-[#1e3a5f] flex items-center justify-center shrink-0">
          <Bot size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900 text-sm">Agente Gestor de Tráfego</p>
          <p className="text-xs text-gray-500">Configure e o agente cria as campanhas automaticamente</p>
        </div>
        <Sparkles size={16} className="text-purple-400 shrink-0" />
      </div>

      {/* Nome */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Nome da campanha <span className="text-gray-400">(opcional)</span>
        </label>
        <input
          type="text"
          value={nome}
          onChange={e => setNome(e.target.value)}
          placeholder={`Agente ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
        />
      </div>

      {/* Orçamento */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Orçamento diário total</label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="number"
              value={orcamento}
              onChange={e => setOrcamento(Number(e.target.value))}
              min={10}
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
            />
          </div>
          <span className="text-xs text-gray-400 shrink-0">R$/dia</span>
        </div>
      </div>

      {/* Tipos */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-2">Tipos de campanha</label>
        <div className="space-y-2">
          {(Object.entries(TIPOS_CONFIG) as [TipoCampanha, typeof TIPOS_CONFIG[TipoCampanha]][]).map(([tipo, cfg]) => {
            const ativo = tipos.includes(tipo);
            const Icon = cfg.icon;
            return (
              <button key={tipo} onClick={() => toggleTipo(tipo)}
                className={cn(
                  'w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left',
                  ativo ? 'border-[#1e3a5f] bg-[#1e3a5f]/5' : 'border-gray-200 hover:border-gray-300',
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center',
                    ativo ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-400',
                  )}>
                    <Icon size={14} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">{cfg.label}</p>
                    <p className="text-xs text-gray-400">{cfg.desc}</p>
                  </div>
                </div>
                {ativo && (
                  <span className="text-sm font-medium text-[#1e3a5f] shrink-0">
                    R${calcOrc(tipo)}/dia
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Seletor de catálogo — aparece quando 'catalogo' está selecionado */}
      {tipos.includes('catalogo') && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Catálogo de produtos</label>
          <select
            value={catalogoId}
            onChange={e => setCatalogoId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
          >
            {CATALOGOS.map(c => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">ID: {catalogoId}</p>
        </div>
      )}

      <button
        onClick={() => setFase('confirmacao')}
        disabled={tipos.length === 0}
        className="w-full py-3 bg-[#1e3a5f] text-white text-sm font-medium rounded-xl hover:bg-[#16304f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        Ver plano do agente <ChevronRight size={16} />
      </button>
    </div>
  );

  /* ── Confirmação ─────────────────────────────────────────────────────── */
  if (fase === 'confirmacao') return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Bot size={16} className="text-[#1e3a5f]" />
        <span className="font-semibold text-gray-900 text-sm">Plano do agente</span>
      </div>

      <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">O agente vai executar:</p>
        {tipos.map(tipo => {
          const cfg = TIPOS_CONFIG[tipo];
          const Icon = cfg.icon;
          return (
            <div key={tipo} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
              <div className="w-7 h-7 rounded-lg bg-[#1e3a5f]/10 flex items-center justify-center shrink-0">
                <Icon size={13} className="text-[#1e3a5f]" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">Campanha {cfg.label}</p>
                <p className="text-xs text-gray-400">{cfg.desc} · R${calcOrc(tipo)}/dia</p>
              </div>
              <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">PAUSADA</span>
            </div>
          );
        })}
        <div className="pt-1 flex items-center justify-between">
          <span className="text-xs text-gray-500">Total: R${orcamento}/dia</span>
          <span className="text-xs text-gray-400">{tipos.length} campanha{tipos.length > 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
        Todas as campanhas serão criadas <strong>pausadas</strong> — você revisa e ativa manualmente.
      </div>

      <div className="flex gap-2">
        <button onClick={voltar} className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm rounded-xl hover:bg-gray-50">
          Voltar
        </button>
        <button onClick={executar} className="flex-1 py-2.5 bg-[#1e3a5f] text-white text-sm font-medium rounded-xl hover:bg-[#16304f] flex items-center justify-center gap-2">
          <Play size={14} /> Executar agente
        </button>
      </div>
    </div>
  );

  /* ── Executando ──────────────────────────────────────────────────────── */
  if (fase === 'executando') return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Loader2 size={16} className="text-[#1e3a5f] animate-spin" />
        <span className="font-semibold text-gray-900 text-sm">Agente trabalhando...</span>
      </div>

      <div className="space-y-2">
        {steps.length === 0 && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
            <Loader2 size={14} className="text-blue-500 animate-spin shrink-0" />
            <span className="text-sm text-blue-700">Iniciando agente...</span>
          </div>
        )}
        {steps.map(step => (
          <div key={step.id} className={cn(
            'flex items-start gap-3 p-3 rounded-xl border transition-all',
            step.status === 'ok'      && 'bg-green-50 border-green-200',
            step.status === 'error'   && 'bg-red-50 border-red-200',
            step.status === 'running' && 'bg-blue-50 border-blue-200',
            step.status === 'pending' && 'bg-gray-50 border-gray-100',
          )}>
            <div className="shrink-0 mt-0.5">
              {step.status === 'ok'      && <CheckCircle size={14} className="text-green-600" />}
              {step.status === 'error'   && <XCircle     size={14} className="text-red-500" />}
              {step.status === 'running' && <Loader2     size={14} className="text-blue-500 animate-spin" />}
              {step.status === 'pending' && <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{step.label}</p>
              {step.detalhe && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{step.detalhe}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  /* ── Concluído ───────────────────────────────────────────────────────── */
  if (fase === 'concluido') return (
    <div className="space-y-4">
      <div className={cn('p-4 rounded-2xl border', done?.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200')}>
        <div className="flex items-center gap-2 mb-1">
          {done?.ok
            ? <CheckCircle size={16} className="text-green-600" />
            : <AlertCircle size={16} className="text-red-500" />}
          <span className="font-semibold text-sm text-gray-900">
            {done?.ok ? 'Agente concluído' : 'Erro na execução'}
          </span>
        </div>
        <p className="text-sm text-gray-600">{done?.resumo ?? done?.erro}</p>
      </div>

      {steps.length > 0 && (
        <div className="space-y-1.5">
          {steps.map(step => (
            <div key={step.id} className="flex items-start gap-2.5 py-1.5">
              <div className="shrink-0 mt-0.5">
                {step.status === 'ok'    && <CheckCircle size={13} className="text-green-500" />}
                {step.status === 'error' && <XCircle     size={13} className="text-red-500" />}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700">{step.label}</p>
                {step.detalhe && <p className="text-xs text-gray-400">{step.detalhe}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {done?.ok && (
        <div className="p-3 bg-[#1e3a5f]/5 border border-[#1e3a5f]/10 rounded-xl text-xs text-[#1e3a5f] space-y-1">
          <p className="font-medium">Próximos passos:</p>
          <p>→ Revise as campanhas no Meta Ads Manager</p>
          <p>→ Verifique o criativo e o copy antes de ativar</p>
          <p>→ Ative a campanha quando estiver pronta</p>
        </div>
      )}

      <button onClick={voltar} className="w-full py-2.5 border border-gray-200 text-gray-700 text-sm rounded-xl hover:bg-gray-50">
        Criar outra campanha
      </button>
    </div>
  );

  return null;
}
