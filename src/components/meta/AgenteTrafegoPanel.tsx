'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import {
  Bot, DollarSign, Users, MessageCircle,
  TrendingUp, CheckCircle, XCircle, Loader2,
  Sparkles, ChevronRight, Play, AlertCircle, ShoppingBag,
  Plus, Trash2, Image as ImageIcon, Video, Eye, X,
} from 'lucide-react';
import type { TipoCampanha } from '@/lib/services/meta-adset-creator.service';
import type { PlanoCampanha } from '@/lib/services/jarvis-campanha-planner';
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

type Fase = 'config' | 'planejando' | 'plano_aprovacao' | 'confirmacao' | 'executando' | 'concluido';

type TipoConjunto = 'frio' | 'quente' | 'whatsapp';

interface Conjunto {
  id: string;
  tipo: TipoConjunto;
  criativoIds: string[];
}

interface CriativoClassificacao {
  adequacao_publico_frio: number;
  adequacao_publico_quente: number;
  adequacao_whatsapp: number;
  tipo_conteudo: string;
  tom: string;
  tem_cta: boolean;
  resumo?: string;
}

interface CriativoDisponivel {
  id: string;
  nome: string;
  tipo: 'video' | 'imagem';
  url_preview: string | null;
  meta_video_id: string | null;
  meta_image_hash: string | null;
  classificacao?: CriativoClassificacao | null;
  transcricao_status?: string | null;
  is_pinned?: boolean;
  metaCacheId?: string;
}

/* ─── Card individual de criativo (com refresh de thumb expirada) ─────────── */

interface CardCriativoBtnProps {
  criativo: CriativoDisponivel;
  selecionado: boolean;
  score: number;
  temClassificacao: boolean;
  onToggle: () => void;
  onPreview: () => void;
}

function CardCriativoBtn({ criativo, selecionado, score, temClassificacao, onToggle, onPreview }: CardCriativoBtnProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(criativo.url_preview);
  const [thumbFailed, setThumbFailed] = useState(false);

  // Correção 1 + 2: quando a URL expira (thumbFailed) ou não existe,
  // e o criativo é um vídeo do Meta, busca uma thumb fresca via API.
  useEffect(() => {
    const semThumb = !thumbUrl || thumbFailed;
    if (!semThumb) return;
    if (criativo.tipo !== 'video' || !criativo.meta_video_id) return;

    const token = useAuthStore.getState().accessToken ?? '';
    fetch(`/api/meta/criativo-url?id=${criativo.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then((data: { thumb?: string | null } | null) => {
        if (data?.thumb) { setThumbUrl(data.thumb); setThumbFailed(false); }
      })
      .catch(() => {});
  }, [thumbFailed, thumbUrl, criativo.id, criativo.tipo, criativo.meta_video_id]);

  return (
    <button
      onClick={onToggle}
      title={criativo.classificacao?.resumo ?? criativo.nome}
      className={cn(
        'relative aspect-square rounded-lg border-2 overflow-hidden transition-all group',
        selecionado ? 'border-[#1e3a5f] ring-2 ring-[#1e3a5f]/20' : 'border-gray-200 hover:border-gray-300',
      )}
    >
      {/* Thumbnail — fallback automático para ícone se URL expirar */}
      {thumbUrl && !thumbFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl}
          alt={criativo.nome}
          className="w-full h-full object-cover"
          onError={() => setThumbFailed(true)}
        />
      ) : (
        <div className="w-full h-full bg-gray-100 flex items-center justify-center">
          {criativo.tipo === 'video'
            ? <Video size={20} className="text-gray-400" />
            : <ImageIcon size={20} className="text-gray-400" />
          }
        </div>
      )}

      {/* Score badge — topo direito */}
      {temClassificacao && (
        <div className={cn(
          'absolute top-1 right-1 text-[9px] font-bold px-1 py-0.5 rounded',
          score >= 7 ? 'bg-green-500 text-white'
          : score >= 4 ? 'bg-yellow-400 text-yellow-900'
          : 'bg-gray-200 text-gray-600',
        )}>
          {score}/10
        </div>
      )}

      {/* Botão preview vídeo */}
      {criativo.tipo === 'video' && (
        <button
          onClick={e => { e.stopPropagation(); onPreview(); }}
          className="absolute top-1 left-1 p-1 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Eye size={10} className="text-white" />
        </button>
      )}

      {/* Overlay aprovado */}
      {selecionado && (
        <div className="absolute inset-0 bg-[#1e3a5f]/30 flex items-center justify-center">
          <CheckCircle size={20} className="text-white drop-shadow" />
        </div>
      )}

      {/* Nome + tipo na parte de baixo */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1">
        <p className="text-[9px] text-white truncate leading-tight">{criativo.nome}</p>
        {criativo.classificacao && (
          <p className="text-[8px] text-white/70 truncate capitalize">
            {criativo.classificacao.tipo_conteudo} · {criativo.classificacao.tom}
          </p>
        )}
      </div>
    </button>
  );
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
  const [objetivo, setObjetivo]     = useState<'AWARENESS' | 'TRAFFIC' | 'LEADS' | 'SALES' | 'MESSAGES'>('TRAFFIC');
  const [orcamento, setOrcamento]   = useState(50);
  const [tipos, setTipos]           = useState<TipoCampanha[]>(['frio', 'whatsapp']);
  const [nome, setNome]             = useState('');
  const [urlDestino, setUrlDestino] = useState('');
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
  const [previewCriativo, setPreviewCriativo]   = useState<{ id: string; nome: string; url: string | null } | null>(null);
  const [loadingPreview, setLoadingPreview]     = useState(false);
  const [planoCampanha, setPlanoCampanha]       = useState<PlanoCampanha | null>(null);
  const [planoId, setPlanoId]                   = useState<string | null>(null);
  const [planejando, setPlanejando]             = useState(false);

  async function abrirPreview(criativo: CriativoDisponivel) {
    if (criativo.tipo !== 'video') return;
    setLoadingPreview(true);
    setPreviewCriativo({ id: criativo.id, nome: criativo.nome, url: null });
    try {
      const accessToken = useAuthStore.getState().accessToken ?? '';
      const res = await fetch(`/api/meta/criativo-url?id=${criativo.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json() as { url?: string | null };
      setPreviewCriativo({ id: criativo.id, nome: criativo.nome, url: data.url ?? null });
    } catch { /* mantém url null */ }
    finally { setLoadingPreview(false); }
  }

  // Buscar criativos quando entrar no modo avançado
  const fetchCriativos = useCallback(async (): Promise<CriativoDisponivel[]> => {
    setLoadingCriativos(true);
    try {
      const accessToken = useAuthStore.getState().accessToken ?? '';
      // meses=0 → sem filtro de data; inclui todos os criativos pronto/processando
      const [resMain, resCache] = await Promise.all([
        fetch('/api/meta/criativos?limit=100&meses=0', { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch('/api/meta/criativos-cache',              { headers: { Authorization: `Bearer ${accessToken}` } }),
      ]);

      if (!resMain.ok) {
        const errData = await resMain.json().catch(() => ({})) as { error?: string };
        throw new Error(errData.error ?? `Erro ${resMain.status} ao buscar criativos`);
      }

      const mainData  = await resMain.json() as { criativos?: CriativoDisponivel[] };
      const cacheData = resCache.ok ? await resCache.json() as { criativos?: Array<{ id: string; nome: string; tipo: string; url_thumb?: string | null }> } : null;

      const mainLista: CriativoDisponivel[] = mainData?.criativos ?? [];

      const mainVideoIds = new Set(mainLista.map(c => c.meta_video_id).filter(Boolean));

      const cacheLista: CriativoDisponivel[] = (cacheData?.criativos ?? [])
        .filter(item => !mainVideoIds.has(item.id))
        .map(item => ({
          id:                 'cache:' + item.id,
          nome:               item.nome,
          tipo:               item.tipo as 'video' | 'imagem',
          url_preview:        item.url_thumb ?? null,
          meta_video_id:      item.id,
          meta_image_hash:    null,
          classificacao:      null,
          transcricao_status: null,
          metaCacheId:        item.id,
        }));

      const lista = [...mainLista, ...cacheLista];
      setCriativos(lista);
      autoSelecionarJarvis(lista);
      return lista;
    } catch (err) {
      console.error('[Agente] fetchCriativos falhou:', err instanceof Error ? err.message : err);
      throw err; // propaga para gerarPlanoJarvis mostrar erro ao usuário
    } finally {
      setLoadingCriativos(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Score relevante por tipo de conjunto
  function scoreParaTipo(c: CriativoDisponivel, tipo: TipoConjunto): number {
    if (!c.classificacao) return 0;
    if (tipo === 'frio')     return c.classificacao.adequacao_publico_frio;
    if (tipo === 'quente')   return c.classificacao.adequacao_publico_quente;
    if (tipo === 'whatsapp') return c.classificacao.adequacao_whatsapp;
    return 0;
  }

  // Jarvis auto-seleciona os 3 melhores criativos para cada conjunto
  function autoSelecionarJarvis(lista: CriativoDisponivel[]) {
    setConjuntos(prev => prev.map(conjunto => {
      // Só auto-seleciona se o conjunto ainda não tem seleção manual
      if (conjunto.criativoIds.length > 0) return conjunto;
      const rankados = [...lista]
        .filter(c => c.classificacao) // só classificados
        .sort((a, b) => scoreParaTipo(b, conjunto.tipo) - scoreParaTipo(a, conjunto.tipo));
      const top3 = rankados.slice(0, MAX_CRIATIVOS_POR_CONJUNTO).map(c => c.id);
      return { ...conjunto, criativoIds: top3 };
    }));
  }

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
    const novoId = String(Date.now());
    // Auto-selecionar top 3 para o novo conjunto imediatamente
    const rankados = [...criativos]
      .filter(c => c.classificacao)
      .sort((a, b) => scoreParaTipo(b, proximo) - scoreParaTipo(a, proximo));
    const top3 = rankados.slice(0, MAX_CRIATIVOS_POR_CONJUNTO).map(c => c.id);
    setConjuntos(prev => [...prev, { id: novoId, tipo: proximo, criativoIds: top3 }]);
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
    setPlanoCampanha(null);
    setPlanoId(null);
  }

  function podeExecutar(): boolean {
    if (modoAvancado) {
      return conjuntos.length > 0 && conjuntos.every(c => c.criativoIds.length >= 1);
    }
    return tipos.length > 0;
  }

  async function gerarPlanoJarvis() {
    setPlanejando(true);
    setFase('planejando');
    const accessToken = useAuthStore.getState().accessToken ?? '';

    // Garantir criativos carregados — fetchCriativos propaga erros
    let lista = criativos;
    try {
      if (lista.length === 0) {
        lista = await fetchCriativos();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar criativos';
      console.error('[Agente] fetchCriativos falhou:', msg);
      setDone({ ok: false, erro: msg });
      setFase('concluido');
      setPlanejando(false);
      return;
    }

    // PROBLEMA 2: se só catálogo foi selecionado, pular o planner — catálogo não usa criativos da galeria
    const tiposNaoCatalogo = tipos.filter(t => t !== 'catalogo');
    if (!modoAvancado && tiposNaoCatalogo.length === 0) {
      console.log('[Agente] Apenas catálogo selecionado — pulando planner, indo para confirmação');
      setPlanejando(false);
      setFase('confirmacao');
      return;
    }

    // PROBLEMA 1: priorizar criativos marcados com ⭐ (is_pinned)
    let criativosParaPlanejar = lista;
    let usouTodosCriativos = false;
    if (!modoAvancado) {
      const pinados = lista.filter(c => c.is_pinned);
      if (pinados.length > 0) {
        criativosParaPlanejar = pinados;
        console.log('[Agente] Usando criativos pinados:', pinados.length);
      } else {
        criativosParaPlanejar = lista.slice(0, 15);
        usouTodosCriativos = true;
        console.log('[Agente] Nenhum pinado — usando primeiros', criativosParaPlanejar.length);
      }
    }

    const criativoIds = modoAvancado
      ? [...new Set(conjuntos.flatMap(c => c.criativoIds))].filter(Boolean)
      : criativosParaPlanejar.map(c => c.id).filter(Boolean);

    console.log('[Agente] criativoIds para planejar:', criativoIds.length, criativoIds.slice(0, 3));

    if (criativoIds.length === 0) {
      console.error('[Agente] Nenhum criativo disponível — abortando planejamento');
      setDone({ ok: false, erro: 'Nenhum criativo disponível. Faça upload de vídeos ou imagens na aba Criativos e tente novamente.' });
      setFase('concluido');
      setPlanejando(false);
      return;
    }

    try {
      const res = await fetch('/api/meta/agente/planejar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          criativo_ids: [...new Set(criativoIds)].filter(id => !id.startsWith('cache:')),
          objetivo,
          orcamento_total: orcamento,
          tipos: modoAvancado ? undefined : tiposNaoCatalogo,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Erro desconhecido');
      }
      const plano = await res.json() as PlanoCampanha;
      console.log('[Agente] Plano recebido:', JSON.stringify(plano).slice(0, 100));
      if (!plano || !plano.conjuntos || plano.conjuntos.length === 0) {
        console.error('[Agente] Plano inválido recebido:', plano);
        setFase('config');
        return;
      }
      // PROBLEMA 1: adicionar aviso se usou todos os criativos (sem pinned)
      if (usouTodosCriativos) {
        plano.aviso = 'Nenhum criativo marcado com ⭐ — usando todos os disponíveis. Marque criativos na galeria para priorizar os melhores.';
      }

      // Salvar plano no Supabase e guardar apenas o ID (plano é grande demais pra query param)
      const saveRes = await fetch('/api/meta/agente/salvar-plano', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plano }),
      });
      if (saveRes.ok) {
        const { plano_id } = await saveRes.json() as { plano_id?: string };
        if (plano_id) {
          console.log('[Agente] Plano salvo, plano_id:', plano_id);
          setPlanoId(plano_id);
        }
      } else {
        console.warn('[Agente] Falha ao salvar plano no servidor — usará JSON inline como fallback');
      }

      setPlanoCampanha(plano);
      console.log('[Agente] Setando fase plano_aprovacao');
      setFase('plano_aprovacao');
    } catch (err) {
      // Fallback: ir direto para confirmação sem IA
      console.warn('[Jarvis Planner] Erro, indo para confirmação direta:', err);
      setPlanoCampanha(null);
      setFase('confirmacao');
    } finally {
      setPlanejando(false);
    }
  }

  async function executar() {
    setFase('executando');
    setDone(null);

    // Pre-popular pipeline com etapas planejadas
    const TIPO_LABELS: Record<string, string> = {
      frio: 'Público Frio', quente: 'Público Quente', whatsapp: 'WhatsApp', catalogo: 'Catálogo'
    };
    const plannedSteps: Step[] = [
      { id: 'auth',      status: 'pending', label: 'Verificar credenciais' },
      { id: 'meta',      status: 'pending', label: 'Verificar token Meta' },
      { id: 'criativos', status: 'pending', label: 'Analisar criativos' },
    ];
    if (modoAvancado) {
      plannedSteps.push({ id: 'multi', status: 'pending', label: `Criar campanha (${conjuntos.length} conjunto${conjuntos.length > 1 ? 's' : ''})` });
      conjuntos.forEach(c => {
        plannedSteps.push({ id: `conjunto_${c.tipo}`, status: 'pending', label: `Conjunto ${TIPO_LABELS[c.tipo] ?? c.tipo}` });
      });
    } else {
      plannedSteps.push({ id: 'orcamento', status: 'pending', label: 'Distribuir orçamento' });
      tipos.forEach(t => {
        plannedSteps.push({ id: `campanha_${t}`, status: 'pending', label: `Campanha ${TIPO_LABELS[t] ?? t}` });
      });
    }
    setSteps(plannedSteps);

    const accessToken = useAuthStore.getState().accessToken ?? '';
    const nomeBase = nome || planoCampanha?.nome_sugerido || `Agente ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;

    // ── Modo plano Jarvis aprovado ────────────────────────────────────────
    console.log('[Agente] Executando — planoCampanha:', !!planoCampanha);
    console.log('[Agente] fase ao executar:', fase);
    console.log('[Agente] planoCampanha ao executar:', planoCampanha ? 'presente' : 'ausente');
    if (planoCampanha) {
      // Adicionar etapas do plano ao pipeline visual
      setSteps([
        { id: 'auth',         status: 'pending', label: 'Verificar credenciais' },
        { id: 'meta',         status: 'pending', label: 'Verificar token Meta' },
        { id: 'criativos',    status: 'pending', label: 'Analisar criativos' },
        { id: 'inicio_plano', status: 'pending', label: 'Iniciando plano Jarvis' },
        { id: 'multi',        status: 'pending', label: `Criar campanha (${planoCampanha.conjuntos.length} conjunto${planoCampanha.conjuntos.length > 1 ? 's' : ''})` },
        ...planoCampanha.conjuntos.map(c => ({
          id:     `conjunto_${c.tipo}`,
          status: 'pending' as const,
          label:  `Conjunto ${c.label}`,
        })),
      ]);

      const params = new URLSearchParams({
        token:     accessToken,
        orcamento: String(orcamento),
        nome:      nomeBase,
        catalogoId,
        objetivo,
      });
      if (urlDestino) params.set('urlDestino', urlDestino);
      if (planoId) {
        params.set('plano_id', planoId);
        console.log('[Agente] plano_id adicionado aos params:', planoId);
      } else {
        // Fallback: passar JSON inline (pode estourar limite de URL em alguns casos)
        params.set('plano', JSON.stringify(planoCampanha));
        console.log('[Agente] plano JSON inline, tamanho:', JSON.stringify(planoCampanha).length);
      }
      console.log('[Agente] Params enviados para stream:', params.toString().slice(0, 200));
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
      return;
    }

    // Resolver IDs de cache → UUIDs reais antes de executar
    const conjuntosResolvidos = await Promise.all(
      conjuntos.map(async (c) => {
        const idsResolvidos = await Promise.all(
          c.criativoIds.map(async (id) => {
            if (!id.startsWith('cache:')) return id;
            const cacheItem = criativos.find(cr => cr.id === id);
            if (!cacheItem?.metaCacheId) return null;
            const auth = useAuthStore.getState().accessToken ?? '';
            const res = await fetch('/api/meta/upload/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
              body: JSON.stringify({
                nome: cacheItem.nome,
                tipo: 'video',
                metaVideoId: cacheItem.metaCacheId,
                thumbUrl: cacheItem.url_preview ?? undefined,
              }),
            });
            const data = await res.json() as { ok?: boolean; id?: string };
            return data.ok && data.id ? data.id : null;
          })
        );
        const resolvidos = idsResolvidos.filter((id): id is string => id !== null);
        // Avisa se algum criativo de cache não pôde ser salvo
        const perdidos = c.criativoIds.length - resolvidos.length;
        if (perdidos > 0) {
          console.warn(`[Agente] ${perdidos} criativo(s) do cache não puderam ser salvos no conjunto ${c.tipo}`);
        }
        return { ...c, criativoIds: resolvidos };
      })
    );
    setConjuntos(conjuntosResolvidos);

    // Bloquear se algum conjunto ficou sem criativos após resolução
    const conjuntoVazio = conjuntosResolvidos.find(c => c.criativoIds.length === 0);
    if (modoAvancado && conjuntoVazio) {
      setDone({ ok: false, erro: `Conjunto "${conjuntoVazio.tipo}" ficou sem criativos. Selecione outros criativos e tente novamente.` });
      setFase('concluido');
      return;
    }

    const params = new URLSearchParams({
      token:      accessToken,
      orcamento:  String(orcamento),
      nome:       nomeBase,
      catalogoId,
      objetivo,
    });

    if (urlDestino) params.set('urlDestino', urlDestino);

    // Públicos IA selecionados por tipo
    const audienciasAtivas = Object.entries(audienciasPorTipo).filter(([, v]) => v);
    if (audienciasAtivas.length > 0) {
      params.set('audiencias', JSON.stringify(Object.fromEntries(audienciasAtivas)));
    }

    if (modoAvancado) {
      // Modo avançado: enviar conjuntos como JSON
      const conjuntosPayload = conjuntosResolvidos.map((c, idx) => ({
        tipo: c.tipo,
        orcamentoDiario: calcOrcConjuntoResto(idx) * 100, // reais → centavos
        criativoIds: c.criativoIds,
      }));
      params.set('conjuntos', JSON.stringify(conjuntosPayload));
      params.set('tipos', conjuntosResolvidos.map(c => c.tipo).join(','));
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

      {/* URL de destino */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">URL de destino do anúncio</label>
        <input
          type="url"
          value={urlDestino}
          onChange={e => setUrlDestino(e.target.value)}
          placeholder="https://seusite.com.br"
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

      {/* Objetivo da campanha */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Objetivo da campanha</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'AWARENESS', label: 'Reconhecimento',    emoji: '👁️',  desc: 'Mais pessoas te conhecem' },
            { value: 'TRAFFIC',   label: 'Tráfego',           emoji: '🌐',  desc: 'Cliques no site/link' },
            { value: 'LEADS',     label: 'Geração de Leads',  emoji: '📋',  desc: 'Formulário de leads' },
            { value: 'SALES',     label: 'Vendas/Conversões', emoji: '💰',  desc: 'Compras e conversões' },
            { value: 'MESSAGES',  label: 'Mensagens',         emoji: '💬',  desc: 'WhatsApp / DM' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setObjetivo(opt.value as typeof objetivo)}
              className={cn(
                'flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all',
                objetivo === opt.value
                  ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-[#1e3a5f]/40'
              )}
            >
              <span className="text-lg">{opt.emoji}</span>
              <div>
                <p className="text-xs font-semibold">{opt.label}</p>
                <p className={cn('text-[10px]', objetivo === opt.value ? 'text-white/70' : 'text-gray-400')}>{opt.desc}</p>
              </div>
            </button>
          ))}
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

                {/* Grid de criativos — Jarvis ranqueia, você aprova */}
                <div className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-500">
                      Criativos ({conjunto.criativoIds.length}/{MAX_CRIATIVOS_POR_CONJUNTO})
                      {conjunto.criativoIds.length === 0 && <span className="text-red-400 ml-1">— ao menos 1</span>}
                    </p>
                    <span className="text-[10px] text-indigo-600 font-medium flex items-center gap-0.5">
                      <Sparkles size={10} /> Jarvis ranqueou por score
                    </span>
                  </div>
                  {criativos.length === 0 && !loadingCriativos ? (
                    <p className="text-xs text-gray-400 italic">Nenhum criativo nos últimos 12 meses</p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {/* Criativos ordenados pelo score do tipo */}
                      {[...criativos]
                        .sort((a, b) => scoreParaTipo(b, conjunto.tipo) - scoreParaTipo(a, conjunto.tipo))
                        .map(criativo => {
                          const selecionado = conjunto.criativoIds.includes(criativo.id);
                          const score = scoreParaTipo(criativo, conjunto.tipo);
                          const temClassificacao = !!criativo.classificacao;
                          return (
                            <CardCriativoBtn
                              key={criativo.id}
                              criativo={criativo}
                              selecionado={selecionado}
                              score={score}
                              temClassificacao={temClassificacao}
                              onToggle={() => toggleCriativo(conjunto.id, criativo.id)}
                              onPreview={() => abrirPreview(criativo)}
                            />
                          );
                      })}
                    </div>
                  )}

                  {/* Legenda de aprovação */}
                  {conjunto.criativoIds.length > 0 && (
                    <p className="text-[10px] text-gray-400 mt-2 text-center">
                      Clique para aprovar ✓ ou remover um criativo da seleção do Jarvis
                    </p>
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
        onClick={gerarPlanoJarvis}
        disabled={!podeExecutar() || planejando}
        className="w-full py-3 bg-[#1e3a5f] text-white text-sm font-medium rounded-xl hover:bg-[#16304f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {planejando
          ? <><Loader2 size={15} className="animate-spin" /> Jarvis analisando...</>
          : <><Sparkles size={15} /> Ver plano do Jarvis</>
        }
      </button>
    </div>
  );

  /* ── Planejando ──────────────────────────────────────────────────────── */
  if (fase === 'planejando') return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-[#1e3a5f]/5 to-purple-50 rounded-2xl border border-[#1e3a5f]/10">
        <div className="w-10 h-10 rounded-xl bg-[#1e3a5f] flex items-center justify-center shrink-0">
          <Sparkles size={20} className="text-white animate-pulse" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900 text-sm">Jarvis analisando seus criativos...</p>
          <p className="text-xs text-gray-500">Distribuindo os melhores criativos por público</p>
        </div>
        <Loader2 size={16} className="text-[#1e3a5f] animate-spin shrink-0" />
      </div>

      <div className="space-y-2">
        {['Lendo scores de classificação...', 'Distribuindo por público frio, quente e WhatsApp...', 'Gerando copy personalizada...'].map((label, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
            <Loader2 size={12} className="text-gray-400 animate-spin shrink-0" />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );

  /* ── Plano Aprovação ──────────────────────────────────────────────────── */
  if (fase === 'plano_aprovacao') return (
    <div className="space-y-4">
      {!planoCampanha && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Carregando plano do Jarvis...</p>
          <button onClick={() => setFase('config')} className="text-xs text-gray-400 hover:underline">
            Voltar
          </button>
        </div>
      )}
      {planoCampanha && <>
      {/* Aviso (ex: nenhum criativo pinado) */}
      {planoCampanha.aviso && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <span>{planoCampanha.aviso}</span>
        </div>
      )}

      {/* Header Jarvis */}
      <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-[#1e3a5f]/5 to-purple-50 rounded-2xl border border-[#1e3a5f]/10">
        <div className="w-10 h-10 rounded-xl bg-[#1e3a5f] flex items-center justify-center shrink-0">
          <Sparkles size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">Jarvis planejou sua campanha</p>
          <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{planoCampanha.resumo_estrategia}</p>
        </div>
      </div>

      {/* Conjuntos do plano */}
      <div className="space-y-3">
        {planoCampanha.conjuntos.map(conjunto => {
          const copy = planoCampanha.copy_por_conjunto?.[conjunto.tipo];
          const TIPO_COLORS: Record<string, string> = {
            frio: 'text-blue-600 bg-blue-50 border-blue-200',
            quente: 'text-orange-600 bg-orange-50 border-orange-200',
            whatsapp: 'text-green-600 bg-green-50 border-green-200',
          };
          const tagCls = TIPO_COLORS[conjunto.tipo] ?? 'text-gray-600 bg-gray-50 border-gray-200';

          return (
            <div key={conjunto.tipo} className="border border-gray-200 rounded-2xl p-4 space-y-3">
              {/* Cabeçalho do conjunto */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full border', tagCls)}>
                    {conjunto.label}
                  </span>
                  <span className="text-xs text-gray-400">R${conjunto.orcamento_sugerido}/dia</span>
                </div>
                <span className="text-xs text-gray-400">{conjunto.criativos.length} criativo(s)</span>
              </div>

              {/* Miniaturas */}
              {conjunto.criativos.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {conjunto.criativos.slice(0, 6).map(c => (
                    <div key={c.id} className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 shrink-0">
                      {c.url_preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.url_preview} alt={c.nome} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Video size={14} className="text-gray-400" />
                        </div>
                      )}
                    </div>
                  ))}
                  {conjunto.criativos.length > 6 && (
                    <div className="w-14 h-14 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                      <span className="text-xs text-gray-500 font-medium">+{conjunto.criativos.length - 6}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Justificativa */}
              <p className="text-xs text-gray-500 italic leading-relaxed">{conjunto.justificativa}</p>

              {/* Copy gerada */}
              {copy && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-1 border border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Copy gerada</p>
                  <p className="text-xs font-medium text-gray-800">{copy.headline}</p>
                  <p className="text-xs text-gray-500">{copy.texto}</p>
                  <span className="inline-block text-[10px] bg-[#1e3a5f]/10 text-[#1e3a5f] px-2 py-0.5 rounded-full font-medium">{copy.cta}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
        Todas as campanhas serão criadas <strong>pausadas</strong> — você revisa e ativa manualmente.
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => { setPlanoCampanha(null); setFase('config'); }}
          className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm rounded-xl hover:bg-gray-50"
        >
          Ajustar
        </button>
        <button
          onClick={() => {
            console.log('[Agente] Aprovando plano, fase atual:', fase);
            console.log('[Agente] planoCampanha existe:', !!planoCampanha);
            executar();
          }}
          className="flex-1 py-2.5 bg-[#1e3a5f] text-white text-sm font-medium rounded-xl hover:bg-[#16304f] flex items-center justify-center gap-2"
        >
          <Play size={14} /> Aprovar e executar
        </button>
      </div>
      </>}
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

        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="font-medium">Objetivo:</span>
          <span className="px-2 py-0.5 bg-[#1e3a5f]/10 text-[#1e3a5f] rounded-full font-medium">{objetivo}</span>
        </div>

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
        <span className="text-xs text-gray-400 ml-auto">
          {steps.filter(s => s.status === 'ok').length}/{steps.length} etapas
        </span>
      </div>

      {/* Pipeline N8N style */}
      <div className="relative py-1">
        {steps.length === 0 && (
          <div className="flex items-center gap-3 py-2">
            <div className="w-7 h-7 rounded-full bg-blue-100 border-2 border-blue-400 flex items-center justify-center shrink-0">
              <Loader2 size={13} className="text-blue-500 animate-spin" />
            </div>
            <span className="text-sm text-blue-600">Iniciando agente...</span>
          </div>
        )}
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;
          const nodeColor = {
            ok:      'bg-green-500 border-green-500',
            error:   'bg-red-500 border-red-500',
            running: 'bg-blue-500 border-blue-500',
            pending: 'bg-white border-gray-300',
          }[step.status];
          const cardColor = {
            ok:      'bg-green-50 border-green-200',
            error:   'bg-red-50 border-red-200',
            running: 'bg-blue-50 border-blue-300 shadow-sm shadow-blue-100',
            pending: 'bg-gray-50 border-gray-100',
          }[step.status];

          return (
            <div key={step.id} className="relative flex gap-3">
              {/* Vertical connector line */}
              {!isLast && (
                <div className="absolute left-[13px] top-7 bottom-0 w-0.5 bg-gray-200 z-0" />
              )}

              {/* Node circle */}
              <div className={cn(
                'relative z-10 w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 mt-2',
                nodeColor,
              )}>
                {step.status === 'ok'      && <CheckCircle size={13} className="text-white" />}
                {step.status === 'error'   && <XCircle     size={13} className="text-white" />}
                {step.status === 'running' && <Loader2     size={12} className="text-white animate-spin" />}
                {step.status === 'pending' && <div className="w-2 h-2 rounded-full bg-gray-300" />}
              </div>

              {/* Content card */}
              <div className={cn('flex-1 rounded-xl border p-3 mb-2 transition-all', cardColor)}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-800">{step.label}</p>
                  {step.status === 'ok'    && <span className="text-[10px] text-green-600 font-medium">✓ OK</span>}
                  {step.status === 'error' && <span className="text-[10px] text-red-600 font-medium">✗ Erro</span>}
                </div>
                {step.detalhe && (
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{step.detalhe}</p>
                )}
              </div>
            </div>
          );
        })}
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

  /* ── Modal preview vídeo ─────────────────────────────────────────────── */
  if (previewCriativo) return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewCriativo(null)}>
      <div className="relative w-full max-w-lg bg-black rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3 bg-black/60">
          <p className="text-white text-xs truncate max-w-[80%]">{previewCriativo.nome}</p>
          <button onClick={() => setPreviewCriativo(null)} className="text-white/70 hover:text-white">
            <X size={18} />
          </button>
        </div>
        {loadingPreview ? (
          <div className="aspect-video flex items-center justify-center">
            <Loader2 size={32} className="text-white animate-spin" />
          </div>
        ) : previewCriativo.url ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={previewCriativo.url} controls autoPlay className="w-full aspect-video bg-black" />
        ) : (
          <div className="aspect-video flex flex-col items-center justify-center gap-2">
            <Video size={32} className="text-white/40" />
            <p className="text-white/50 text-xs">Vídeo não disponível para preview</p>
          </div>
        )}
      </div>
    </div>
  );

  return null;
}
