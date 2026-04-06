'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Sparkles, CheckCircle, XCircle, Clock, Plus, Loader2, Users, Target, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

/* ─── Tipos ──────────────────────────────────────────────────────────────────── */

interface Interesse {
  id: string;
  nome: string;
  categoria: string | null;
  audiencia_global: number | null;
  audiencia_br: number | null;
  ativo: boolean;
  aprovado_jarvis: boolean | null;
  justificativa: string | null;
  sincronizado_em: string;
}

interface PublicoAprovado {
  id: string;
  nome: string;
  tipo: string;
  descricao: string | null;
  status: string;
  estimativa_alcance: number | null;
  criado_por_ia: boolean;
  meta_audience_id: string | null;
  interest_ids: string[];
  targeting: Record<string, unknown>;
  created_at: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function authFetch(url: string, options?: RequestInit): Promise<Response> {
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

function formatAudiencia(n: number | null): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function badgeStatus(aprovado: boolean | null) {
  if (aprovado === true)  return <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5"><CheckCircle size={10} /> Aprovado</span>;
  if (aprovado === false) return <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5"><XCircle size={10} /> Rejeitado</span>;
  return <span className="inline-flex items-center gap-1 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-full px-2 py-0.5"><Clock size={10} /> Pendente</span>;
}

const TIPOS_PUBLICO = [
  { value: 'frio',       label: 'Frio (Awareness)' },
  { value: 'quente',     label: 'Quente (Tráfego)' },
  { value: 'whatsapp',   label: 'WhatsApp' },
  { value: 'lookalike',  label: 'Lookalike' },
  { value: 'retargeting', label: 'Retargeting' },
];

/* ─── Seção 1: Busca de interesses na Meta API ──────────────────────────────── */

function BuscaInteresses({ onSaved }: { onSaved: () => void }) {
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<{ saved: number; data: { id: string; nome: string }[] } | null>(null);
  const [erro, setErro] = useState('');

  async function buscar() {
    if (!keyword.trim()) return;
    setLoading(true);
    setErro('');
    setResultado(null);
    try {
      const res = await authFetch('/api/trafego/interests/biblioteca', {
        method: 'POST',
        body:   JSON.stringify({ keyword: keyword.trim() }),
      });
      const data = await res.json() as { saved?: number; data?: { id: string; nome: string }[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Erro ao buscar');
      setResultado({ saved: data.saved ?? 0, data: data.data ?? [] });
      onSaved();
    } catch (e) {
      setErro(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
        <Search size={16} className="text-blue-500" />
        Buscar interesses na Meta API
      </h3>
      <p className="text-xs text-gray-500 mb-4">Digite uma palavra-chave para buscar interesses e salvá-los na biblioteca.</p>

      <div className="flex gap-2">
        <input
          type="text"
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && buscar()}
          placeholder="ex: moda feminina, sapatos, roupas..."
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={buscar}
          disabled={loading || !keyword.trim()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Buscar
        </button>
      </div>

      {erro && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

      {resultado && (
        <div className="mt-4">
          <p className="text-xs text-green-700 font-medium mb-2">
            {resultado.saved} interesse{resultado.saved !== 1 ? 's' : ''} salvo{resultado.saved !== 1 ? 's' : ''} na biblioteca
          </p>
          <div className="flex flex-wrap gap-2">
            {resultado.data.map(i => (
              <span key={i.id} className="text-xs bg-gray-100 text-gray-700 rounded-full px-3 py-1">{i.nome}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Seção 2: Análise do Jarvis ─────────────────────────────────────────────── */

function JarvisAnalisar({ onAnalizado }: { onAnalizado: () => void }) {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<{ analisados: number; atualizados: number } | null>(null);
  const [erro, setErro] = useState('');

  async function analisar() {
    setLoading(true);
    setErro('');
    setResultado(null);
    try {
      const res = await authFetch('/api/trafego/interests/jarvis-analisar', {
        method: 'POST',
        body:   JSON.stringify({}),
      });
      const data = await res.json() as { analisados?: number; atualizados?: number; message?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Erro');
      setResultado({ analisados: data.analisados ?? 0, atualizados: data.atualizados ?? 0 });
      onAnalizado();
    } catch (e) {
      setErro(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl border border-purple-200 p-5">
      <h3 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
        <Sparkles size={16} className="text-purple-500" />
        Jarvis — Classificação automática
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        O Jarvis analisa até 20 interesses pendentes e classifica como aprovado ou rejeitado para moda feminina.
      </p>

      <button
        onClick={analisar}
        disabled={loading}
        className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        {loading ? 'Analisando...' : 'Analisar pendentes'}
      </button>

      {erro && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

      {resultado && (
        <p className="mt-3 text-xs text-purple-700 font-medium">
          Jarvis analisou {resultado.analisados} interesse{resultado.analisados !== 1 ? 's' : ''} — {resultado.atualizados} atualizados.
        </p>
      )}
    </div>
  );
}

/* ─── Seção 3: Lista de interesses aprovados ─────────────────────────────────── */

function ListaInteresses({
  refresh,
  onSelecionar,
  selecionados,
}: {
  refresh: number;
  onSelecionar: (i: Interesse) => void;
  selecionados: string[];
}) {
  const [interesses, setInteresses] = useState<Interesse[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(false);
  const [filtro, setFiltro]         = useState<'todos' | 'aprovados' | 'rejeitados' | 'pendentes'>('aprovados');
  const [q, setQ]                   = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '80' });
      if (filtro === 'aprovados')  params.set('aprovado_jarvis', 'true');
      if (filtro === 'rejeitados') params.set('aprovado_jarvis', 'false');
      if (filtro === 'pendentes')  params.set('aprovado_jarvis', 'null');
      if (q) params.set('q', q);

      const res = await authFetch(`/api/trafego/interests/biblioteca?${params.toString()}`);
      const data = await res.json() as { data?: Interesse[]; total?: number };
      setInteresses(data.data ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [filtro, q, refresh]);

  useEffect(() => { carregar(); }, [carregar]);

  const abas = [
    { key: 'aprovados',  label: 'Aprovados' },
    { key: 'pendentes',  label: 'Pendentes' },
    { key: 'rejeitados', label: 'Rejeitados' },
    { key: 'todos',      label: 'Todos' },
  ] as const;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <Target size={16} className="text-green-500" />
          Biblioteca ({total})
        </h3>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Filtrar..."
            className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
          />
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-100 pb-2">
        {abas.map(a => (
          <button
            key={a.key}
            onClick={() => setFiltro(a.key)}
            className={cn(
              'px-3 py-1 text-xs rounded-full font-medium transition-colors',
              filtro === a.key
                ? 'bg-blue-600 text-white'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            )}
          >
            {a.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : interesses.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-8">Nenhum interesse encontrado</p>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {interesses.map(i => {
            const sel = selecionados.includes(i.id);
            return (
              <div
                key={i.id}
                onClick={() => onSelecionar(i)}
                className={cn(
                  'flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer border transition-colors',
                  sel
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50'
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{i.nome}</p>
                  <p className="text-xs text-gray-400">{i.categoria ?? '—'} · {formatAudiencia(i.audiencia_global)}</p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  {badgeStatus(i.aprovado_jarvis)}
                  {sel && <CheckCircle size={14} className="text-blue-500 flex-shrink-0" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Seção 4: Construtor de público ─────────────────────────────────────────── */

function ConstrutorPublico({
  interessesSelecionados,
  onCriado,
}: {
  interessesSelecionados: Interesse[];
  onCriado: () => void;
}) {
  const [nome, setNome]         = useState('');
  const [tipo, setTipo]         = useState('frio');
  const [descricao, setDescricao] = useState('');
  const [publicarMeta, setPublicarMeta] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [erro, setErro]         = useState('');
  const [sucesso, setSucesso]   = useState('');

  // Targeting construído a partir dos interesses selecionados
  const targeting = {
    geo_locations: { countries: ['BR'] },
    age_min: 18,
    age_max: 55,
    ...(interessesSelecionados.length > 0
      ? { flexible_spec: [{ interests: interessesSelecionados.map(i => ({ id: i.id, name: i.nome })) }] }
      : {}),
  };

  async function criar() {
    if (!nome.trim()) { setErro('Nome obrigatório'); return; }
    if (interessesSelecionados.length === 0) { setErro('Selecione pelo menos 1 interesse'); return; }

    setLoading(true);
    setErro('');
    setSucesso('');
    try {
      const res = await authFetch('/api/trafego/publicos-aprovados', {
        method: 'POST',
        body:   JSON.stringify({
          nome:         nome.trim(),
          tipo,
          descricao:    descricao.trim() || undefined,
          targeting,
          interest_ids: interessesSelecionados.map(i => i.id),
          publicar_meta: publicarMeta,
        }),
      });
      const data = await res.json() as { ok?: boolean; aviso?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Erro ao criar');
      setSucesso(data.aviso ?? 'Público criado com sucesso!');
      setNome('');
      setDescricao('');
      onCriado();
    } catch (e) {
      setErro(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
        <Plus size={16} className="text-blue-500" />
        Criar público com interesses selecionados
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        {interessesSelecionados.length === 0
          ? 'Selecione interesses da biblioteca acima para montar o público.'
          : `${interessesSelecionados.length} interesse${interessesSelecionados.length !== 1 ? 's' : ''} selecionado${interessesSelecionados.length !== 1 ? 's' : ''}: ${interessesSelecionados.slice(0, 3).map(i => i.nome).join(', ')}${interessesSelecionados.length > 3 ? '...' : ''}`}
      </p>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Nome do público *</label>
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="ex: Moda Feminina BR Frio"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Tipo</label>
            <div className="relative">
              <select
                value={tipo}
                onChange={e => setTipo(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {TIPOS_PUBLICO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Descrição (opcional)</label>
          <input
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            placeholder="Contexto ou estratégia deste público..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={publicarMeta}
            onChange={e => setPublicarMeta(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-600">Publicar como Saved Audience na Meta API agora</span>
        </label>
      </div>

      {erro    && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}
      {sucesso && <p className="mt-3 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">{sucesso}</p>}

      <button
        onClick={criar}
        disabled={loading || interessesSelecionados.length === 0}
        className="mt-4 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        {loading ? 'Salvando...' : 'Salvar público'}
      </button>
    </div>
  );
}

/* ─── Seção 5: Lista de públicos aprovados ───────────────────────────────────── */

function ListaPublicos({ refresh }: { refresh: number }) {
  const [publicos, setPublicos]   = useState<PublicoAprovado[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(false);
  const [filtroTipo, setFiltroTipo] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (filtroTipo) params.set('tipo', filtroTipo);
      const res  = await authFetch(`/api/trafego/publicos-aprovados?${params.toString()}`);
      const data = await res.json() as { data?: PublicoAprovado[]; total?: number };
      setPublicos(data.data ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [filtroTipo, refresh]);

  useEffect(() => { carregar(); }, [carregar]);

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      rascunho:  'bg-gray-100 text-gray-600',
      publicado: 'bg-green-50 text-green-700',
      erro:      'bg-red-50 text-red-700',
      arquivado: 'bg-yellow-50 text-yellow-700',
    };
    return (
      <span className={cn('text-xs rounded-full px-2 py-0.5 font-medium capitalize', map[status] ?? 'bg-gray-100 text-gray-600')}>
        {status}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <Users size={16} className="text-indigo-500" />
          Públicos aprovados ({total})
        </h3>
        <div className="relative">
          <select
            value={filtroTipo}
            onChange={e => setFiltroTipo(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white appearance-none pr-6"
          >
            <option value="">Todos os tipos</option>
            {TIPOS_PUBLICO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : publicos.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-8">Nenhum público criado ainda</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {publicos.map(p => (
            <div key={p.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-800 truncate">{p.nome}</p>
                  {p.criado_por_ia && <Sparkles size={11} className="text-purple-400 flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-400 capitalize">{p.tipo}</span>
                  {p.estimativa_alcance && (
                    <span className="text-xs text-gray-400">· {formatAudiencia(p.estimativa_alcance)} alcance</span>
                  )}
                  {p.meta_audience_id && (
                    <span className="text-xs text-gray-400">· ID Meta: {p.meta_audience_id}</span>
                  )}
                </div>
              </div>
              <div className="ml-3 flex-shrink-0">
                {statusBadge(p.status)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Componente principal ───────────────────────────────────────────────────── */

export function BibliotecaInteresses() {
  const [refreshInteresses, setRefreshInteresses] = useState(0);
  const [refreshPublicos,   setRefreshPublicos]   = useState(0);
  const [interessesSel,     setInteressesSel]     = useState<Interesse[]>([]);

  const toggleInteresse = (i: Interesse) => {
    setInteressesSel(prev =>
      prev.find(x => x.id === i.id)
        ? prev.filter(x => x.id !== i.id)
        : [...prev, i]
    );
  };

  return (
    <div className="space-y-5 p-5">
      <div>
        <h2 className="text-base font-bold text-gray-900">Biblioteca de Interesses</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Curadoria de interesses Meta classificados pelo Jarvis para moda feminina.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Coluna esquerda */}
        <div className="space-y-5">
          <BuscaInteresses onSaved={() => setRefreshInteresses(n => n + 1)} />
          <JarvisAnalisar onAnalizado={() => setRefreshInteresses(n => n + 1)} />
        </div>

        {/* Coluna direita */}
        <div className="space-y-5">
          <ConstrutorPublico
            interessesSelecionados={interessesSel}
            onCriado={() => {
              setRefreshPublicos(n => n + 1);
              setInteressesSel([]);
            }}
          />
          <ListaPublicos refresh={refreshPublicos} />
        </div>
      </div>

      {/* Lista de interesses — largura total para facilitar seleção */}
      <ListaInteresses
        refresh={refreshInteresses}
        onSelecionar={toggleInteresse}
        selecionados={interessesSel.map(i => i.id)}
      />

      {interessesSel.length > 0 && (
        <div className="fixed bottom-4 right-4 bg-blue-600 text-white text-xs font-medium px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2">
          <CheckCircle size={14} />
          {interessesSel.length} interesse{interessesSel.length !== 1 ? 's' : ''} selecionado{interessesSel.length !== 1 ? 's' : ''}
          <button onClick={() => setInteressesSel([])} className="ml-2 opacity-70 hover:opacity-100">×</button>
        </div>
      )}
    </div>
  );
}
