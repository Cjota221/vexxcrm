'use client';

import React, { useState, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import {
  Bot, RefreshCw, Loader2, CheckCircle, XCircle, AlertTriangle,
  TrendingUp, Users, Video, BarChart3, Play, Pause,
  DollarSign, Zap, ChevronRight, Eye, Clock, History, Target, ShoppingBag,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─── Auth helper ─────────────────────────────────────────────────────────── */

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

async function atomicPost(url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await authFetch(url, { method: 'POST', body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? JSON.stringify(json));
  return json as Record<string, unknown>;
}

/* ─── Formatters ──────────────────────────────────────────────────────────── */

function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function fmtDuracao(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtData(iso: string): string {
  try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); }
  catch { return ''; }
}

/* ─── Toast ───────────────────────────────────────────────────────────────── */

function Toast({ msg, tipo }: { msg: string; tipo: 'ok' | 'erro' }) {
  return (
    <div className={cn(
      'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium max-w-sm',
      tipo === 'ok' ? 'bg-green-900 text-green-100' : 'bg-red-900 text-red-100',
    )}>
      {tipo === 'ok' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
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

interface PublicoMeta {
  id: string;
  name: string;
  subtype: string;
  approximate_count_lower_bound?: number;
  approximate_count_upper_bound?: number;
}

// Vídeo como vem da Meta API (buscar_contexto)
interface VideoRaw {
  id: string;
  title?: string;
  length?: number;
  created_time?: string;
  thumbnails?: { data?: Array<{ uri: string }> };
}

// Vídeo normalizado (retornado pelo montar_plano)
interface VideoInfo {
  id: string;
  title: string;
  thumbnail: string | null;
  length: number | null;
  created_time: string | null;
}

interface InsightCampanha {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  ctr?: string;
  purchase_roas?: Array<{ value: string }>;
}

interface Contexto {
  campanhas: Campanha[];
  publicos:  PublicoMeta[];
  videos:    VideoRaw[];
  insights:  InsightCampanha[];
}

interface PlanoConjunto {
  tipo: 'frio' | 'quente' | 'whatsapp';
  publico_nome: string;
  meta_audience_id: string | null;
  targeting_base?: Record<string, unknown>;
  orcamento_reais: number;
  objetivo: string;
  video_ids: string[];
  videos: VideoInfo[];
}

interface Plano {
  conjuntos: PlanoConjunto[];
  objetivo: string;
  orcamento_total: number;
}

interface ResultadoConjunto {
  tipo: string;
  ok: boolean;
  campaign_id?: string;
  adset_id?: string;
  ads_ids?: string[];
  total_ads?: number;
  publico_nome?: string;
  nome?: string;
  erro?: string;
}

interface CampanhaHistorico {
  nome: string;
  conjuntos: ResultadoConjunto[];
  criado_em: string;
}

interface Sugestao {
  adset_id:         string;
  adset_nome:       string;
  acao:             string;
  motivo:           string;
  impacto_estimado: string;
  valor?:           number;
  metricas?:        Record<string, number>;
  campaign_id?:     string;
}

/* ─── Helpers visuais ─────────────────────────────────────────────────────── */

function Section({ titulo, icon, children }: { titulo: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-[#161b24] border border-[#2a3550] rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2">{icon}{titulo}</h3>
      {children}
    </div>
  );
}

function Empty({ texto }: { texto: string }) {
  return <p className="text-xs text-[#6b7fa3] text-center py-3">{texto}</p>;
}

const TIPO_LABEL: Record<string, string> = { frio: 'Público Frio', quente: 'Público Quente', whatsapp: 'WhatsApp' };
const TIPO_EMOJI: Record<string, string> = { frio: '❄️', quente: '🔥', whatsapp: '💬' };
const OBJETIVO_LABEL: Record<string, string> = {
  OUTCOME_SALES: 'Vendas', OUTCOME_LEADS: 'Leads', OUTCOME_TRAFFIC: 'Tráfego',
};

/* ─── Thumbnail de vídeo (VideoCard) ─────────────────────────────────────── */

function VideoThumb({ thumb, title, length, created_time }: {
  thumb?: string | null; title?: string; length?: number | null; created_time?: string | null;
}) {
  return (
    <div className="bg-[#0d1117] rounded-lg border border-[#2a3550] overflow-hidden">
      {thumb ? (
        <img src={thumb} alt={title ?? ''} className="w-full h-16 object-cover" />
      ) : (
        <div className="w-full h-16 flex items-center justify-center bg-[#1a2030]">
          <Video className="w-5 h-5 text-[#6b7fa3]" />
        </div>
      )}
      <div className="p-1.5">
        <p className="text-xs text-white truncate">{title ?? '—'}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {length != null && <span className="text-xs text-[#6b7fa3]">{fmtDuracao(length)}</span>}
          {created_time && <span className="text-xs text-[#6b7fa3]">{fmtData(created_time)}</span>}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  SECAO 1 — Visão Atual                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

interface VisaoAtualProps {
  contexto: Contexto | null;
  setContexto: (c: Contexto) => void;
}

function VisaoAtual({ contexto, setContexto }: VisaoAtualProps) {
  const [loading,         setLoading]         = useState(false);
  const [toast,           setToast]           = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null);
  const [inlineSugestoes, setInlineSugestoes] = useState<Record<string, Sugestao[]>>({});
  const [analisando,      setAnalisando]      = useState<string | null>(null);
  const [executandoId,    setExecutandoId]    = useState<string | null>(null);

  const analisarCampanha = useCallback(async (campaignId: string) => {
    setAnalisando(campaignId);
    try {
      const data = await callJarvis('otimizar_campanhas');
      const filtradas = ((data.sugestoes ?? []) as Sugestao[]).filter(s => s.campaign_id === campaignId);
      setInlineSugestoes(prev => ({ ...prev, [campaignId]: filtradas }));
      if (filtradas.length === 0) {
        setToast({ msg: 'Jarvis não encontrou otimizações para esta campanha.', tipo: 'ok' });
        setTimeout(() => setToast(null), 4000);
      }
    } catch (err) {
      setToast({ msg: String(err), tipo: 'erro' });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setAnalisando(null);
    }
  }, []);

  const aprovarInline = useCallback(async (campaignId: string, s: Sugestao) => {
    setExecutandoId(s.adset_id + s.acao);
    try {
      await callJarvis('executar_otimizacao', { adset_id: s.adset_id, acao: s.acao, valor: s.valor });
      setInlineSugestoes(prev => ({
        ...prev,
        [campaignId]: (prev[campaignId] ?? []).filter(x => !(x.adset_id === s.adset_id && x.acao === s.acao)),
      }));
      setToast({ msg: `Ação "${s.acao}" executada.`, tipo: 'ok' });
    } catch (err) {
      setToast({ msg: String(err), tipo: 'erro' });
    } finally {
      setExecutandoId(null);
      setTimeout(() => setToast(null), 4000);
    }
  }, []);

  const sincronizar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callJarvis('buscar_contexto');
      setContexto(data);
      setToast({ msg: 'Contexto sincronizado!', tipo: 'ok' });
    } catch (err) {
      setToast({ msg: String(err), tipo: 'erro' });
    } finally {
      setLoading(false);
      setTimeout(() => setToast(null), 4000);
    }
  }, [setContexto]);

  const totalSpend = contexto?.insights.reduce((s, i) => s + parseFloat(i.spend ?? '0'), 0) ?? 0;
  const avgCtr     = contexto?.insights.length
    ? contexto.insights.reduce((s, i) => s + parseFloat(i.ctr ?? '0'), 0) / contexto.insights.length : 0;
  const avgRoas    = contexto?.insights.length
    ? contexto.insights.reduce((s, i) => s + parseFloat(i.purchase_roas?.[0]?.value ?? '0'), 0) / contexto.insights.length : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-400" /> Visão Atual
        </h2>
        <button
          onClick={sincronizar} disabled={loading}
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

      {loading && <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-400" /></div>}

      {contexto && (
        <>
          {/* Métricas resumo */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Gasto 7 dias', valor: fmtBRL(totalSpend),          icon: DollarSign, cor: 'text-yellow-400' },
              { label: 'CTR médio',    valor: `${(avgCtr * 100).toFixed(2)}%`, icon: TrendingUp,  cor: 'text-blue-400' },
              { label: 'ROAS médio',   valor: `${avgRoas.toFixed(2)}x`,    icon: Zap,         cor: 'text-green-400' },
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
              <div key={c.id}>
                <div className="flex items-center justify-between p-3 bg-[#0d1117] rounded-lg border border-[#2a3550]">
                  <div>
                    <p className="text-sm font-medium text-white">{c.name}</p>
                    <p className="text-xs text-[#6b7fa3]">{c.objective ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.daily_budget && <span className="text-xs text-[#6b7fa3]">{fmtBRL(parseFloat(c.daily_budget) / 100)}/dia</span>}
                    <span className={cn('text-xs px-2 py-1 rounded-full font-medium',
                      c.status === 'ACTIVE' ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300')}>
                      {c.status}
                    </span>
                    <button
                      onClick={() => analisarCampanha(c.id)}
                      disabled={analisando === c.id}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#1e3a5f] text-white text-xs font-medium hover:bg-blue-700 transition disabled:opacity-50"
                    >
                      {analisando === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                      Otimizar
                    </button>
                  </div>
                </div>

                {/* Sugestões inline por campanha */}
                {(inlineSugestoes[c.id] ?? []).length > 0 && (
                  <div className="mt-1 space-y-1 pl-3 border-l-2 border-[#1e3a5f] ml-2">
                    {inlineSugestoes[c.id].map((s, i) => (
                      <div key={`${s.adset_id}-${i}`} className="flex items-center justify-between p-2 bg-[#161b24] border border-[#2a3550] rounded-lg">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-white truncate">{s.adset_nome}</p>
                          <p className="text-xs text-yellow-300 mt-0.5">{s.acao} — {s.motivo}</p>
                        </div>
                        <div className="flex gap-1.5 ml-3 shrink-0">
                          <button
                            onClick={() => aprovarInline(c.id, s)}
                            disabled={executandoId === s.adset_id + s.acao}
                            className="px-2 py-1 rounded bg-[#059669] text-white text-xs hover:bg-emerald-600 transition disabled:opacity-50"
                          >
                            {executandoId === s.adset_id + s.acao ? <Loader2 className="w-3 h-3 animate-spin" /> : '✓'}
                          </button>
                          <button
                            onClick={() => setInlineSugestoes(prev => ({
                              ...prev,
                              [c.id]: prev[c.id].filter((_, j) => j !== i),
                            }))}
                            className="px-2 py-1 rounded bg-[#2a3550] text-[#6b7fa3] text-xs hover:text-white transition"
                          >✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                    {p.approximate_count_lower_bound && (
                      <span className="text-xs text-blue-400">
                        ~{(p.approximate_count_lower_bound / 1000).toFixed(0)}–{((p.approximate_count_upper_bound ?? p.approximate_count_lower_bound) / 1000).toFixed(0)}K
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Vídeos — com thumbnail corrigida (thumbnails.data[0].uri) */}
          <Section titulo="Vídeos Disponíveis" icon={<Video className="w-4 h-4 text-orange-400" />}>
            {contexto.videos.length === 0 && <Empty texto="Nenhum vídeo encontrado." />}
            <div className="grid grid-cols-3 gap-2">
              {contexto.videos.slice(0, 9).map(v => (
                <VideoThumb
                  key={v.id}
                  thumb={v.thumbnails?.data?.[0]?.uri}
                  title={v.title || `Vídeo ${v.id.slice(-6)}`}
                  length={v.length}
                  created_time={v.created_time}
                />
              ))}
            </div>
          </Section>
        </>
      )}

      {toast && <Toast msg={toast.msg} tipo={toast.tipo} />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  SECAO 2 — Criar Campanha                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

interface CriarCampanhaProps {
  historico:     CampanhaHistorico[];
  addHistorico:  (c: CampanhaHistorico) => void;
}

function CriarCampanha({ historico, addHistorico }: CriarCampanhaProps) {
  const [objetivo,      setObjetivo]      = useState<string>('OUTCOME_SALES');
  const [orcamento,     setOrcamento]     = useState<string>('60');
  const [tipoFrio,      setTipoFrio]      = useState(true);
  const [tipoQuente,    setTipoQuente]    = useState(false);
  const [tipoWa,        setTipoWa]        = useState(false);
  const [plano,         setPlano]         = useState<Plano | null>(null);
  const [loadingPlano,  setLoadingPlano]  = useState(false);
  const [loadingSubir,  setLoadingSubir]  = useState(false);
  const [progresso,     setProgresso]     = useState<string[]>([]);
  const [toast,         setToast]         = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null);

  const tiposEscolhidos = [
    tipoFrio   ? 'frio'     : null,
    tipoQuente ? 'quente'   : null,
    tipoWa     ? 'whatsapp' : null,
  ].filter(Boolean) as Array<'frio' | 'quente' | 'whatsapp'>;

  const mostrarToast = (msg: string, tipo: 'ok' | 'erro') => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 5000);
  };

  const montarPlano = useCallback(async () => {
    if (tiposEscolhidos.length === 0) {
      mostrarToast('Selecione ao menos um tipo de público.', 'erro');
      return;
    }
    setLoadingPlano(true);
    setPlano(null);
    try {
      const data = await callJarvis('montar_plano', {
        objetivo,
        orcamento_diario: parseFloat(orcamento) || 60,
        tipos_publico:    tiposEscolhidos,
      });
      setPlano(data as Plano);
    } catch (err) {
      mostrarToast(String(err), 'erro');
    } finally {
      setLoadingPlano(false);
    }
  }, [objetivo, orcamento, tiposEscolhidos]);

  const aprovarESubir = useCallback(async () => {
    if (!plano) return;
    setLoadingSubir(true);
    setProgresso([]);
    const add = (msg: string) => setProgresso(prev => [...prev, msg]);
    const PAGE_ID  = '101337882545607';
    const dataStr  = new Date().toLocaleDateString('pt-BR');
    const horaStr  = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const resultadosConjuntos: ResultadoConjunto[] = [];

    try {
      // 1. Criar campanha (1 chamada Meta)
      add('⏳ Criando campanha...');
      const { campaign_id } = await atomicPost('/api/meta/jarvis-agent/criar-campanha', {
        objetivo:  plano.objetivo,
        nome_base: `[Jarvis] ${dataStr}`,
      });
      add('✅ Campanha criada');

      // 2. Para cada conjunto: adset + criativos
      for (const conj of plano.conjuntos) {
        const nomeBase = `[Jarvis] ${conj.tipo.toUpperCase()} — ${dataStr}`;

        // 2a. Adset (1 chamada Meta)
        add(`⏳ Criando adset ${TIPO_EMOJI[conj.tipo]} ${TIPO_LABEL[conj.tipo]}...`);
        let adset_id: string;
        try {
          const res = await atomicPost('/api/meta/jarvis-agent/criar-adset', {
            campaign_id:        campaign_id as string,
            tipo:               conj.tipo,
            nome_base:          nomeBase,
            orcamento_centavos: Math.round(conj.orcamento_reais * 100),
            targeting_base:     conj.targeting_base ?? {},
            meta_audience_id:   conj.meta_audience_id,
            objetivo:           plano.objetivo,
          });
          adset_id = res.adset_id as string;
          add(`✅ Adset ${TIPO_LABEL[conj.tipo]} criado`);
        } catch (err) {
          add(`❌ Adset ${TIPO_LABEL[conj.tipo]}: ${String(err)}`);
          resultadosConjuntos.push({ tipo: conj.tipo, ok: false, erro: String(err) });
          continue;
        }

        // 2b. Criativos (máx 2, cada um = 2 chamadas Meta)
        const adsIds: string[] = [];
        const vidsParaCriar = conj.video_ids.slice(0, 2);
        for (let i = 0; i < vidsParaCriar.length; i++) {
          const vid       = vidsParaCriar[i];
          const videoInfo = conj.videos.find(v => v.id === vid);
          add(`⏳ Criativo ${i + 1} ${TIPO_EMOJI[conj.tipo]} ${TIPO_LABEL[conj.tipo]}...`);
          try {
            const res = await atomicPost('/api/meta/jarvis-agent/criar-criativo', {
              adset_id,
              video_id:  vid,
              tipo:      conj.tipo,
              nome_base: nomeBase,
              page_id:   PAGE_ID,
              thumb_url: videoInfo?.thumbnail ?? undefined,
              indice:    i + 1,
            });
            adsIds.push(res.ad_id as string);
            add(`✅ Criativo ${i + 1} ${TIPO_EMOJI[conj.tipo]} criado`);
          } catch (err) {
            add(`❌ Criativo ${i + 1} ${TIPO_EMOJI[conj.tipo]}: ${String(err)}`);
          }
        }

        resultadosConjuntos.push({
          tipo: conj.tipo, ok: true,
          campaign_id: campaign_id as string,
          adset_id,
          ads_ids:     adsIds,
          total_ads:   adsIds.length,
          publico_nome: conj.publico_nome,
          nome:        nomeBase,
        });
      }

      addHistorico({
        nome:      `Campanha ${dataStr} ${horaStr}`,
        conjuntos: resultadosConjuntos,
        criado_em: horaStr,
      });

      const okCount   = resultadosConjuntos.filter(r => r.ok).length;
      const failCount = resultadosConjuntos.filter(r => !r.ok).length;
      mostrarToast(
        failCount === 0
          ? `${okCount} conjunto(s) criado(s) com sucesso!`
          : `${okCount} criado(s), ${failCount} com erro.`,
        failCount === 0 ? 'ok' : 'erro',
      );
      setPlano(null);
    } catch (err) {
      mostrarToast(String(err), 'erro');
    } finally {
      setLoadingSubir(false);
    }
  }, [plano, addHistorico]);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white flex items-center gap-2">
        <Zap className="w-5 h-5 text-yellow-400" /> Criar Campanha
      </h2>

      {/* Formulário */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-[#6b7fa3] mb-1.5">Objetivo</label>
          <select
            value={objetivo} onChange={e => { setObjetivo(e.target.value); setPlano(null); }}
            className="w-full bg-[#161b24] border border-[#2a3550] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="OUTCOME_SALES">Vendas</option>
            <option value="OUTCOME_LEADS">Leads</option>
            <option value="MESSAGES">Mensagens (WhatsApp)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-[#6b7fa3] mb-1.5">Orçamento diário (R$)</label>
          <input
            type="number" value={orcamento} min={1}
            onChange={e => { setOrcamento(e.target.value); setPlano(null); }}
            className="w-full bg-[#161b24] border border-[#2a3550] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-[#6b7fa3] mb-2">Tipos de público</label>
        <div className="flex gap-4">
          {[
            { label: '❄️ Frio',     value: tipoFrio,   set: (v: boolean) => { setTipoFrio(v);   setPlano(null); }, cor: 'text-blue-400' },
            { label: '🔥 Quente',   value: tipoQuente, set: (v: boolean) => { setTipoQuente(v); setPlano(null); }, cor: 'text-orange-400' },
            { label: '💬 WhatsApp', value: tipoWa,     set: (v: boolean) => { setTipoWa(v);     setPlano(null); }, cor: 'text-green-400' },
          ].map(t => (
            <label key={t.label} className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={t.value} onChange={() => t.set(!t.value)} className="accent-blue-500 w-4 h-4" />
              <span className={cn('text-sm font-medium', t.cor)}>{t.label}</span>
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={montarPlano} disabled={loadingPlano}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1e3a5f] text-white font-medium hover:bg-blue-700 transition disabled:opacity-50"
      >
        {loadingPlano ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
        Jarvis, monta o plano
      </button>

      {/* Plano gerado */}
      {plano && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-400" />
            Plano gerado pelo Jarvis
          </h3>

          {plano.conjuntos.map(conj => (
            <div key={conj.tipo} className="bg-[#161b24] border border-[#2a3550] rounded-xl p-4 space-y-3">
              {/* Header do conjunto */}
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">
                  {TIPO_EMOJI[conj.tipo]} {TIPO_LABEL[conj.tipo]}
                </h4>
                <span className="text-xs text-blue-400">{fmtBRL(conj.orcamento_reais)}/dia</span>
              </div>

              {/* Detalhes */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-[#0d1117] rounded-lg p-2">
                  <span className="text-[#6b7fa3]">Público </span>
                  <span className="text-white font-medium">{conj.publico_nome}</span>
                </div>
                <div className="bg-[#0d1117] rounded-lg p-2">
                  <span className="text-[#6b7fa3]">Objetivo </span>
                  <span className="text-white font-medium">{OBJETIVO_LABEL[conj.objetivo] ?? conj.objetivo}</span>
                </div>
              </div>

              {/* Criativos selecionados */}
              {conj.videos.length > 0 ? (
                <div>
                  <p className="text-xs text-[#6b7fa3] mb-2">
                    Criativos selecionados ({conj.videos.length}):
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {conj.videos.map(v => (
                      <VideoThumb
                        key={v.id}
                        thumb={v.thumbnail}
                        title={v.title}
                        length={v.length}
                        created_time={v.created_time}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-yellow-400">⚠ Nenhum vídeo encontrado na conta — adset será criado sem anúncio.</p>
              )}
            </div>
          ))}

          <button
            onClick={aprovarESubir} disabled={loadingSubir}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#059669] text-white font-semibold hover:bg-emerald-600 transition disabled:opacity-50"
          >
            {loadingSubir ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Aprovar e subir agora
          </button>
        </div>
      )}

      {/* Progresso da criação em tempo real */}
      {progresso.length > 0 && (
        <div className="bg-[#0d1117] border border-[#2a3550] rounded-xl p-4 space-y-1 max-h-52 overflow-y-auto">
          <p className="text-xs text-[#6b7fa3] font-medium mb-2">Progresso da criação:</p>
          {progresso.map((p, i) => (
            <p key={i} className={cn(
              'text-xs font-mono',
              p.startsWith('✅') ? 'text-green-400' : p.startsWith('❌') ? 'text-red-400' : 'text-[#6b7fa3]',
            )}>{p}</p>
          ))}
          {loadingSubir && <span className="inline-block mt-1"><Loader2 className="w-3 h-3 animate-spin text-blue-400" /></span>}
        </div>
      )}

      {/* Histórico da sessão */}
      {historico.length > 0 && (
        <div className="pt-2">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <History className="w-4 h-4 text-blue-400" />
            Últimas campanhas criadas (sessão atual)
          </h3>
          <div className="space-y-2">
            {historico.map((h, i) => (
              <div key={i} className="bg-[#161b24] border border-[#2a3550] rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-white">{h.nome}</p>
                  <span className="text-xs text-[#6b7fa3] flex items-center gap-1">
                    <Clock className="w-3 h-3" />{h.criado_em}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {h.conjuntos.map((c, j) => (
                    <span key={j} className={cn(
                      'text-xs px-2 py-1 rounded-full font-medium',
                      c.ok ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300',
                    )}>
                      {TIPO_EMOJI[c.tipo] ?? ''} {TIPO_LABEL[c.tipo] ?? c.tipo}
                      {c.ok ? ` · ${c.total_ads ?? 0} ad(s)` : ' · erro'}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} tipo={toast.tipo} />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  SECAO 3 — Otimizações Pendentes                                            */
/* ─────────────────────────────────────────────────────────────────────────── */

function OtimizacoesPendentes() {
  const [loading,    setLoading]    = useState(false);
  const [executando, setExecutando] = useState<string | null>(null);
  const [sugestoes,  setSugestoes]  = useState<Sugestao[]>([]);
  const [toast,      setToast]      = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null);

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
      await callJarvis('executar_otimizacao', { adset_id: s.adset_id, acao: s.acao, valor: s.valor });
      setToast({ msg: `Ação "${s.acao}" executada.`, tipo: 'ok' });
      setSugestoes(prev => prev.filter(x => x.adset_id !== s.adset_id));
    } catch (err) {
      setToast({ msg: String(err), tipo: 'erro' });
    } finally {
      setExecutando(null);
      setTimeout(() => setToast(null), 4000);
    }
  }, []);

  const ignorar = (s: Sugestao) => setSugestoes(prev => prev.filter(x => x.adset_id !== s.adset_id));

  const ACAO_LABEL: Record<string, string> = {
    pausar: 'Pausar', ativar: 'Ativar',
    aumentar_orcamento: 'Aumentar orçamento +20%', trocar_criativo: 'Trocar criativo',
  };
  const ACAO_ICON: Record<string, React.ReactNode> = {
    pausar: <Pause className="w-4 h-4" />, ativar: <Play className="w-4 h-4" />,
    aumentar_orcamento: <TrendingUp className="w-4 h-4" />, trocar_criativo: <Eye className="w-4 h-4" />,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-400" /> Otimizações Pendentes
        </h2>
        <button
          onClick={analisar} disabled={loading}
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

      {loading && <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-400" /></div>}

      {sugestoes.map(s => (
        <div key={s.adset_id} className="bg-[#161b24] border border-[#2a3550] rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{s.adset_nome}</p>
              <p className="text-sm text-yellow-300 mt-1 flex items-center gap-1.5">
                {ACAO_ICON[s.acao]} {ACAO_LABEL[s.acao] ?? s.acao}
              </p>
              <p className="text-xs text-[#6b7fa3] mt-1">{s.motivo}</p>
              <p className="text-xs text-blue-400 mt-0.5 flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />{s.impacto_estimado}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => aprovar(s)} disabled={executando === s.adset_id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#059669] text-white text-xs font-medium hover:bg-emerald-600 transition disabled:opacity-50"
              >
                {executando === s.adset_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                Aprovar
              </button>
              <button
                onClick={() => ignorar(s)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2a3550] text-[#6b7fa3] text-xs font-medium hover:text-white transition"
              >
                <XCircle className="w-3 h-3" /> Ignorar
              </button>
            </div>
          </div>
        </div>
      ))}

      {toast && <Toast msg={toast.msg} tipo={toast.tipo} />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Campanha de Catálogo Carrossel                                              */
/* ─────────────────────────────────────────────────────────────────────────── */

function CriarCampanhaCatalogo() {
  const [aberto,    setAberto]    = useState(false);
  const [orcamento, setOrcamento] = useState('50');
  const [loading,   setLoading]   = useState(false);
  const [progresso, setProgresso] = useState<string[]>([]);
  const [toast,     setToast]     = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null);

  const mostrarToast = (msg: string, tipo: 'ok' | 'erro') => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 5000);
  };

  const criar = useCallback(async () => {
    setLoading(true);
    setProgresso(['⏳ Criando campanha de catálogo...']);
    try {
      const res = await atomicPost('/api/meta/jarvis-agent/criar-campanha-catalogo', {
        orcamento_diario: parseFloat(orcamento) || 50,
      });
      setProgresso([
        '✅ Campanha criada',
        '✅ Conjunto de anúncios criado',
        '✅ Criativo carrossel criado',
        '✅ Anúncio criado',
      ]);
      mostrarToast(`Campanha de catálogo criada! ID: ${res.campaign_id}`, 'ok');
      setAberto(false);
    } catch (err) {
      setProgresso(prev => [...prev.slice(0, -1), `❌ ${String(err)}`]);
      mostrarToast(String(err), 'erro');
    } finally {
      setLoading(false);
    }
  }, [orcamento]);

  return (
    <div className="border-t border-[#2a3550] pt-6 mt-6">
      {/* Botão de toggle */}
      <button
        onClick={() => { setAberto(v => !v); setProgresso([]); }}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1a2a1a] border border-[#2a5530] text-green-300 font-medium hover:bg-[#1f3a1f] transition w-full justify-center"
      >
        <ShoppingBag className="w-4 h-4" />
        🛍️ Criar Campanha de Catálogo
      </button>

      {/* Formulário */}
      {aberto && (
        <div className="mt-4 bg-[#161b24] border border-[#2a3550] rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingBag className="w-4 h-4 text-green-400" />
            <h3 className="text-sm font-semibold text-white">Campanha de Catálogo Carrossel</h3>
          </div>
          <p className="text-xs text-[#6b7fa3]">
            Objetivo: Vendas · Otimização: Conversões · Pixel conectado · Público BR 25–55 feminino
          </p>

          <div>
            <label className="block text-xs text-[#6b7fa3] mb-1.5">Orçamento diário (R$)</label>
            <input
              type="number" min={5} value={orcamento}
              onChange={e => setOrcamento(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#2a3550] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
            />
          </div>

          <button
            onClick={criar} disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#059669] text-white font-semibold hover:bg-emerald-600 transition disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {loading ? 'Criando...' : 'Criar agora'}
          </button>
        </div>
      )}

      {/* Progresso */}
      {progresso.length > 0 && (
        <div className="mt-3 bg-[#0d1117] border border-[#2a3550] rounded-xl p-4 space-y-1">
          <p className="text-xs text-[#6b7fa3] font-medium mb-2">Progresso:</p>
          {progresso.map((p, i) => (
            <p key={i} className={cn(
              'text-xs font-mono',
              p.startsWith('✅') ? 'text-green-400' : p.startsWith('❌') ? 'text-red-400' : 'text-[#6b7fa3]',
            )}>{p}</p>
          ))}
          {loading && <Loader2 className="w-3 h-3 animate-spin text-green-400 mt-1" />}
        </div>
      )}

      {toast && <Toast msg={toast.msg} tipo={toast.tipo} />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Panel principal — estado compartilhado ao nível do painel                  */
/* ─────────────────────────────────────────────────────────────────────────── */

type TabJarvis = 'visao' | 'criar' | 'otimizar';

export function JarvisAgentPanel() {
  // Estado compartilhado — persiste ao trocar de aba
  const [contexto,  setContexto]  = useState<Contexto | null>(null);
  const [historico, setHistorico] = useState<CampanhaHistorico[]>([]);
  const [tab,       setTab]       = useState<TabJarvis>('visao');

  const addHistorico = useCallback((c: CampanhaHistorico) => {
    setHistorico(prev => [c, ...prev]);
  }, []);

  const TABS: { id: TabJarvis; label: string; icon: React.ReactNode }[] = [
    { id: 'visao',    label: 'Visão Atual',           icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'criar',    label: 'Criar Campanha',         icon: <Zap className="w-4 h-4" /> },
    { id: 'otimizar', label: 'Otimizações Pendentes',  icon: <AlertTriangle className="w-4 h-4" /> },
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
            key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition',
              tab === t.id ? 'bg-[#1e3a5f] text-white' : 'text-[#6b7fa3] hover:text-white hover:bg-[#161b24]',
            )}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Content — todos os componentes montados mas só o ativo visível */}
      <div className="p-6">
        <div className={tab === 'visao'    ? '' : 'hidden'}><VisaoAtual contexto={contexto} setContexto={setContexto} /></div>
        <div className={tab === 'criar'    ? '' : 'hidden'}>
          <CriarCampanha historico={historico} addHistorico={addHistorico} />
          <CriarCampanhaCatalogo />
        </div>
        <div className={tab === 'otimizar' ? '' : 'hidden'}><OtimizacoesPendentes /></div>
      </div>
    </div>
  );
}

export default JarvisAgentPanel;
