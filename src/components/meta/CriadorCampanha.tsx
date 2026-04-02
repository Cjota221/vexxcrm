'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Plus, ChevronRight, ChevronLeft, Loader2, CheckCircle,
  AlertTriangle, Play, Image as ImageIcon, Target, DollarSign,
  Megaphone, X, RefreshCw, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─── Auth helper ─────────────────────────────────────────────────────────── */

async function getAuthHeader(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : '';
}

/* ─── Tipos ──────────────────────────────────────────────────────────────── */

interface AdCreative {
  id: string;
  nome: string;
  tipo: 'video' | 'imagem';
  url_preview: string | null;
  status: string;
}

interface Interesse {
  id: string;
  name: string;
}

interface CampanhaDraft {
  id: string;
  nome: string;
  objetivo: string;
  status: 'rascunho' | 'publicando' | 'publicado' | 'erro';
  copy_headline: string | null;
  copy_texto: string | null;
  orcamento_diario: number;
  meta_campaign_id: string | null;
  erro: string | null;
  created_at: string;
  ad_creatives: { id: string; nome: string; tipo: string; url_preview: string | null } | null;
}

const OBJETIVOS = [
  { value: 'LEAD_GENERATION', label: 'Geração de Leads',  icon: '📋', desc: 'Formulário dentro do Facebook/Instagram' },
  { value: 'MESSAGES',        label: 'Mensagens',         icon: '💬', desc: 'Direciona para WhatsApp ou Messenger' },
  { value: 'LINK_CLICKS',     label: 'Tráfego',           icon: '🔗', desc: 'Cliques para site ou landing page' },
  { value: 'CONVERSIONS',     label: 'Conversões',        icon: '🎯', desc: 'Otimizado para conversão no site' },
] as const;

const CTAS = [
  { value: 'LEARN_MORE',         label: 'Saiba Mais' },
  { value: 'SIGN_UP',            label: 'Cadastre-se' },
  { value: 'CONTACT_US',         label: 'Fale Conosco' },
  { value: 'WHATSAPP_MESSAGE',   label: 'Enviar WhatsApp' },
  { value: 'GET_QUOTE',          label: 'Solicitar Orçamento' },
  { value: 'BOOK_TRAVEL',        label: 'Reservar' },
  { value: 'SUBSCRIBE',          label: 'Assinar' },
] as const;

/* ─── Props ──────────────────────────────────────────────────────────────── */

interface Props {
  pageId: string;
  whatsappNumber?: string;
}

/* ─── Componente Principal ───────────────────────────────────────────────── */

export function CriadorCampanha({ pageId, whatsappNumber }: Props) {
  const [view, setView] = useState<'lista' | 'criar'>('lista');
  const [drafts, setDrafts] = useState<CampanhaDraft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(true);

  const carregarDrafts = useCallback(async () => {
    setLoadingDrafts(true);
    try {
      const auth = await getAuthHeader();
      const res = await fetch('/api/meta/campanhas', { headers: { Authorization: auth } });
      if (res.ok) setDrafts(await res.json() as CampanhaDraft[]);
    } finally {
      setLoadingDrafts(false);
    }
  }, []);

  useEffect(() => { carregarDrafts(); }, [carregarDrafts]);

  if (view === 'criar') {
    return (
      <WizardCriarCampanha
        pageId={pageId}
        whatsappNumber={whatsappNumber}
        onConcluir={() => { setView('lista'); carregarDrafts(); }}
        onCancelar={() => setView('lista')}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Campanhas criadas</h3>
          <p className="text-xs text-gray-500 mt-0.5">Rascunhos e campanhas publicadas no Meta</p>
        </div>
        <button
          onClick={() => setView('criar')}
          className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={13} /> Nova campanha
        </button>
      </div>

      {/* Lista */}
      {loadingDrafts ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      ) : drafts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Megaphone size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhuma campanha criada ainda</p>
          <p className="text-xs mt-1">Clique em "Nova campanha" para começar</p>
        </div>
      ) : (
        <div className="space-y-3">
          {drafts.map(draft => (
            <DraftCard
              key={draft.id}
              draft={draft}
              pageId={pageId}
              whatsappNumber={whatsappNumber}
              onPublicado={carregarDrafts}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── DraftCard ──────────────────────────────────────────────────────────── */

function DraftCard({
  draft,
  pageId,
  whatsappNumber,
  onPublicado,
}: {
  draft: CampanhaDraft;
  pageId: string;
  whatsappNumber?: string;
  onPublicado: () => void;
}) {
  const [publicando, setPublicando] = useState(false);

  async function publicar() {
    setPublicando(true);
    try {
      const auth = await getAuthHeader();
      const res = await fetch(`/api/meta/campanhas/${draft.id}/publicar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ pageId, whatsappNumber }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) onPublicado();
      else alert(`Erro: ${data.error}`);
    } finally {
      setPublicando(false);
    }
  }

  const statusColors: Record<string, string> = {
    rascunho:   'bg-gray-100 text-gray-600',
    publicando: 'bg-yellow-100 text-yellow-700',
    publicado:  'bg-green-100 text-green-700',
    erro:       'bg-red-100 text-red-700',
  };

  const objetivo = OBJETIVOS.find(o => o.value === draft.objetivo);

  return (
    <div className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">{objetivo?.icon ?? '📣'}</span>
            <span className="text-sm font-medium text-gray-800 truncate">{draft.nome}</span>
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full', statusColors[draft.status] ?? statusColors.rascunho)}>
              {draft.status}
            </span>
          </div>
          <p className="text-xs text-gray-500">{objetivo?.label} · R$ {(draft.orcamento_diario / 100).toFixed(2)}/dia</p>
          {draft.copy_headline && (
            <p className="text-xs text-gray-400 mt-1 truncate">"{draft.copy_headline}"</p>
          )}
          {draft.status === 'erro' && draft.erro && (
            <p className="text-xs text-red-500 mt-1 flex items-start gap-1">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {draft.erro}
            </p>
          )}
          {draft.status === 'publicado' && draft.meta_campaign_id && (
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <CheckCircle size={11} /> ID: {draft.meta_campaign_id}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {(draft.status === 'rascunho' || draft.status === 'erro') && (
            <button
              onClick={publicar}
              disabled={publicando}
              className="flex items-center gap-1 text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {publicando ? <Loader2 size={11} className="animate-spin" /> : <ExternalLink size={11} />}
              {publicando ? 'Publicando…' : 'Publicar'}
            </button>
          )}
          {draft.status === 'publicado' && (
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <CheckCircle size={13} /> Publicado
            </span>
          )}
          {draft.status === 'publicando' && (
            <span className="flex items-center gap-1 text-xs text-yellow-600">
              <Loader2 size={13} className="animate-spin" /> Aguarde…
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Wizard ─────────────────────────────────────────────────────────────── */

interface WizardState {
  step: number;
  nome: string;
  objetivo: string;
  criativoId: string;
  headline: string;
  texto: string;
  cta: string;
  urlDestino: string;
  paises: string[];
  idadeMin: number;
  idadeMax: number;
  genero: 'all' | 'male' | 'female';
  interesses: Interesse[];
  interesseInput: string;
  orcamentoDiario: number;
  dataInicio: string;
  dataFim: string;
}

function WizardCriarCampanha({
  pageId,
  whatsappNumber,
  onConcluir,
  onCancelar,
}: {
  pageId: string;
  whatsappNumber?: string;
  onConcluir: () => void;
  onCancelar: () => void;
}) {
  const [state, setState] = useState<WizardState>({
    step: 1,
    nome: '',
    objetivo: 'MESSAGES',
    criativoId: '',
    headline: '',
    texto: '',
    cta: 'WHATSAPP_MESSAGE',
    urlDestino: '',
    paises: ['BR'],
    idadeMin: 25,
    idadeMax: 55,
    genero: 'all',
    interesses: [],
    interesseInput: '',
    orcamentoDiario: 3000,
    dataInicio: '',
    dataFim: '',
  });

  const [criativos, setCriativos] = useState<AdCreative[]>([]);
  const [buscandoInteresse, setBuscandoInteresse] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    (async () => {
      const auth = await getAuthHeader();
      const res = await fetch('/api/meta/upload', { headers: { Authorization: auth } });
      if (res.ok) {
        const data = await res.json() as AdCreative[];
        setCriativos(data.filter(c => c.status === 'pronto'));
      }
    })();
  }, []);

  function set<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState(prev => ({ ...prev, [key]: value }));
  }

  async function buscarInteresse() {
    if (!state.interesseInput.trim()) return;
    setBuscandoInteresse(true);
    try {
      const auth = await getAuthHeader();
      const res = await fetch(
        `/api/meta/interesses?q=${encodeURIComponent(state.interesseInput)}`,
        { headers: { Authorization: auth } },
      );
      if (res.ok) {
        const data = await res.json() as Interesse[];
        if (data.length > 0) {
          const interesse = data[0];
          if (!state.interesses.find(i => i.id === interesse.id)) {
            set('interesses', [...state.interesses, interesse]);
          }
        }
      }
    } finally {
      setBuscandoInteresse(false);
      set('interesseInput', '');
    }
  }

  async function salvarRascunho() {
    setSalvando(true);
    setErro('');
    try {
      const auth = await getAuthHeader();
      const res = await fetch('/api/meta/campanhas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({
          nome:             state.nome,
          objetivo:         state.objetivo,
          criativo_id:      state.criativoId || undefined,
          copy_headline:    state.headline || undefined,
          copy_texto:       state.texto || undefined,
          copy_cta:         state.cta,
          url_destino:      state.urlDestino || undefined,
          paises:           state.paises,
          idade_min:        state.idadeMin,
          idade_max:        state.idadeMax,
          genero:           state.genero,
          interesses:       state.interesses,
          orcamento_diario: state.orcamentoDiario,
          data_inicio:      state.dataInicio || undefined,
          data_fim:         state.dataFim || undefined,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        onConcluir();
      } else {
        setErro(data.error ?? 'Erro ao salvar rascunho');
      }
    } finally {
      setSalvando(false);
    }
  }

  const STEPS = ['Objetivo', 'Criativo', 'Copy', 'Público', 'Orçamento', 'Revisar'];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Nova campanha</h3>
          <p className="text-xs text-gray-500 mt-0.5">Etapa {state.step} de {STEPS.length} — {STEPS[state.step - 1]}</p>
        </div>
        <button onClick={onCancelar} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Barra de progresso */}
      <div className="flex gap-1">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={cn(
              'flex-1 h-1 rounded-full transition-colors',
              i + 1 <= state.step ? 'bg-blue-500' : 'bg-gray-200',
            )}
          />
        ))}
      </div>

      {/* ── Step 1: Objetivo ── */}
      {state.step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Nome da campanha *</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              placeholder="Ex: Lançamento Junho 2026"
              value={state.nome}
              onChange={e => set('nome', e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-2 block">Objetivo *</label>
            <div className="grid grid-cols-2 gap-2">
              {OBJETIVOS.map(obj => (
                <button
                  key={obj.value}
                  onClick={() => set('objetivo', obj.value)}
                  className={cn(
                    'text-left p-3 rounded-xl border-2 transition-all',
                    state.objetivo === obj.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-100 hover:border-gray-200',
                  )}
                >
                  <span className="text-lg block mb-1">{obj.icon}</span>
                  <span className="text-xs font-medium text-gray-800 block">{obj.label}</span>
                  <span className="text-[10px] text-gray-500">{obj.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Criativo ── */}
      {state.step === 2 && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Selecione o vídeo ou imagem que será usado no anúncio.</p>
          {criativos.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <ImageIcon size={28} className="mx-auto mb-2 opacity-40" />
              <p className="text-xs">Nenhum criativo disponível. Faça upload na aba Criativos.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
              {criativos.map(c => (
                <button
                  key={c.id}
                  onClick={() => set('criativoId', c.id)}
                  className={cn(
                    'text-left rounded-xl border-2 overflow-hidden transition-all',
                    state.criativoId === c.id
                      ? 'border-blue-500'
                      : 'border-gray-100 hover:border-gray-300',
                  )}
                >
                  <div className="aspect-video bg-gray-100 relative">
                    {c.url_preview ? (
                      <img src={c.url_preview} alt={c.nome} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {c.tipo === 'video' ? <Play size={20} className="text-gray-400" /> : <ImageIcon size={20} className="text-gray-400" />}
                      </div>
                    )}
                    {state.criativoId === c.id && (
                      <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                        <CheckCircle size={20} className="text-blue-600" />
                      </div>
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="text-[11px] font-medium text-gray-700 truncate">{c.nome}</p>
                    <p className="text-[10px] text-gray-400">{c.tipo}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400">Pode continuar sem criativo e vincular depois.</p>
        </div>
      )}

      {/* ── Step 3: Copy ── */}
      {state.step === 3 && (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Headline</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              placeholder="Título do anúncio (até 255 chars)"
              value={state.headline}
              onChange={e => set('headline', e.target.value)}
              maxLength={255}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Texto principal</label>
            <textarea
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
              placeholder="Texto do anúncio…"
              value={state.texto}
              onChange={e => set('texto', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">CTA</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                value={state.cta}
                onChange={e => set('cta', e.target.value)}
              >
                {CTAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            {state.cta !== 'WHATSAPP_MESSAGE' && (
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">URL de destino</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  placeholder="https://…"
                  value={state.urlDestino}
                  onChange={e => set('urlDestino', e.target.value)}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Step 4: Público ── */}
      {state.step === 4 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Idade mínima</label>
              <input
                type="number" min={18} max={64}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                value={state.idadeMin}
                onChange={e => set('idadeMin', Number(e.target.value))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Idade máxima</label>
              <input
                type="number" min={19} max={65}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                value={state.idadeMax}
                onChange={e => set('idadeMax', Number(e.target.value))}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Gênero</label>
            <div className="flex gap-2">
              {(['all', 'male', 'female'] as const).map(g => (
                <button
                  key={g}
                  onClick={() => set('genero', g)}
                  className={cn(
                    'flex-1 py-2 rounded-lg text-xs font-medium border-2 transition-all',
                    state.genero === g ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-600 hover:border-gray-200',
                  )}
                >
                  {g === 'all' ? 'Todos' : g === 'male' ? 'Masculino' : 'Feminino'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Interesses</label>
            <div className="flex gap-2">
              <input
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                placeholder="Ex: Empreendedorismo, Marketing…"
                value={state.interesseInput}
                onChange={e => set('interesseInput', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscarInteresse(); } }}
              />
              <button
                onClick={buscarInteresse}
                disabled={buscandoInteresse || !state.interesseInput.trim()}
                className="bg-gray-100 text-gray-600 px-3 py-2 rounded-lg text-xs hover:bg-gray-200 disabled:opacity-40 transition-colors"
              >
                {buscandoInteresse ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              </button>
            </div>
            {state.interesses.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {state.interesses.map(i => (
                  <span
                    key={i.id}
                    className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full"
                  >
                    {i.name}
                    <button
                      onClick={() => set('interesses', state.interesses.filter(x => x.id !== i.id))}
                      className="hover:text-blue-900"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-[10px] text-gray-400 mt-1">Deixe em branco para público amplo (sem interesse específico).</p>
          </div>
        </div>
      )}

      {/* ── Step 5: Orçamento ── */}
      {state.step === 5 && (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">
              Orçamento diário (R$) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
              <input
                type="number" min={5} step={1}
                className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                value={(state.orcamentoDiario / 100).toFixed(2)}
                onChange={e => set('orcamentoDiario', Math.round(parseFloat(e.target.value || '0') * 100))}
              />
            </div>
            <div className="flex gap-2 mt-2">
              {[1000, 3000, 5000, 10000].map(v => (
                <button
                  key={v}
                  onClick={() => set('orcamentoDiario', v)}
                  className={cn(
                    'flex-1 py-1.5 rounded-lg text-xs border transition-all',
                    state.orcamentoDiario === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-500 hover:border-gray-200',
                  )}
                >
                  R${(v / 100).toFixed(0)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Início</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                value={state.dataInicio}
                onChange={e => set('dataInicio', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Fim (opcional)</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                value={state.dataFim}
                onChange={e => set('dataFim', e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Step 6: Revisar ── */}
      {state.step === 6 && (
        <div className="space-y-3">
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <ReviewRow icon="📣" label="Nome" value={state.nome || '—'} />
            <ReviewRow icon={OBJETIVOS.find(o => o.value === state.objetivo)?.icon ?? '🎯'} label="Objetivo" value={OBJETIVOS.find(o => o.value === state.objetivo)?.label ?? state.objetivo} />
            <ReviewRow icon="🎨" label="Criativo" value={criativos.find(c => c.id === state.criativoId)?.nome ?? 'Sem criativo'} />
            <ReviewRow icon="💬" label="Headline" value={state.headline || '—'} />
            <ReviewRow icon="👥" label="Público" value={`${state.idadeMin}–${state.idadeMax} anos · ${state.genero === 'all' ? 'Todos' : state.genero === 'male' ? 'Masculino' : 'Feminino'}${state.interesses.length > 0 ? ` · ${state.interesses.length} interesses` : ''}`} />
            <ReviewRow icon="💰" label="Orçamento" value={`R$ ${(state.orcamentoDiario / 100).toFixed(2)}/dia`} />
            {(state.dataInicio || state.dataFim) && (
              <ReviewRow icon="📅" label="Período" value={`${state.dataInicio || '—'} → ${state.dataFim || 'sem fim'}`} />
            )}
          </div>
          <div className="bg-blue-50 rounded-xl p-3">
            <p className="text-xs text-blue-700 flex items-start gap-1.5">
              <Target size={13} className="mt-0.5 shrink-0" />
              A campanha será criada como <strong>PAUSADA</strong> no Meta. Você ativa manualmente no Gerenciador de Anúncios.
            </p>
          </div>
          {erro && (
            <div className="bg-red-50 rounded-xl p-3">
              <p className="text-xs text-red-600 flex items-start gap-1.5">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {erro}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Navegação */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => state.step === 1 ? onCancelar() : set('step', state.step - 1)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors px-3 py-2"
        >
          <ChevronLeft size={14} />
          {state.step === 1 ? 'Cancelar' : 'Voltar'}
        </button>

        {state.step < 6 ? (
          <button
            onClick={() => set('step', state.step + 1)}
            disabled={state.step === 1 && !state.nome.trim()}
            className="flex items-center gap-1 bg-blue-600 text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            Próximo <ChevronRight size={14} />
          </button>
        ) : (
          <button
            onClick={salvarRascunho}
            disabled={salvando}
            className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {salvando ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
            {salvando ? 'Salvando…' : 'Salvar rascunho'}
          </button>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-sm w-5 shrink-0">{icon}</span>
      <span className="text-xs text-gray-500 w-20 shrink-0">{label}</span>
      <span className="text-xs text-gray-800 font-medium flex-1">{value}</span>
    </div>
  );
}
