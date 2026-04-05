'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import {
  Bot, DollarSign, Users, MessageCircle,
  TrendingUp, CheckCircle, XCircle, Loader2,
  Sparkles, ChevronRight, Play, AlertCircle, ShoppingBag,
  Plus, Trash2, Image as ImageIcon,
} from 'lucide-react';
import type { TipoCampanha } from '@/lib/services/meta-adset-creator.service';
import { cn } from '@/lib/utils';

/* ─── Tipos ──────────────────────────────────────────────────────────────── */

interface IAPublicoPicker {
  id: string;
  nome: string;
  tipo: string;
  meta_audience_id?: string;
  tamanho_estimado?: string;
  estimativa_alcance_min?: number;
  estimativa_alcance_max?: number;
}

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

type TipoConjunto = 'frio' | 'quente' | 'whatsapp';

interface Conjunto {
  id: string;
  tipo: TipoConjunto;
  criativoIds: string[];
}

interface CriativoDisponivel {
  id: string;
  nome: string;
  tipo: 'video' | 'imagem';
  url_preview: string | null;
  meta_video_id: string | null;
  meta_image_hash: string | null;
}

const TIPOS_CONFIG = {
  frio:     { label: 'Público frio',   icon: Users,         desc: 'Novos clientes por interesse' },
  quente:   { label: 'Público quente', icon: TrendingUp,    desc: 'Remarketing — já te conhecem' },
  whatsapp: { label: 'WhatsApp',       icon: MessageCircle, desc: 'Mensagens diretas' },
  catalogo: { label: 'Catálogo',       icon: ShoppingBag,   desc: 'Anúncios dinâmicos de produtos' },
} as const;

const TIPOS_CONJUNTO: Record<TipoConjunto, { label: string; icon: typeof Users }> = {
  frio:     { label: 'Público Frio',   icon: Users },
  quente:   { label: 'Público Quente', icon: TrendingUp },
  whatsapp: { label: 'WhatsApp',       icon: MessageCircle },
};

const CATALOGOS = [
  { id: '740174445143215', nome: 'CJ Rasteirinhas Atacado' },
  { id: '860022402952098', nome: 'Fácilzap 2024' },
] as const;

const PESOS: Record<TipoCampanha, number> = { frio: 0.3, quente: 0.2, whatsapp: 0.5, catalogo: 0.4 };
const MAX_CONJUNTOS = 5;
const MAX_CRIATIVOS_POR_CONJUNTO = 5;

/* ─── Componente ─────────────────────────────────────────────────────────── */

export function AgenteTrafegoPanel() {
  const [fase, setFase]             = useState<Fase>('config');
  const [orcamento, setOrcamento]   = useState(50);
  const [tipos, setTipos]           = useState<TipoCampanha[]>(['frio', 'whatsapp']);
  const [nome, setNome]             = useState('');
  const [catalogoId, setCatalogoId] = useState<string>(CATALOGOS[0].id);
  const [steps, setSteps]           = useState<Step[]>([]);
  const [done, setDone]             = useState<DoneEvent | null>(null);
  const esRef                       = useRef<EventSource | null>(null);

  // Públicos IA disponíveis
  const [publicosIA, setPublicosIA]           = useState<IAPublicoPicker[]>([]);
  const [audienciasPorTipo, setAudienciasPorTipo] = useState<Partial<Record<TipoCampanha, string>>>({});

  // Modo avançado (múltiplos conjuntos)
  const [modoAvancado, setModoAvancado] = useState(false);
  const [conjuntos, setConjuntos]       = useState<Conjunto[]>([
    { id: '1', tipo: 'frio', criativoIds: [] },
  ]);
  const [criativos, setCriativos]       = useState<CriativoDisponivel[]>([]);
  const [loadingCriativos, setLoadingCriativos] = useState(false);

  // Buscar criativos quando entrar no modo avançado
  const fetchCriativos = useCallback(async () => {
    setLoadingCriativos(true);
    try {
      const accessToken = useAuthStore.getState().accessToken ?? '';
      const res = await fetch('/api/meta/criativos?limit=20', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCriativos(data.criativos ?? data ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingCriativos(false);
    }
  }, []);

  useEffect(() => {
    if (modoAvancado && criativos.length === 0) fetchCriativos();
  }, [modoAvancado, criativos.length, fetchCriativos]);

  // Carregar públicos IA + ler seleção prévia do sessionStorage
  useEffect(() => {
    const accessToken = useAuthStore.getState().accessToken ?? '';
    fetch('/api/ai-team/create-audiences', { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(r => r.json())
      .then((d: { publicos?: IAPublicoPicker[] }) => {
        const lista = (d.publicos ?? []).filter(p => p.meta_audience_id);
        setPublicosIA(lista);
        // Ler seleção prévia gravada na aba Públicos
        try {
          const saved = sessionStorage.getItem('agente_publico_ia');
          if (saved) {
            const { id, tipo } = JSON.parse(saved) as { id: string; tipo: string };
            const tipoMapped = tipo === 'remarketing' ? 'quente' : 'frio';
            setAudienciasPorTipo({ [tipoMapped as TipoCampanha]: id });
          }
        } catch { /* ignora */ }
      })
      .catch(() => {});
  }, []);

  function calcOrc(tipo: TipoCampanha): number {
    const totalPeso = tipos.reduce((a, t) => a + PESOS[t], 0);
    return Math.round((orcamento * PESOS[tipo]) / totalPeso);
  }

  function calcOrcConjunto(): number {
    if (conjuntos.length === 0) return 0;
    return Math.floor(orcamento / conjuntos.length);
  }

  function calcOrcConjuntoResto(idx: number): number {
    const base = calcOrcConjunto();
    const resto = orcamento - base * conjuntos.length;
    return idx < resto ? base + 1 : base;
  }

  function toggleTipo(tipo: TipoCampanha) {
    setTipos(prev => prev.includes(tipo) ? prev.filter(t => t !== tipo) : [...prev, tipo]);
  }

  function setAudiencia(tipo: TipoCampanha, audienceId: string) {
    setAudienciasPorTipo(prev => ({ ...prev, [tipo]: audienceId || undefined }));
  }

  function adicionarConjunto() {
    if (conjuntos.length >= MAX_CONJUNTOS) return;
    const usados = conjuntos.map(c => c.tipo);
    const proximo = (['frio', 'quente', 'whatsapp'] as TipoConjunto[]).find(t => !usados.includes(t)) ?? 'frio';
    setConjuntos(prev => [...prev, { id: String(Date.now()), tipo: proximo, criativoIds: [] }]);
  }

  function removerConjunto(id: string) {
    setConjuntos(prev => prev.filter(c => c.id !== id));
  }

  function atualizarConjunto(id: string, updates: Partial<Conjunto>) {
    setConjuntos(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }

  function toggleCriativo(conjuntoId: string, criativoId: string) {
    setConjuntos(prev => prev.map(c => {
      if (c.id !== conjuntoId) return c;
      const has = c.criativoIds.includes(criativoId);
      if (has) return { ...c, criativoIds: c.criativoIds.filter(id => id !== criativoId) };
      if (c.criativoIds.length >= MAX_CRIATIVOS_POR_CONJUNTO) return c;
      return { ...c, criativoIds: [...c.criativoIds, criativoId] };
    }));
  }

  function voltar() {
    esRef.current?.close();
    setFase('config');
    setDone(null);
    setSteps([]);
  }

  function podeExecutar(): boolean {
    if (modoAvancado) {
      return conjuntos.length > 0 && conjuntos.every(c => c.criativoIds.length >= 1);
    }
    return tipos.length > 0;
  }

  function executar() {
    setFase('executando');
    setSteps([]);
    setDone(null);

    const accessToken = useAuthStore.getState().accessToken ?? '';
    const nomeBase = nome || `Agente ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;

    const params = new URLSearchParams({
      token:      accessToken,
      orcamento:  String(orcamento),
      nome:       nomeBase,
      catalogoId,
    });

    // Públicos IA selecionados por tipo
    const audienciasAtivas = Object.entries(audienciasPorTipo).filter(([, v]) => v);
    if (audienciasAtivas.length > 0) {
      params.set('audiencias', JSON.stringify(Object.fromEntries(audienciasAtivas)));
    }

    if (modoAvancado) {
      // Modo avançado: enviar conjuntos como JSON
      const conjuntosPayload = conjuntos.map((c, idx) => ({
        tipo: c.tipo,
        orcamentoDiario: calcOrcConjuntoResto(idx) * 100, // reais → centavos
        criativoIds: c.criativoIds,
      }));
      params.set('conjuntos', JSON.stringify(conjuntosPayload));
      params.set('tipos', conjuntos.map(c => c.tipo).join(','));
    } else {
      params.set('tipos', tipos.join(','));
    }

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

      {/* Toggle modo avançado */}
      <div className="flex items-center justify-between p-3 bg-purple-50 border border-purple-200 rounded-xl">
        <div>
          <p className="text-sm font-medium text-gray-800">Configuração avançada</p>
          <p className="text-xs text-gray-500">Múltiplos conjuntos com criativos selecionados</p>
        </div>
        <button
          onClick={() => setModoAvancado(!modoAvancado)}
          className={cn(
            'relative w-11 h-6 rounded-full transition-colors',
            modoAvancado ? 'bg-[#1e3a5f]' : 'bg-gray-300',
          )}
        >
          <div className={cn(
            'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
            modoAvancado ? 'translate-x-[22px]' : 'translate-x-0.5',
          )} />
        </button>
      </div>

      {/* ── Modo Simples ──────────────────────────────────────────────── */}
      {!modoAvancado && (
        <>
          {/* Tipos */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Tipos de campanha</label>
            <div className="space-y-2">
              {(Object.entries(TIPOS_CONFIG) as [TipoCampanha, typeof TIPOS_CONFIG[TipoCampanha]][]).map(([tipo, cfg]) => {
                const ativo = tipos.includes(tipo);
                const Icon = cfg.icon;
                // Públicos IA compatíveis com este tipo
                const publicosCompativeis = publicosIA.filter(p => {
                  if (tipo === 'quente') return p.tipo === 'remarketing' || p.tipo === 'engagement';
                  if (tipo === 'frio')   return p.tipo === 'interesse' || p.tipo === 'interest';
                  return false;
                });
                const audienciaSelecionada = audienciasPorTipo[tipo];
                return (
                  <div key={tipo}>
                    <button onClick={() => toggleTipo(tipo)}
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
                    {/* Seletor de público IA (só tipos com públicos disponíveis e ativo) */}
                    {ativo && publicosCompativeis.length > 0 && (
                      <div className="mt-1 ml-3 pl-3 border-l-2 border-[#1e3a5f]/20">
                        <p className="text-[10px] text-gray-400 mb-1">Público para este tipo:</p>
                        <select
                          value={audienciaSelecionada ?? ''}
                          onChange={e => setAudiencia(tipo, e.target.value)}
                          className="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]/30"
                        >
                          <option value="">🤖 Agente cria targeting do zero</option>
                          {publicosCompativeis.map(p => (
                            <option key={p.meta_audience_id} value={p.meta_audience_id}>
                              👥 {p.nome}
                            </option>
                          ))}
                        </select>
                        {audienciaSelecionada && (
                          <p className="text-[10px] text-green-600 mt-0.5">✓ Público da IA será usado neste conjunto</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Seletor de catálogo */}
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
        </>
      )}

      {/* ── Modo Avançado ─────────────────────────────────────────────── */}
      {modoAvancado && (
        <div className="space-y-4">
          <label className="block text-xs font-medium text-gray-600">Conjuntos de anúncio</label>

          {loadingCriativos && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <Loader2 size={14} className="text-blue-500 animate-spin" />
              <span className="text-sm text-blue-700">Carregando criativos...</span>
            </div>
          )}

          {conjuntos.map((conjunto, idx) => {
            const tipoCfg = TIPOS_CONJUNTO[conjunto.tipo];
            const Icon = tipoCfg.icon;
            const orcConjunto = calcOrcConjuntoResto(idx);

            return (
              <div key={conjunto.id} className="border border-gray-200 rounded-xl overflow-hidden">
                {/* Header do conjunto */}
                <div className="flex items-center justify-between p-3 bg-gray-50 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#1e3a5f] flex items-center justify-center">
                      <Icon size={13} className="text-white" />
                    </div>
                    <select
                      value={conjunto.tipo}
                      onChange={e => atualizarConjunto(conjunto.id, { tipo: e.target.value as TipoConjunto })}
                      className="text-sm font-medium text-gray-800 bg-transparent border-none focus:outline-none cursor-pointer"
                    >
                      <option value="frio">Público Frio</option>
                      <option value="quente">Público Quente</option>
                      <option value="whatsapp">WhatsApp</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#1e3a5f]">R${orcConjunto}/dia</span>
                    {conjuntos.length > 1 && (
                      <button onClick={() => removerConjunto(conjunto.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Grid de criativos */}
                <div className="p-3">
                  <p className="text-xs text-gray-500 mb-2">
                    Criativos ({conjunto.criativoIds.length}/{MAX_CRIATIVOS_POR_CONJUNTO})
                    {conjunto.criativoIds.length === 0 && <span className="text-red-400 ml-1">— selecione ao menos 1</span>}
                  </p>
                  {criativos.length === 0 && !loadingCriativos ? (
                    <p className="text-xs text-gray-400 italic">Nenhum criativo disponível</p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {criativos.map(criativo => {
                        const selecionado = conjunto.criativoIds.includes(criativo.id);
                        return (
                          <button
                            key={criativo.id}
                            onClick={() => toggleCriativo(conjunto.id, criativo.id)}
                            className={cn(
                              'relative aspect-square rounded-lg border-2 overflow-hidden transition-all group',
                              selecionado
                                ? 'border-[#1e3a5f] ring-2 ring-[#1e3a5f]/20'
                                : 'border-gray-200 hover:border-gray-300',
                            )}
                          >
                            {criativo.url_preview ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={criativo.url_preview}
                                alt={criativo.nome}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                                <ImageIcon size={16} className="text-gray-400" />
                              </div>
                            )}
                            {selecionado && (
                              <div className="absolute inset-0 bg-[#1e3a5f]/30 flex items-center justify-center">
                                <CheckCircle size={20} className="text-white drop-shadow" />
                              </div>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                              <p className="text-[10px] text-white truncate">{criativo.nome}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Botão adicionar conjunto */}
          {conjuntos.length < MAX_CONJUNTOS && (
            <button
              onClick={adicionarConjunto}
              className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-[#1e3a5f] hover:text-[#1e3a5f] transition-colors"
            >
              <Plus size={14} /> Adicionar conjunto
            </button>
          )}

          <div className="flex items-center justify-between text-xs text-gray-500 px-1">
            <span>Total: R${orcamento}/dia</span>
            <span>{conjuntos.length} conjunto(s) · {conjuntos.reduce((a, c) => a + c.criativoIds.length, 0)} criativo(s)</span>
          </div>
        </div>
      )}

      <button
        onClick={() => setFase('confirmacao')}
        disabled={!podeExecutar()}
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

        {modoAvancado ? (
          <>
            <p className="text-sm text-gray-700 font-medium">1 campanha com {conjuntos.length} conjunto(s):</p>
            {conjuntos.map((conjunto, idx) => {
              const tipoCfg = TIPOS_CONJUNTO[conjunto.tipo];
              const Icon = tipoCfg.icon;
              const orcConjunto = calcOrcConjuntoResto(idx);
              const criativosSelecionados = criativos.filter(c => conjunto.criativoIds.includes(c.id));

              return (
                <div key={conjunto.id} className="py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-[#1e3a5f]/10 flex items-center justify-center shrink-0">
                      <Icon size={13} className="text-[#1e3a5f]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{tipoCfg.label}</p>
                      <p className="text-xs text-gray-400">R${orcConjunto}/dia · {criativosSelecionados.length} criativo(s)</p>
                    </div>
                    <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">PAUSADA</span>
                  </div>
                  {criativosSelecionados.length > 0 && (
                    <div className="mt-2 ml-10 flex flex-wrap gap-1">
                      {criativosSelecionados.map(c => (
                        <span key={c.id} className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{c.nome}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        ) : (
          <>
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
          </>
        )}

        <div className="pt-1 flex items-center justify-between">
          <span className="text-xs text-gray-500">Total: R${orcamento}/dia</span>
          <span className="text-xs text-gray-400">
            {modoAvancado
              ? `${conjuntos.length} conjunto(s)`
              : `${tipos.length} campanha${tipos.length > 1 ? 's' : ''}`}
          </span>
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
