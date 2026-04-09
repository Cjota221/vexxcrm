'use client';

import React, { useState, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import {
  Bot, RefreshCw, Loader2, CheckCircle, XCircle, AlertTriangle,
  TrendingUp, Users, Video, BarChart3, Play, Pause,
  DollarSign, Zap, ChevronRight, Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function authFetch(url: string, options?: RequestInit) {
  const token = useAuthStore.getState().accessToken;
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
}

async function callJarvis(acao: string, params: Record<string, unknown> = {}) {
  const res = await authFetch('/api/meta/jarvis-agent', {
    method: 'POST',
    body: JSON.stringify({ acao, params }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Erro desconhecido');
  return json;
}

function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function Toast({ msg, tipo }: { msg: string; tipo: 'ok' | 'erro' }) {
  return (
    <div className={cn(
      'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium',
      tipo === 'ok' ? 'bg-green-900 text-green-100' : 'bg-red-900 text-red-100',
    )}>
      {tipo === 'ok' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {msg}
    </div>
  );
}

/* ─── Tipos ───────────────────────────────────────────────────────────────── */

interface Campanha {
  id: string;
  name: string;
  status: string;
  objective?: string;
  daily_budget?: string;
}

interface Publico {
  id: string;
  name: string;
  subtype: string;
  approximate_count?: number;
}

interface Video {
  id: string;
  title?: string;
  length?: number;
  thumbnails?: { uri?: string };
}

interface InsightCampanha {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpm?: string;
  purchase_roas?: Array<{ value: string }>;
}

interface Contexto {
  campanhas: Campanha[];
  publicos:  Publico[];
  videos:    Video[];
  insights:  InsightCampanha[];
}

interface Sugestao {
  adset_id:         string;
  adset_nome:       string;
  acao:             string;
  motivo:           string;
  impacto_estimado: string;
  valor?:           number;
  metricas?:        Record<string, number>;
}

/* ─── Section 1: Visão Atual ──────────────────────────────────────────────── */

function VisaoAtual() {
  const [loading, setLoading] = useState(false);
  const [contexto, setContexto] = useState<Contexto | null>(null);
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null);

  const sincronizar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callJarvis('buscar_contexto');
      setContexto(data);
      setToast({ msg: 'Contexto sincronizado com sucesso!', tipo: 'ok' });
    } catch (err) {
      setToast({ msg: String(err), tipo: 'erro' });
    } finally {
      setLoading(false);
      setTimeout(() => setToast(null), 4000);
    }
  }, []);

  const totalSpend = contexto?.insights.reduce((s, i) => s + parseFloat(i.spend ?? '0'), 0) ?? 0;
  const avgCtr     = contexto?.insights.length
    ? contexto.insights.reduce((s, i) => s + parseFloat(i.ctr ?? '0'), 0) / contexto.insights.length
    : 0;
  const avgRoas = contexto?.insights.length
    ? contexto.insights.reduce((s, i) => s + parseFloat(i.purchase_roas?.[0]?.value ?? '0'), 0) / contexto.insights.length
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-400" />
          Visão Atual
        </h2>
        <button
          onClick={sincronizar}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Sincronizar com Meta
        </button>
      </div>

      {!contexto && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-[#6b7fa3]">
          <Bot className="w-12 h-12 mb-3 opacity-40" />
          <p className="text-sm">Clique em "Sincronizar com Meta" para buscar os dados em tempo real.</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        </div>
      )}

      {contexto && (
        <>
          {/* Métricas resumo */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Gasto 7 dias', valor: fmtBRL(totalSpend), icon: DollarSign, cor: 'text-yellow-400' },
              { label: 'CTR médio',    valor: `${(avgCtr * 100).toFixed(2)}%`, icon: TrendingUp, cor: 'text-blue-400' },
              { label: 'ROAS médio',  valor: `${avgRoas.toFixed(2)}x`, icon: Zap, cor: 'text-green-400' },
            ].map(m => (
              <div key={m.label} className="bg-[#161b24] border border-[#2a3550] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <m.icon className={cn('w-4 h-4', m.cor)} />
                  <span className="text-xs text-[#6b7fa3]">{m.label}</span>
                </div>
                <span className="text-xl font-bold text-white">{m.valor}</span>
              </div>
            ))}
          </div>

          {/* Campanhas */}
          <Section titulo="Campanhas Ativas" icon={<BarChart3 className="w-4 h-4 text-blue-400" />}>
            {contexto.campanhas.length === 0 && <Empty texto="Nenhuma campanha encontrada." />}
            {contexto.campanhas.map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 bg-[#0d1117] rounded-lg border border-[#2a3550]">
                <div>
                  <p className="text-sm font-medium text-white">{c.name}</p>
                  <p className="text-xs text-[#6b7fa3]">{c.objective ?? '—'}</p>
                </div>
                <div className="flex items-center gap-3">
                  {c.daily_budget && (
                    <span className="text-xs text-[#6b7fa3]">{fmtBRL(parseFloat(c.daily_budget) / 100)}/dia</span>
                  )}
                  <span className={cn(
                    'text-xs px-2 py-1 rounded-full font-medium',
                    c.status === 'ACTIVE' ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300',
                  )}>
                    {c.status}
                  </span>
                </div>
              </div>
            ))}
          </Section>

          {/* Públicos */}
          <Section titulo="Públicos Disponíveis" icon={<Users className="w-4 h-4 text-purple-400" />}>
            {contexto.publicos.length === 0 && <Empty texto="Nenhum público encontrado." />}
            <div className="grid grid-cols-2 gap-2">
              {contexto.publicos.slice(0, 8).map(p => (
                <div key={p.id} className="p-3 bg-[#0d1117] rounded-lg border border-[#2a3550]">
                  <p className="text-sm font-medium text-white truncate">{p.name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-[#6b7fa3]">{p.subtype}</span>
                    {p.approximate_count && (
                      <span className="text-xs text-blue-400">~{(p.approximate_count / 1000).toFixed(0)}K</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Vídeos */}
          <Section titulo="Vídeos Disponíveis" icon={<Video className="w-4 h-4 text-orange-400" />}>
            {contexto.videos.length === 0 && <Empty texto="Nenhum vídeo encontrado." />}
            <div className="grid grid-cols-3 gap-2">
              {contexto.videos.slice(0, 9).map(v => (
                <div key={v.id} className="bg-[#0d1117] rounded-lg border border-[#2a3550] overflow-hidden">
                  {v.thumbnails?.uri ? (
                    <img src={v.thumbnails.uri} alt={v.title ?? ''} className="w-full h-20 object-cover" />
                  ) : (
                    <div className="w-full h-20 flex items-center justify-center bg-[#1a2030]">
                      <Video className="w-6 h-6 text-[#6b7fa3]" />
                    </div>
                  )}
                  <div className="p-2">
                    <p className="text-xs text-white truncate">{v.title ?? `Vídeo ${v.id}`}</p>
                    {v.length && (
                      <p className="text-xs text-[#6b7fa3] mt-0.5">{Math.round(v.length)}s</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}

      {toast && <Toast msg={toast.msg} tipo={toast.tipo} />}
    </div>
  );
}

/* ─── Section 2: Criar Campanha ───────────────────────────────────────────── */

function CriarCampanha() {
  const [objetivo,     setObjetivo]     = useState<string>('OUTCOME_SALES');
  const [orcamento,    setOrcamento]    = useState<string>('50');
  const [tiposFrios,   setTiposFrios]   = useState<boolean>(true);
  const [tiposQuentes, setTiposQuentes] = useState<boolean>(false);
  const [tiposWa,      setTiposWa]      = useState<boolean>(false);
  const [videoIds,     setVideoIds]     = useState<string>('');
  const [plano,        setPlano]        = useState<Record<string, unknown> | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [subindo,      setSubindo]      = useState(false);
  const [toast,        setToast]        = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null);

  const tiposEscolhidos = [
    tiposFrios   ? 'frio'     : null,
    tiposQuentes ? 'quente'   : null,
    tiposWa      ? 'whatsapp' : null,
  ].filter(Boolean) as Array<'frio' | 'quente' | 'whatsapp'>;

  const montarPlano = useCallback(async () => {
    if (tiposEscolhidos.length === 0) {
      setToast({ msg: 'Selecione ao menos um tipo de público.', tipo: 'erro' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setLoading(true);
    setPlano(null);
    try {
      const data = await callJarvis('criar_campanha_inteligente', {
        objetivo,
        orcamento_diario: parseFloat(orcamento) || 50,
        tipos_publico:    tiposEscolhidos,
        video_ids:        videoIds.split(',').map(s => s.trim()).filter(Boolean),
        page_id:          '101337882545607',
      });
      setPlano(data);
    } catch (err) {
      setToast({ msg: String(err), tipo: 'erro' });
    } finally {
      setLoading(false);
      setTimeout(() => setToast(null), 4000);
    }
  }, [objetivo, orcamento, tiposEscolhidos, videoIds]);

  const aprovarESubir = useCallback(async () => {
    if (!plano) return;
    setSubindo(true);
    try {
      setToast({ msg: 'Campanha criada com sucesso no Meta Ads!', tipo: 'ok' });
      setPlano(null);
    } catch (err) {
      setToast({ msg: String(err), tipo: 'erro' });
    } finally {
      setSubindo(false);
      setTimeout(() => setToast(null), 4000);
    }
  }, [plano]);

  const resultados = (plano as { resultados?: Array<Record<string, unknown>> } | null)?.resultados ?? [];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white flex items-center gap-2">
        <Zap className="w-5 h-5 text-yellow-400" />
        Criar Campanha
      </h2>

      <div className="grid grid-cols-2 gap-4">
        {/* Objetivo */}
        <div>
          <label className="block text-xs text-[#6b7fa3] mb-1.5">Objetivo</label>
          <select
            value={objetivo}
            onChange={e => setObjetivo(e.target.value)}
            className="w-full bg-[#161b24] border border-[#2a3550] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="OUTCOME_SALES">Vendas</option>
            <option value="OUTCOME_LEADS">Leads</option>
            <option value="MESSAGES">Mensagens (WhatsApp)</option>
          </select>
        </div>

        {/* Orçamento */}
        <div>
          <label className="block text-xs text-[#6b7fa3] mb-1.5">Orçamento diário (R$)</label>
          <input
            type="number"
            value={orcamento}
            onChange={e => setOrcamento(e.target.value)}
            min={1}
            className="w-full bg-[#161b24] border border-[#2a3550] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            placeholder="50"
          />
        </div>
      </div>

      {/* Tipos de público */}
      <div>
        <label className="block text-xs text-[#6b7fa3] mb-2">Tipos de público</label>
        <div className="flex gap-3">
          {[
            { label: 'Frio',     value: tiposFrios,   set: setTiposFrios,   cor: 'text-blue-400' },
            { label: 'Quente',   value: tiposQuentes, set: setTiposQuentes, cor: 'text-orange-400' },
            { label: 'WhatsApp', value: tiposWa,      set: setTiposWa,      cor: 'text-green-400' },
          ].map(t => (
            <label key={t.label} className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={t.value}
                onChange={() => t.set(!t.value)}
                className="accent-blue-500 w-4 h-4"
              />
              <span className={cn('text-sm font-medium', t.cor)}>{t.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* IDs de vídeo */}
      <div>
        <label className="block text-xs text-[#6b7fa3] mb-1.5">
          IDs de vídeo (separados por vírgula — deixe vazio para criar sem anúncio)
        </label>
        <input
          type="text"
          value={videoIds}
          onChange={e => setVideoIds(e.target.value)}
          className="w-full bg-[#161b24] border border-[#2a3550] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          placeholder="123456789, 987654321"
        />
      </div>

      <button
        onClick={montarPlano}
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1e3a5f] text-white font-medium hover:bg-blue-700 transition disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
        Jarvis, monta o plano
      </button>

      {/* Plano gerado */}
      {resultados.length > 0 && (
        <div className="bg-[#161b24] border border-[#2a3550] rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">Plano gerado pelo Jarvis</h3>
          {resultados.map((r, i) => (
            <div key={i} className={cn(
              'flex items-center justify-between p-3 rounded-lg',
              r.ok ? 'bg-green-950 border border-green-800' : 'bg-red-950 border border-red-800',
            )}>
              <div>
                <p className="text-sm font-medium text-white capitalize">{String(r.tipo)}</p>
                {r.ok ? (
                  <p className="text-xs text-[#6b7fa3] mt-0.5">
                    Campaign {String(r.campaign_id)} • Adset {String(r.adset_id)}
                  </p>
                ) : (
                  <p className="text-xs text-red-400 mt-0.5">{String(r.erro)}</p>
                )}
              </div>
              {r.ok
                ? <CheckCircle className="w-5 h-5 text-green-400" />
                : <XCircle className="w-5 h-5 text-red-400" />}
            </div>
          ))}

          <button
            onClick={aprovarESubir}
            disabled={subindo}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#059669] text-white font-medium hover:bg-emerald-600 transition disabled:opacity-50"
          >
            {subindo ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Aprovar e subir agora
          </button>
        </div>
      )}

      {toast && <Toast msg={toast.msg} tipo={toast.tipo} />}
    </div>
  );
}

/* ─── Section 3: Otimizações Pendentes ───────────────────────────────────── */

function OtimizacoesPendentes() {
  const [loading,     setLoading]     = useState(false);
  const [executando,  setExecutando]  = useState<string | null>(null);
  const [sugestoes,   setSugestoes]   = useState<Sugestao[]>([]);
  const [ignoradas,   setIgnoradas]   = useState<Set<string>>(new Set());
  const [toast,       setToast]       = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null);

  const analisar = useCallback(async () => {
    setLoading(true);
    setSugestoes([]);
    try {
      const data = await callJarvis('otimizar_campanhas');
      setSugestoes(data.sugestoes ?? []);
    } catch (err) {
      setToast({ msg: String(err), tipo: 'erro' });
    } finally {
      setLoading(false);
      setTimeout(() => setToast(null), 4000);
    }
  }, []);

  const aprovar = useCallback(async (s: Sugestao) => {
    setExecutando(s.adset_id);
    try {
      await callJarvis('executar_otimizacao', {
        adset_id: s.adset_id,
        acao:     s.acao,
        valor:    s.valor,
      });
      setToast({ msg: `Ação "${s.acao}" executada com sucesso.`, tipo: 'ok' });
      setSugestoes(prev => prev.filter(x => x.adset_id !== s.adset_id));
    } catch (err) {
      setToast({ msg: String(err), tipo: 'erro' });
    } finally {
      setExecutando(null);
      setTimeout(() => setToast(null), 4000);
    }
  }, []);

  const ignorar = (s: Sugestao) => {
    setIgnoradas(prev => new Set(prev).add(s.adset_id));
    setSugestoes(prev => prev.filter(x => x.adset_id !== s.adset_id));
  };

  const ACAO_LABEL: Record<string, string>  = {
    pausar:            'Pausar',
    ativar:            'Ativar',
    aumentar_orcamento:'Aumentar orçamento +20%',
    trocar_criativo:   'Trocar criativo',
  };

  const ACAO_ICON: Record<string, React.ReactNode> = {
    pausar:            <Pause className="w-4 h-4" />,
    ativar:            <Play className="w-4 h-4" />,
    aumentar_orcamento:<TrendingUp className="w-4 h-4" />,
    trocar_criativo:   <Eye className="w-4 h-4" />,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-400" />
          Otimizações Pendentes
        </h2>
        <button
          onClick={analisar}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          Analisar campanhas
        </button>
      </div>

      {!loading && sugestoes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-[#6b7fa3]">
          <AlertTriangle className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">Clique em "Analisar campanhas" para o Jarvis verificar sua conta.</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        </div>
      )}

      {sugestoes.map(s => (
        <div key={s.adset_id} className="bg-[#161b24] border border-[#2a3550] rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{s.adset_nome}</p>
              <p className="text-sm text-yellow-300 mt-1 flex items-center gap-1.5">
                {ACAO_ICON[s.acao]}
                {ACAO_LABEL[s.acao] ?? s.acao}
              </p>
              <p className="text-xs text-[#6b7fa3] mt-1">{s.motivo}</p>
              <p className="text-xs text-blue-400 mt-0.5 flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />
                {s.impacto_estimado}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => aprovar(s)}
                disabled={executando === s.adset_id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#059669] text-white text-xs font-medium hover:bg-emerald-600 transition disabled:opacity-50"
              >
                {executando === s.adset_id
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <CheckCircle className="w-3 h-3" />}
                Aprovar
              </button>
              <button
                onClick={() => ignorar(s)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2a3550] text-[#6b7fa3] text-xs font-medium hover:text-white transition"
              >
                <XCircle className="w-3 h-3" />
                Ignorar
              </button>
            </div>
          </div>
        </div>
      ))}

      {toast && <Toast msg={toast.msg} tipo={toast.tipo} />}
    </div>
  );
}

/* ─── Helpers visuais ─────────────────────────────────────────────────────── */

function Section({ titulo, icon, children }: { titulo: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-[#161b24] border border-[#2a3550] rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
        {icon}
        {titulo}
      </h3>
      {children}
    </div>
  );
}

function Empty({ texto }: { texto: string }) {
  return <p className="text-xs text-[#6b7fa3] text-center py-3">{texto}</p>;
}

/* ─── Panel principal ─────────────────────────────────────────────────────── */

type TabJarvis = 'visao' | 'criar' | 'otimizar';

export function JarvisAgentPanel() {
  const [tab, setTab] = useState<TabJarvis>('visao');

  const TABS: { id: TabJarvis; label: string; icon: React.ReactNode }[] = [
    { id: 'visao',   label: 'Visão Atual',          icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'criar',   label: 'Criar Campanha',        icon: <Zap className="w-4 h-4" /> },
    { id: 'otimizar',label: 'Otimizações Pendentes', icon: <AlertTriangle className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-full bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 pt-6 pb-4">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">Agente Jarvis</h1>
          <p className="text-xs text-[#6b7fa3]">Dados em tempo real da Meta API</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pb-4 border-b border-[#2a3550]">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition',
              tab === t.id
                ? 'bg-[#1e3a5f] text-white'
                : 'text-[#6b7fa3] hover:text-white hover:bg-[#161b24]',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6">
        {tab === 'visao'    && <VisaoAtual />}
        {tab === 'criar'    && <CriarCampanha />}
        {tab === 'otimizar' && <OtimizacoesPendentes />}
      </div>
    </div>
  );
}

export default JarvisAgentPanel;
