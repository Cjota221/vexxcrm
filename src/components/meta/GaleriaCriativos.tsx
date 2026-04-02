'use client';

import { useRef, useState } from 'react';
import {
  Upload, Video, Image, Trash2, CheckCircle,
  Clock, AlertCircle, Play, RefreshCw,
} from 'lucide-react';
import { useAdCreatives, type AdCreative } from '@/hooks/useAdCreatives';

export function GaleriaCriativos() {
  const { criativos, loading, uploading, uploadProgress, uploadArquivo, arquivar, retranscrever, recarregar } = useAdCreatives();
  const inputRef = useRef<HTMLInputElement>(null);
  const [erro, setErro]   = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'video' | 'imagem'>('todos');

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
        <button
          onClick={recarregar}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {visiveis.map(criativo => (
            <CardCriativo
              key={criativo.id}
              criativo={criativo}
              onArquivar={() => arquivar(criativo.id)}
              onRetranscrever={() => retranscrever(criativo.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Card individual ────────────────────────────────────────────────────── */

function CardCriativo({
  criativo,
  onArquivar,
  onRetranscrever,
}: {
  criativo: AdCreative;
  onArquivar: () => void;
  onRetranscrever: () => void;
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
        {criativo.tipo === 'video' && criativo.url_preview && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 transition-opacity">
            <div className="w-9 h-9 bg-white/90 rounded-full flex items-center justify-center shadow">
              <Play size={13} className="text-gray-800 ml-0.5" fill="currentColor" />
            </div>
          </div>
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
              <button
                onClick={onRetranscrever}
                className="text-xs text-red-500 hover:text-red-700 underline"
              >
                Erro — tentar novamente
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
