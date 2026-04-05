'use client';

import { useRef, useState, useEffect } from 'react';
import {
  Upload, Video, Image, Trash2, CheckCircle,
  Clock, AlertCircle, Play, RefreshCw, X, Loader2, CloudDownload, Search,
} from 'lucide-react';
import { useAdCreatives, type AdCreative } from '@/hooks/useAdCreatives';
import { supabase } from '@/lib/supabase';

interface CacheCreativo {
  id: string;
  nome: string;
  tipo: string;
  url_thumb: string | null;
  url_full: string | null;
  duracao: number | null;
  sincronizado_em: string;
}

async function getAuthHeader(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : '';
}

export function GaleriaCriativos() {
  const { criativos, total, hasMore, loading, loadingMore, uploading, uploadProgress, uploadArquivo, arquivar, retranscrever, recarregar, carregarMais } = useAdCreatives();
  const inputRef = useRef<HTMLInputElement>(null);
  const [erro, setErro]             = useState<string | null>(null);
  const [filtro, setFiltro]         = useState<'todos' | 'video' | 'imagem'>('todos');
  const [preview, setPreview]       = useState<{ id: string; nome: string } | null>(null);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const [batchResultado, setBatchResultado] = useState<{
    processados: number;
    falhas: number;
    detalhes: Array<{ nome: string; ok: boolean; modo: string; erro?: string }>;
  } | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [syncMsg, setSyncMsg]       = useState<string | null>(null);
  const [cacheItems, setCacheItems] = useState<CacheCreativo[]>([]);

  useEffect(() => {
    (async () => {
      const auth = await getAuthHeader();
      const res = await fetch('/api/meta/criativos-cache', { headers: { Authorization: auth } });
      if (res.ok) setCacheItems(await res.json() as CacheCreativo[]);
    })();
  }, []);

  async function sincronizarDoMeta() {
    setSincronizando(true);
    setSyncMsg(null);
    try {
      const auth = await getAuthHeader();
      const res = await fetch('/api/meta/sync', { method: 'POST', headers: { Authorization: auth } });
      const data = await res.json() as { criativos?: number; errors?: string[] };
      const total = data.criativos ?? 0;
      setSyncMsg(`${total} criativo${total !== 1 ? 's' : ''} sincronizado${total !== 1 ? 's' : ''} do Meta. Clique em Atualizar para ver todos.`);
      // Recarregar cache
      const cacheRes = await fetch('/api/meta/criativos-cache', { headers: { Authorization: auth } });
      if (cacheRes.ok) setCacheItems(await cacheRes.json() as CacheCreativo[]);
      await recarregar();
    } catch {
      setSyncMsg('Erro ao sincronizar');
    } finally {
      setSincronizando(false);
    }
  }

  // Pendentes = sem transcrição + erros + transcritos mas sem classificação
  const qtdPendentes = criativos.filter(c =>
    c.tipo === 'video' && (
      !c.transcricao_status ||
      c.transcricao_status === 'pendente' ||
      c.transcricao_status === 'erro' ||
      (c.transcricao_status === 'concluida' && !c.classificacao)
    )
  ).length;

  async function transcreverTodos() {
    setTranscrevendo(true);
    setBatchResultado(null);
    try {
      const auth = await getAuthHeader();
      const res = await fetch('/api/meta/transcricao/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ limite: 10 }),
      });
      const data = await res.json() as {
        processados?: number;
        falhas?: number;
        detalhes?: Array<{ nome: string; ok: boolean; modo: string; erro?: string }>;
      };
      setBatchResultado({
        processados: data.processados ?? 0,
        falhas: data.falhas ?? 0,
        detalhes: data.detalhes ?? [],
      });
      // Polling para atualizar os cards
      let i = 0;
      const poll = setInterval(async () => {
        await recarregar();
        if (++i >= 6) clearInterval(poll);
      }, 3000);
    } finally {
      setTranscrevendo(false);
    }
  }

  const visiveis = criativos.filter(c => filtro === 'todos' || c.tipo === filtro);
  const qtdVideos  = criativos.filter(c => c.tipo === 'video').length;
  const qtdImagens = criativos.filter(c => c.tipo === 'imagem').length;

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setErro(null);

    for (const file of Array.from(files)) {
      const maxMb = file.type.startsWith('video/') ? 500 : 30;
      if (file.size > maxMb * 1024 * 1024) {
        setErro(`Arquivo muito grande. Máximo: ${maxMb}MB`);
        continue;
      }
      const result = await uploadArquivo(file);
      if (!result.ok) setErro(result.error ?? 'Erro no upload');
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  return (
    <>
    {preview && (
      <VideoPreviewModal
        criativoId={preview.id}
        nome={preview.nome}
        onClose={() => setPreview(null)}
      />
    )}
    <div className="space-y-4">

      {/* Filtros + recarregar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {([
            { label: 'Todos',   valor: 'todos',  count: criativos.length },
            { label: 'Vídeos',  valor: 'video',  count: qtdVideos },
            { label: 'Imagens', valor: 'imagem', count: qtdImagens },
          ] as const).map(({ label, valor, count }) => (
            <button
              key={valor}
              onClick={() => setFiltro(valor)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                filtro === valor
                  ? 'bg-[#1e3a5f] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label} <span className="ml-1 opacity-60">{count}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={transcreverTodos}
            disabled={transcrevendo}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#1e3a5f] rounded-xl hover:bg-[#1e3a5f] hover:text-white text-[#1e3a5f] disabled:opacity-50 transition-colors"
          >
            {transcrevendo ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            {transcrevendo
              ? 'Transcrevendo...'
              : qtdPendentes > 0
                ? `Transcrever próximos 10 (${qtdPendentes} pendentes)`
                : 'Transcrever próximos 10'
            }
          </button>
          <button
            onClick={sincronizarDoMeta}
            disabled={sincronizando}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#1e3a5f] rounded-xl hover:bg-[#1e3a5f] hover:text-white text-[#1e3a5f] disabled:opacity-50 transition-colors"
          >
            {sincronizando
              ? <Loader2 size={12} className="animate-spin" />
              : <CloudDownload size={12} />
            }
            {sincronizando ? 'Sincronizando...' : 'Sincronizar do Meta'}
          </button>
          <button
            onClick={recarregar}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
          <span>{syncMsg}</span>
          <button onClick={() => setSyncMsg(null)} className="text-blue-400 hover:text-blue-600 text-xs">✕</button>
        </div>
      )}

      {/* Resultado do batch de transcrição */}
      {batchResultado && (
        <div className={`rounded-xl border p-3 space-y-2 ${batchResultado.falhas === 0 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-800">
              Resultado: {batchResultado.processados} ok · {batchResultado.falhas} falha{batchResultado.falhas !== 1 ? 's' : ''}
            </span>
            <button onClick={() => setBatchResultado(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
          </div>
          {batchResultado.detalhes.filter(d => !d.ok).map((d, i) => (
            <div key={i} className="flex items-start gap-2 p-2 bg-white/70 rounded-lg border border-red-100">
              <AlertCircle size={13} className="text-red-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-700 truncate">{d.nome}</p>
                <p className="text-xs text-red-600 break-words">{d.erro ?? 'Erro desconhecido'}</p>
              </div>
            </div>
          ))}
          {batchResultado.detalhes.filter(d => d.ok && d.modo === 'so_classificacao').length > 0 && (
            <p className="text-xs text-gray-500">
              ✓ {batchResultado.detalhes.filter(d => d.ok && d.modo === 'so_classificacao').length} classificados sem re-download (já tinham transcrição)
            </p>
          )}
        </div>
      )}

      {/* Área de drop / upload */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
          uploading
            ? 'border-blue-300 bg-blue-50 cursor-default'
            : 'border-gray-200 hover:border-[#1e3a5f] hover:bg-gray-50 cursor-pointer'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*,image/*"
          multiple
          className="hidden"
          onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
        />

        {uploading ? (
          <div className="space-y-3 max-w-xs mx-auto">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-[#1e3a5f] h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-sm text-gray-500">
              {uploadProgress < 90
                ? `Enviando para o Meta... ${uploadProgress}%`
                : 'Processando no Meta...'}
            </p>
          </div>
        ) : (
          <>
            <Upload size={28} className="mx-auto mb-2 text-gray-400" />
            <p className="text-sm font-medium text-gray-600">Arraste vídeos ou imagens aqui</p>
            <p className="text-xs text-gray-400 mt-1">Vídeos até 500 MB · Imagens até 30 MB · MP4, MOV, JPG, PNG</p>
          </>
        )}
      </div>

      {/* Erro */}
      {erro && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          <AlertCircle size={14} className="shrink-0" />
          <span className="flex-1">{erro}</span>
          <button onClick={() => setErro(null)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="aspect-video bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : visiveis.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">
          {criativos.length === 0
            ? 'Nenhum criativo ainda. Faça upload acima.'
            : 'Nenhum criativo com este filtro.'}
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-400">
            Exibindo {visiveis.length} de {total} criativo{total !== 1 ? 's' : ''}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {visiveis.map(criativo => (
              <CardCriativo
                key={criativo.id}
                criativo={criativo}
                onArquivar={() => arquivar(criativo.id)}
                onRetranscrever={() => retranscrever(criativo.id)}
                onPreview={() => setPreview({ id: criativo.id, nome: criativo.nome })}
              />
            ))}
            {cacheItems
              .filter(c => filtro === 'todos' || c.tipo === filtro)
              .map(c => (
                <CardCriativoCache key={`cache-${c.id}`} item={c} />
              ))
            }
          </div>
          {hasMore && (
            <div className="flex items-center justify-center pt-2">
              <button
                onClick={carregarMais}
                disabled={loadingMore}
                className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500 disabled:opacity-50 transition-colors"
              >
                {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
                {loadingMore ? 'Carregando...' : `Carregar mais 20`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
    </>
  );
}

/* ─── Modal de preview de vídeo ──────────────────────────────────────────── */

function VideoPreviewModal({
  criativoId,
  nome,
  onClose,
}: {
  criativoId: string;
  nome: string;
  onClose: () => void;
}) {
  const [url, setUrl]       = useState<string | null>(null);
  const [erro, setErro]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const auth = await getAuthHeader();
        const res = await fetch(`/api/meta/upload/${criativoId}`, {
          headers: { Authorization: auth },
        });
        const data = await res.json() as { url?: string; error?: string };
        if (data.url) setUrl(data.url);
        else setErro(data.error ?? 'URL não disponível');
      } catch {
        setErro('Erro ao carregar vídeo');
      } finally {
        setLoading(false);
      }
    })();
  }, [criativoId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-black rounded-2xl overflow-hidden w-full max-w-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 bg-black/80">
          <span className="text-white text-sm truncate max-w-xs">{nome}</span>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        <div className="aspect-video bg-gray-900 flex items-center justify-center">
          {loading && <Loader2 size={32} className="text-white/50 animate-spin" />}
          {erro && <p className="text-red-400 text-sm px-4 text-center">{erro}</p>}
          {url && (
            <video
              src={url}
              controls
              autoPlay
              className="w-full h-full object-contain"
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Card criativo do cache Meta ───────────────────────────────────────── */

function CardCriativoCache({ item }: { item: CacheCreativo }) {
  const [analisando, setAnalisando]   = useState(false);
  const [analisado, setAnalisado]     = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const [transcrito, setTranscrito]   = useState(false);
  const [erroAcao, setErroAcao]       = useState<string | null>(null);
  const [classificacao, setClassificacao] = useState<Record<string, unknown> | null>(null);

  function formatDuracao(s: number | null) {
    if (!s) return '';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  async function transcrever() {
    setTranscrevendo(true);
    setErroAcao(null);
    try {
      const auth = await getAuthHeader();

      // Passo 1: garantir que o criativo existe em ad_creatives (retorna ID existente ou cria)
      const upsertRes = await fetch('/api/meta/upload/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({
          nome:            item.nome || `Vídeo Meta ${item.id}`,
          tipo:            'video',
          metaVideoId:     item.id,
          thumbUrl:        item.url_thumb ?? undefined,
          duracaoSegundos: item.duracao ?? undefined,
        }),
      });
      const upsertData = await upsertRes.json() as { ok?: boolean; id?: string; error?: string };
      if (!upsertData.ok || !upsertData.id) {
        setErroAcao(upsertData.error ?? 'Erro ao registrar criativo');
        return;
      }

      // Passo 2: transcrever usando o UUID de ad_creatives
      const transcRes = await fetch('/api/meta/transcricao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ criativoId: upsertData.id }),
      });
      const transcData = await transcRes.json() as { ok?: boolean; error?: string };
      if (transcData.ok) {
        setTranscrito(true);
      } else {
        setErroAcao(transcData.error ?? 'Erro ao transcrever');
      }
    } catch {
      setErroAcao('Erro de conexão');
    } finally {
      setTranscrevendo(false);
    }
  }

  async function analisar() {
    const imageUrl = item.url_thumb || item.url_full;
    if (!imageUrl) return;
    setAnalisando(true);
    setErroAcao(null);
    try {
      const auth = await getAuthHeader();
      const res = await fetch('/api/meta/analisar-imagem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ criativoId: item.id, imageUrl, fonte: 'meta_creatives_cache' }),
      });
      const data = await res.json() as { ok?: boolean; classificacao?: Record<string, unknown>; error?: string };
      if (data.ok && data.classificacao) {
        setClassificacao(data.classificacao);
        setAnalisado(true);
      } else {
        setErroAcao(data.error?.includes('downloading') ? 'URL expirada — re-sincronize os criativos' : (data.error ?? 'Erro ao analisar'));
      }
    } catch {
      setErroAcao('Erro de conexão');
    } finally {
      setAnalisando(false);
    }
  }

  return (
    <div className="group relative bg-white border border-blue-100 rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
      {/* Thumbnail */}
      <div className="aspect-video bg-gray-100 relative">
        {item.url_thumb ? (
          <img src={item.url_thumb} alt={item.nome} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {item.tipo === 'video'
              ? <Video size={24} className="text-gray-300" />
              : <Image size={24} className="text-gray-300" />
            }
          </div>
        )}
        {item.duracao && (
          <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded-md font-mono">
            {formatDuracao(item.duracao)}
          </span>
        )}
        <span className="absolute top-1.5 right-1.5 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">
          Meta
        </span>
      </div>

      {/* Info */}
      <div className="p-2.5">
        <p className="text-xs font-medium text-gray-700 truncate">{item.nome}</p>
        <p className="text-xs text-gray-400 mt-0.5 truncate">
          ID: {item.id.substring(0, 12)}…
        </p>

        {item.tipo === 'video' ? (
          <button
            onClick={transcrever}
            disabled={transcrevendo || transcrito}
            className="w-full mt-1.5 py-1 text-xs bg-[#1e3a5f]/10 hover:bg-[#1e3a5f]/20 text-[#1e3a5f] rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
          >
            {transcrevendo
              ? <><Loader2 size={10} className="animate-spin" /> Transcrevendo áudio...</>
              : transcrito
                ? <><CheckCircle size={10} className="text-green-500" /> Transcrito</>
                : <>▶ Transcrever vídeo</>
            }
          </button>
        ) : (item.url_thumb || item.url_full) ? (
          <>
            <button
              onClick={analisar}
              disabled={analisando || analisado}
              className="w-full mt-1.5 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {analisando
                ? <><Loader2 size={10} className="animate-spin" /> Analisando imagem...</>
                : analisado
                  ? <><CheckCircle size={10} className="text-green-500" /> Analisado</>
                  : <><Search size={10} /> Analisar imagem</>
              }
            </button>
            {analisado && classificacao && (
              <div className="mt-1.5 space-y-0.5">
                {([
                  { label: 'Frio',   valor: classificacao.adequacao_publico_frio as number },
                  { label: 'Quente', valor: classificacao.adequacao_publico_quente as number },
                  { label: 'WA',     valor: classificacao.adequacao_whatsapp as number },
                ]).map(({ label, valor }) => (
                  <div key={label} className="flex items-center gap-1">
                    <span className="text-xs text-gray-400 w-10">{label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-1">
                      <div className="h-1 rounded-full bg-blue-500" style={{ width: `${(valor ?? 0) * 10}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 w-4">{valor}</span>
                  </div>
                ))}
                {typeof classificacao.resumo === 'string' && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{classificacao.resumo}</p>
                )}
              </div>
            )}
          </>
        ) : null}

        {erroAcao && (
          <p className="text-[10px] text-red-500 mt-1">{erroAcao}</p>
        )}
      </div>
    </div>
  );
}

/* ─── Card individual ────────────────────────────────────────────────────── */

function CardCriativo({
  criativo,
  onArquivar,
  onRetranscrever,
  onPreview,
}: {
  criativo: AdCreative;
  onArquivar: () => void;
  onRetranscrever: () => void;
  onPreview: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);

  const statusIcon = {
    pronto:      <CheckCircle size={11} className="text-green-500" />,
    processando: <Clock size={11} className="text-yellow-500" />,
    erro:        <AlertCircle size={11} className="text-red-500" />,
    arquivado:   null,
  }[criativo.status];

  function formatBytes(bytes: number | null) {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDuracao(s: number | null) {
    if (!s) return '';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  const metaId = criativo.meta_video_id ?? criativo.meta_image_hash;

  return (
    <div className="group relative bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-md transition-shadow">

      {/* Thumbnail */}
      <div className="aspect-video bg-gray-100 relative">
        {criativo.url_preview ? (
          <img
            src={criativo.url_preview}
            alt={criativo.nome}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {criativo.tipo === 'video'
              ? <Video size={24} className="text-gray-300" />
              : <Image size={24} className="text-gray-300" />
            }
          </div>
        )}

        {/* Play overlay para vídeos */}
        {criativo.tipo === 'video' && (
          <button
            onClick={onPreview}
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 transition-opacity"
          >
            <div className="w-9 h-9 bg-white/90 rounded-full flex items-center justify-center shadow">
              <Play size={13} className="text-gray-800 ml-0.5" fill="currentColor" />
            </div>
          </button>
        )}

        {/* Duração */}
        {criativo.duracao_segundos && (
          <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded-md font-mono">
            {formatDuracao(criativo.duracao_segundos)}
          </span>
        )}

        {/* Nota Judite */}
        {criativo.judite_nota != null && (
          <span className={`absolute top-1.5 left-1.5 text-xs px-1.5 py-0.5 rounded-md font-semibold ${
            criativo.judite_aprovado
              ? 'bg-green-500 text-white'
              : 'bg-yellow-400 text-yellow-900'
          }`}>
            {criativo.judite_nota.toFixed(1)}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5">
        <p className="text-xs font-medium text-gray-700 truncate">{criativo.nome}</p>

        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-1">
            {statusIcon}
            <span className="text-xs text-gray-400">{formatBytes(criativo.tamanho_bytes)}</span>
          </div>

          {confirmando ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={onArquivar}
                className="text-xs text-red-500 hover:text-red-700 font-medium"
              >
                Confirmar
              </button>
              <button
                onClick={() => setConfirmando(false)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmando(true)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-50"
              title="Arquivar criativo"
            >
              <Trash2 size={12} className="text-gray-400 hover:text-red-500" />
            </button>
          )}
        </div>

        {/* Meta ID badge */}
        {metaId && (
          <div className="mt-1.5 px-1.5 py-0.5 bg-blue-50 rounded-lg">
            <span className="text-xs text-blue-600 font-mono truncate block" title={metaId}>
              Meta: {metaId.substring(0, 14)}…
            </span>
          </div>
        )}

        {/* Transcrição / Classificação */}
        {criativo.tipo === 'video' && (
          <div className="mt-1.5">
            {criativo.transcricao_status === 'processando' && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-50 rounded-md">
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                <span className="text-xs text-yellow-700">Transcrevendo...</span>
              </div>
            )}

            {criativo.transcricao_status === 'concluida' && criativo.classificacao && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-md capitalize">
                    {criativo.classificacao.tipo_conteudo}
                  </span>
                  <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-md capitalize">
                    {criativo.classificacao.tom}
                  </span>
                  {criativo.classificacao.tem_cta && (
                    <span className="px-1.5 py-0.5 bg-green-50 text-green-700 text-xs rounded-md font-medium">
                      CTA
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {([
                    { label: 'Frio',   valor: criativo.classificacao.adequacao_publico_frio },
                    { label: 'Quente', valor: criativo.classificacao.adequacao_publico_quente },
                    { label: 'WA',     valor: criativo.classificacao.adequacao_whatsapp },
                  ] as const).map(({ label, valor }) => (
                    <div key={label} className="flex items-center gap-1">
                      <span className="text-xs text-gray-400 w-10">{label}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-1">
                        <div
                          className="h-1 rounded-full bg-[#1e3a5f] transition-all"
                          style={{ width: `${valor * 10}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-4">{valor}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {criativo.transcricao_status === 'erro' && (
              <div className="mt-1 space-y-1">
                {criativo.transcricao_erro && (
                  <p className="text-[10px] text-red-500 leading-tight break-words">
                    ⚠ {criativo.transcricao_erro}
                  </p>
                )}
                <button
                  onClick={onRetranscrever}
                  className="w-full py-1 text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                >
                  ↺ Tentar novamente
                </button>
              </div>
            )}

            {criativo.transcricao_status === 'concluida' && !criativo.classificacao && (
              <div className="mt-1 space-y-1">
                <p className="text-[10px] text-amber-600">
                  ⚠ Transcrito, sem classificação
                </p>
                <button
                  onClick={onRetranscrever}
                  className="w-full py-1 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition-colors"
                >
                  ↺ Classificar agora
                </button>
              </div>
            )}

            {(!criativo.transcricao_status || criativo.transcricao_status === 'pendente') && (
              <button
                onClick={onRetranscrever}
                className="w-full mt-1.5 py-1 text-xs bg-[#1e3a5f]/10 hover:bg-[#1e3a5f]/20 text-[#1e3a5f] rounded-lg transition-colors"
              >
                ▶ Transcrever
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
