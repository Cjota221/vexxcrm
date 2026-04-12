'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, CloudDownload, Loader2, RefreshCw, Target, TrendingUp, Users, Wand2, Link } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch, formatAudienceSize } from '@/components/trafego/trafegoUtils';
import { BibliotecaInteresses } from '@/components/meta/BibliotecaInteresses';

interface PublicoAprovadoItem {
  id: string;
  nome: string;
  tipo: string;
  status: string;
  meta_audience_id: string | null;
  estimativa_alcance: number | null;
  criado_por_ia: boolean;
  created_at: string;
}

export function PublicosTab() {
  const [subTab, setSubTab] = useState<'criar' | 'lookalike' | 'biblioteca' | 'importar'>('criar');
  const [gerandoTipo, setGerandoTipo] = useState<string | null>(null);
  const [feedbackPublico, setFeedbackPublico] = useState<string | null>(null);
  const [publicosAprovados, setPublicosAprovados] = useState<PublicoAprovadoItem[]>([]);
  const [carregandoPublicos, setCarregandoPublicos] = useState(false);

  // Estado para seletor de vídeos no Lookalike
  interface CriativoVideo { id: string; nome: string; meta_video_id: string; url_preview: string | null }
  const [videos, setVideos]               = useState<CriativoVideo[]>([]);
  const [videosSelecionados, setVideosSel] = useState<string[]>([]);
  const [carregandoVideos, setCarregandoVideos] = useState(false);
  const [audienceIdInput, setAudienceIdInput] = useState('');
  const [criandoLookalikeManual, setCriandoLookalikeManual] = useState(false);

  const carregarVideos = useCallback(async () => {
    setCarregandoVideos(true);
    try {
      const res  = await authFetch('/api/meta/criativos?limit=30&tipo=video');
      if (!res.ok) return;
      const data = await res.json() as { criativos?: CriativoVideo[] };
      setVideos((data.criativos ?? []).filter(c => c.meta_video_id));
    } catch { /* silencioso */ }
    finally { setCarregandoVideos(false); }
  }, []);

  const carregarPublicosAprovados = useCallback(async () => {
    setCarregandoPublicos(true);
    try {
      const res = await authFetch('/api/trafego/publicos-aprovados?limit=50');
      if (!res.ok) return;
      const data = await res.json() as { data?: PublicoAprovadoItem[] };
      setPublicosAprovados(data.data ?? []);
    } catch { /* silencioso */ }
    finally { setCarregandoPublicos(false); }
  }, []);

  useEffect(() => { carregarPublicosAprovados(); }, [carregarPublicosAprovados]);

  // ── Estado e funções para sub-tab "Importar do Meta" ──────────────────────
  interface MetaCustomAudience {
    id: string;
    name: string;
    subtype?: string;
    approximate_count_lower_bound?: number;
    approximate_count_upper_bound?: number;
    importing?: boolean;
  }
  const [metaAudiences, setMetaAudiences] = useState<MetaCustomAudience[]>([]);
  const [carregandoMeta, setCarregandoMeta] = useState(false);
  const [importadosIds, setImportadosIds] = useState<Set<string>>(new Set());

  const carregarAudienciasMeta = useCallback(async () => {
    setCarregandoMeta(true);
    try {
      const res = await authFetch('/api/trafego/saved-audiences');
      if (!res.ok) return;
      const data = await res.json() as {
        connected?: boolean;
        customAudiences?: MetaCustomAudience[];
      };
      if (data.connected) {
        setMetaAudiences(data.customAudiences ?? []);
      }
    } catch { /* silencioso */ }
    finally { setCarregandoMeta(false); }
  }, []);

  useEffect(() => {
    if (subTab === 'importar' && metaAudiences.length === 0 && !carregandoMeta) {
      carregarAudienciasMeta();
    }
  }, [subTab, metaAudiences.length, carregandoMeta, carregarAudienciasMeta]);

  async function importarPublicoMeta(audience: MetaCustomAudience) {
    const subtype = audience.subtype ?? 'CUSTOM';
    const tipoMap: Record<string, string> = {
      LOOKALIKE:  'lookalike',
      ENGAGEMENT: 'quente',
      WEBSITE:    'frio',
      CUSTOM:     'retargeting',
    };
    const tipo = tipoMap[subtype] ?? 'frio';

    setMetaAudiences(prev =>
      prev.map(a => a.id === audience.id ? { ...a, importing: true } : a)
    );
    try {
      const res = await authFetch('/api/trafego/publicos-aprovados', {
        method: 'POST',
        body: JSON.stringify({
          nome:             audience.name,
          tipo,
          meta_audience_id: audience.id,
          targeting:        { custom_audiences: [{ id: audience.id }] },
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (json.ok) {
        setImportadosIds(prev => new Set([...prev, audience.id]));
        carregarPublicosAprovados();
      } else {
        setFeedbackPublico(`❌ ${json.error ?? 'Erro ao importar público'}`);
      }
    } catch {
      setFeedbackPublico('❌ Erro de conexão ao importar');
    } finally {
      setMetaAudiences(prev =>
        prev.map(a => a.id === audience.id ? { ...a, importing: false } : a)
      );
    }
  }

  function subtypeBadge(subtype?: string) {
    const map: Record<string, { label: string; cls: string }> = {
      LOOKALIKE:  { label: 'LOOKALIKE',  cls: 'bg-purple-900/40 text-purple-300 border border-purple-700/50' },
      ENGAGEMENT: { label: 'ENGAGEMENT', cls: 'bg-orange-900/40 text-orange-300 border border-orange-700/50' },
      CUSTOM:     { label: 'CUSTOM',     cls: 'bg-blue-900/40 text-blue-300 border border-blue-700/50' },
      WEBSITE:    { label: 'WEBSITE',    cls: 'bg-green-900/40 text-green-300 border border-green-700/50' },
    };
    const s = subtype ?? 'CUSTOM';
    const { label, cls } = map[s] ?? { label: s, cls: 'bg-[#1c2333] text-[#94a3b8] border border-[#2a3550]' };
    return (
      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide', cls)}>
        {label}
      </span>
    );
  }

  async function gerarPublicoAutomatico(tipo: 'frio' | 'quente' | 'lookalike') {
    setGerandoTipo(tipo);
    setFeedbackPublico(null);
    try {
      const body: Record<string, unknown> = { tipo };
      if (tipo === 'lookalike' && videosSelecionados.length > 0) {
        body.video_ids = videosSelecionados;
      }
      const res = await authFetch('/api/trafego/publicos/gerar-automatico', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const json = await res.json() as {
        ok?: boolean;
        nome?: string;
        tipo?: string;
        meta_audience_id?: string;
        interesses_usados?: string[];
        videos_usados?: number;
        contatos_enviados?: number;
        nota?: string;
        error?: string;
      };
      if (json.ok) {
        let msg: string;
        if (json.tipo === 'frio') {
          const qtd = json.interesses_usados?.length ?? 0;
          msg = `✅ Targeting configurado: "${json.nome}" com ${qtd} interesse${qtd !== 1 ? 's' : ''}`;
        } else if (json.meta_audience_id) {
          const detalhe = json.videos_usados != null
            ? ` (${json.videos_usados} vídeo${json.videos_usados !== 1 ? 's' : ''})`
            : json.contatos_enviados != null
            ? ` (${json.contatos_enviados} clientes)`
            : '';
          msg = `✅ Público "${json.nome}" criado no Meta${detalhe}`;
        } else {
          msg = `✅ Público "${json.nome}" configurado`;
        }
        if (json.nota) msg += ` — ${json.nota}`;
        setFeedbackPublico(msg);
        carregarPublicosAprovados();
      } else {
        setFeedbackPublico(`❌ ${json.error || 'Erro ao gerar público'}`);
      }
    } catch (e) {
      setFeedbackPublico(`❌ ${String(e)}`);
    } finally {
      setGerandoTipo(null);
    }
  }

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
    <div className="space-y-5">
      {/* Pills navigation */}
      <div className="flex flex-wrap gap-2">
        {([
          { key: 'criar',      label: 'Criar com IA' },
          { key: 'lookalike',  label: 'Lookalike' },
          { key: 'importar',   label: 'Importar do Meta' },
          { key: 'biblioteca', label: 'Biblioteca' },
        ] as { key: 'criar' | 'lookalike' | 'importar' | 'biblioteca'; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
              subTab === key
                ? 'bg-[#1e3a5f] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Feedback */}
      {feedbackPublico && (
        <div className={cn(
          'rounded-xl px-4 py-3 text-sm border flex items-start justify-between gap-3',
          feedbackPublico.startsWith('✅')
            ? 'bg-green-50 border-green-200 text-green-800'
            : feedbackPublico.startsWith('⚠️')
            ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-red-50 border-red-200 text-red-800'
        )}>
          <span>{feedbackPublico}</span>
          <button onClick={() => setFeedbackPublico(null)} className="opacity-60 hover:opacity-100 shrink-0">✕</button>
        </div>
      )}

      {/* ── Sub-seção: Criar com IA ── */}
      {subTab === 'criar' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Card Frio */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <Users size={18} className="text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Público Frio</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Jarvis seleciona interesses de revendedoras, franqueadas e lojistas no Meta e cria o público automaticamente.
                  </p>
                </div>
              </div>
              <button
                onClick={() => gerarPublicoAutomatico('frio')}
                disabled={gerandoTipo === 'frio'}
                className="w-full mt-4 py-2.5 bg-[#1e3a5f] text-white text-sm font-medium rounded-xl hover:bg-[#16304f] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {gerandoTipo === 'frio'
                  ? <><Loader2 size={14} className="animate-spin" /> Jarvis trabalhando...</>
                  : <><Wand2 size={14} /> Gerar público frio</>
                }
              </button>
            </div>

            {/* Card Quente */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                  <TrendingUp size={18} className="text-orange-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Público Quente</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Pessoas que já interagiram com a CJ nos últimos 30 dias — visitantes, seguidores, engajamento.
                  </p>
                </div>
              </div>
              <button
                onClick={() => gerarPublicoAutomatico('quente')}
                disabled={gerandoTipo === 'quente'}
                className="w-full mt-4 py-2.5 bg-orange-600 text-white text-sm font-medium rounded-xl hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {gerandoTipo === 'quente'
                  ? <><Loader2 size={14} className="animate-spin" /> Jarvis trabalhando...</>
                  : <><Wand2 size={14} /> Gerar público quente</>
                }
              </button>
            </div>

            {/* Card Lookalike */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                  <Target size={18} className="text-purple-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Lookalike</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Meta encontra pessoas parecidas com seus melhores clientes. Baseado na sua lista de compradores.
                  </p>
                </div>
              </div>
              <button
                onClick={() => gerarPublicoAutomatico('lookalike')}
                disabled={gerandoTipo === 'lookalike'}
                className="w-full mt-4 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {gerandoTipo === 'lookalike'
                  ? <><Loader2 size={14} className="animate-spin" /> Jarvis trabalhando...</>
                  : <><Wand2 size={14} /> Gerar lookalike</>
                }
              </button>
            </div>
          </div>

          {/* Lista de públicos criados */}
          {(carregandoPublicos || publicosAprovados.length > 0) && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-800 text-sm mb-3 flex items-center gap-2">
                <Users size={15} className="text-indigo-500" />
                Públicos criados ({publicosAprovados.length})
              </h3>
              {carregandoPublicos ? (
                <div className="flex items-center justify-center py-4 text-gray-400">
                  <Loader2 size={18} className="animate-spin" />
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {publicosAprovados.map(p => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{p.nome}</p>
                        <p className="text-xs text-gray-400 capitalize">{p.tipo}{p.meta_audience_id ? ` · ID ${p.meta_audience_id}` : ''}</p>
                      </div>
                      {statusBadge(p.status)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Sub-seção: Lookalike ── */}
      {subTab === 'lookalike' && (
        <div className="space-y-5">
          {/* Card principal */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                <Target size={18} className="text-purple-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Lookalike 1% Brasil</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  O Jarvis usa a lista de clientes do CRM (com hash SHA-256) para criar uma audiência-semente
                  e gerar um Lookalike 1% no Meta — pessoas com perfil semelhante aos seus compradores reais.
                </p>
              </div>
            </div>

            <div className="bg-purple-50 rounded-xl px-3 py-2 mb-4 text-xs text-purple-700">
              Mínimo de 100 clientes com telefone ou e-mail cadastrado no CRM.
            </div>

            <button
              onClick={() => gerarPublicoAutomatico('lookalike')}
              disabled={gerandoTipo === 'lookalike'}
              className="w-full py-2.5 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {gerandoTipo === 'lookalike'
                ? <><Loader2 size={14} className="animate-spin" /> Criando no Meta...</>
                : <><Wand2 size={14} /> Gerar Lookalike com clientes do CRM</>
              }
            </button>
          </div>

          {/* Card: Registrar Lookalike existente */}
          <div className="bg-white rounded-2xl border border-amber-200 p-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <Link size={18} className="text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Registrar Lookalike do Meta Ads Manager</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Crie o Lookalike manualmente no Meta Ads Manager, copie o ID e registre aqui. Nenhuma permissão especial necessária.
                </p>
              </div>
            </div>

            <div className="bg-amber-50 rounded-xl px-3 py-2 mb-3 text-xs text-amber-700 leading-relaxed">
              <strong>Passo a passo:</strong> Meta Ads Manager → Públicos → Criar público → Público semelhante → configure → salve → copie o ID numérico da coluna &quot;ID do público&quot;.
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={audienceIdInput}
                onChange={e => setAudienceIdInput(e.target.value.trim())}
                placeholder="Ex: 120212345678901234"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
              <button
                disabled={!audienceIdInput || criandoLookalikeManual}
                onClick={async () => {
                  setCriandoLookalikeManual(true);
                  setFeedbackPublico(null);
                  try {
                    const res = await authFetch('/api/trafego/publicos-aprovados', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        nome:             `CJ | LOOKALIKE 1% BR (manual)`,
                        tipo:             'lookalike',
                        targeting:        { custom_audiences: [{ id: audienceIdInput }] },
                        meta_audience_id: audienceIdInput,
                        publicar_meta:    false,
                      }),
                    });
                    const json = await res.json() as { ok?: boolean; publico?: { id: string }; error?: string };
                    if (json.ok) {
                      setFeedbackPublico(`✅ Lookalike registrado! ID Meta: ${audienceIdInput}`);
                      setAudienceIdInput('');
                      carregarPublicosAprovados();
                    } else {
                      setFeedbackPublico(`❌ ${json.error || 'Erro ao registrar'}`);
                    }
                  } catch {
                    setFeedbackPublico('❌ Erro de conexão');
                  } finally {
                    setCriandoLookalikeManual(false);
                  }
                }}
                className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-xl hover:bg-amber-700 disabled:opacity-40 flex items-center gap-1.5 shrink-0"
              >
                {criandoLookalikeManual
                  ? <><Loader2 size={13} className="animate-spin" /> Salvando...</>
                  : <><CheckCircle size={13} /> Registrar</>}
              </button>
            </div>
          </div>

          {/* Lookalikes já criados */}
          {publicosAprovados.filter(p => p.tipo === 'lookalike').length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-800 text-sm mb-3">Lookalikes criados</h3>
              <div className="space-y-2">
                {publicosAprovados.filter(p => p.tipo === 'lookalike').map(p => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-100">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{p.nome}</p>
                      {p.meta_audience_id
                        ? <p className="text-xs text-gray-400">ID Meta: {p.meta_audience_id}</p>
                        : <p className="text-xs text-amber-500">Salvo localmente — criar manualmente no Meta</p>
                      }
                    </div>
                    {statusBadge(p.status)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Sub-seção: Biblioteca ── */}
      {subTab === 'biblioteca' && (
        <BibliotecaInteresses />
      )}

      {/* ── Sub-seção: Importar do Meta ── */}
      {subTab === 'importar' && (
        <div className="space-y-4">
          {/* Header */}
          <div className="bg-[#161b24] rounded-2xl border border-[#2a3550] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-[#e2e8f0] flex items-center gap-2">
                  <CloudDownload size={16} className="text-[#93c5fd]" />
                  Públicos do Meta Ads Manager
                </h3>
                <p className="text-xs text-[#94a3b8] mt-1">
                  Custom Audiences já criados na sua conta Meta. Clique em &quot;Importar&quot; para registrá-los no VEXX CRM e usar em campanhas.
                </p>
              </div>
              <button
                onClick={carregarAudienciasMeta}
                disabled={carregandoMeta}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1e3a5f] text-[#93c5fd] hover:bg-[#1e3a5f]/80 disabled:opacity-50 transition-colors"
              >
                {carregandoMeta
                  ? <><Loader2 size={12} className="animate-spin" /> Carregando...</>
                  : <><RefreshCw size={12} /> Atualizar</>
                }
              </button>
            </div>
          </div>

          {/* Lista de Custom Audiences */}
          {carregandoMeta ? (
            <div className="flex items-center justify-center py-12 text-[#64748b]">
              <Loader2 size={20} className="animate-spin mr-2" />
              <span className="text-sm">Buscando públicos no Meta...</span>
            </div>
          ) : metaAudiences.length === 0 ? (
            <div className="bg-[#161b24] rounded-2xl border border-[#2a3550] p-8 text-center">
              <Users size={28} className="text-[#64748b] mx-auto mb-2" />
              <p className="text-sm text-[#94a3b8]">Nenhuma Custom Audience encontrada.</p>
              <p className="text-xs text-[#64748b] mt-1">Verifique se o token Meta está configurado e há públicos criados na conta.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {metaAudiences.map(audience => {
                const alreadyImported = importadosIds.has(audience.id)
                  || publicosAprovados.some(p => p.meta_audience_id === audience.id);
                const lower = audience.approximate_count_lower_bound;
                const upper = audience.approximate_count_upper_bound;
                const tamanho = formatAudienceSize(lower, upper);

                return (
                  <div
                    key={audience.id}
                    className="bg-[#161b24] rounded-xl border border-[#2a3550] px-4 py-3 flex items-center justify-between gap-3 hover:border-[#1e3a5f] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-[#e2e8f0] truncate">{audience.name}</p>
                        {subtypeBadge(audience.subtype)}
                      </div>
                      <p className="text-xs text-[#64748b] mt-0.5">
                        {tamanho}
                        {audience.id && <span className="ml-2 opacity-60">· ID {audience.id}</span>}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {alreadyImported ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-[#059669] bg-green-900/20 border border-green-700/30 px-3 py-1.5 rounded-lg">
                          <CheckCircle size={13} />
                          Importado
                        </span>
                      ) : (
                        <button
                          onClick={() => importarPublicoMeta(audience)}
                          disabled={audience.importing}
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-[#1e3a5f] text-[#93c5fd] hover:bg-[#1e4a7f] disabled:opacity-50 transition-colors"
                        >
                          {audience.importing
                            ? <><Loader2 size={12} className="animate-spin" /> Importando...</>
                            : <><CloudDownload size={12} /> Importar</>
                          }
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Legenda dos tipos */}
          <div className="bg-[#161b24] rounded-xl border border-[#2a3550] p-4">
            <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wide mb-2">Tipos de público</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {[
                { subtype: 'LOOKALIKE',  desc: 'Similar a uma base semente' },
                { subtype: 'ENGAGEMENT', desc: 'Engajamento com conteúdo' },
                { subtype: 'CUSTOM',     desc: 'Lista de clientes' },
                { subtype: 'WEBSITE',    desc: 'Visitantes via Pixel' },
              ].map(({ subtype, desc }) => (
                <div key={subtype} className="flex items-start gap-2">
                  {subtypeBadge(subtype)}
                  <span className="text-[#94a3b8] leading-tight">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
