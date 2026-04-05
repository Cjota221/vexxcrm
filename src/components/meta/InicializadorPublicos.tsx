'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { Users, Loader2, CheckCircle, AlertCircle, Play, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PubStatus {
  id?: string;
  status: 'criado' | 'erro';
  label: string;
}

interface ResultadoPublicos {
  ok: boolean;
  publicos: Record<string, PubStatus>;
  criados: number;
  mensagem: string;
}

interface Criativo {
  id: string;
  nome: string;
  meta_video_id: string;
  url_preview?: string;
}

export function InicializadorPublicos() {
  const [loading, setLoading]         = useState(false);
  const [resultado, setResultado]     = useState<ResultadoPublicos | null>(null);

  // Vídeos
  const [criativos, setCriativos]     = useState<Criativo[]>([]);
  const [videosSel, setVideosSel]     = useState<string[]>([]);
  const [criandoVideo, setCriandoVideo] = useState(false);
  const [videoMsg, setVideoMsg]       = useState<string | null>(null);

  useEffect(() => {
    const token = useAuthStore.getState().accessToken;
    fetch('/api/meta/criativos?limit=20', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then((d: { criativos?: Criativo[] }) => {
        setCriativos((d.criativos ?? []).filter(c => c.meta_video_id));
      })
      .catch(() => {});
  }, []);

  async function inicializar() {
    setLoading(true);
    setResultado(null);
    const token = useAuthStore.getState().accessToken;
    try {
      const res = await fetch('/api/meta/publicos/inicializar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      });
      const data = await res.json() as ResultadoPublicos;
      setResultado(data);
    } finally {
      setLoading(false);
    }
  }

  async function criarPublicoVideo() {
    if (!videosSel.length) return;
    setCriandoVideo(true);
    setVideoMsg(null);
    const token = useAuthStore.getState().accessToken;
    try {
      const res = await fetch('/api/meta/publicos/video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ video_ids: videosSel, percentual: 25, dias: 30 }),
      });
      const data = await res.json() as { ok?: boolean; meta_audience_id?: string; error?: string };
      setVideoMsg(
        data.ok
          ? `✅ Público de vídeo criado — ID: ${data.meta_audience_id}`
          : `❌ ${data.error ?? 'Erro ao criar'}`
      );
    } finally {
      setCriandoVideo(false);
    }
  }

  const toggleVideo = (id: string) => {
    setVideosSel(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  };

  return (
    <div className="mt-6 pt-6 border-t border-gray-100 space-y-5">
      <div>
        <h3 className="font-semibold text-gray-900 text-sm mb-1 flex items-center gap-1.5">
          <Zap size={14} className="text-crm-primary" />
          Inicializar todos os públicos
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Cria automaticamente: engajamento página, visitantes do site, engajamento Instagram, lista de clientes e Lookalike 1% BR.
        </p>

        {/* Erro */}
        {resultado && !resultado.ok && (
          <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
            {(resultado as unknown as { error?: string }).error ?? 'Erro ao inicializar públicos'}
          </div>
        )}

        {/* Resultados */}
        {resultado && resultado.ok && (
          <div className="mb-4 space-y-1.5">
            {resultado.publicos && Object.entries(resultado.publicos).map(([key, pub]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                {pub.status === 'criado'
                  ? <CheckCircle size={13} className="text-green-500 shrink-0" />
                  : <AlertCircle size={13} className="text-red-400 shrink-0" />
                }
                <span className="text-gray-600">{pub.label}:</span>
                <span className={pub.status === 'criado' ? 'text-green-600 font-mono text-xs' : 'text-red-500 text-xs'}>
                  {pub.status === 'criado' ? `ID ${pub.id?.substring(0, 14)}...` : 'Erro ao criar'}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-sm text-gray-400 mt-0.5">
              <AlertCircle size={13} className="shrink-0" />
              <span>Vídeo — selecione vídeos abaixo para criar</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">{resultado.mensagem}</p>
          </div>
        )}

        <button
          onClick={inicializar}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 bg-crm-primary text-white text-sm font-medium rounded-xl hover:opacity-90 disabled:opacity-50 transition-all"
        >
          {loading
            ? <><Loader2 size={14} className="animate-spin" /> Criando públicos...</>
            : <><Zap size={14} /> Inicializar todos os públicos</>
          }
        </button>
      </div>

      {/* Seletor de vídeos */}
      {criativos.length > 0 && (
        <div className="border-t border-gray-100 pt-4">
          <h4 className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
            <Play size={12} /> Público de Engajamento com Vídeo
          </h4>
          <p className="text-xs text-gray-400 mb-3">
            Selecione os vídeos — criaremos um público de quem assistiu 25%+.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
            {criativos.map(c => {
              const sel = videosSel.includes(c.meta_video_id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleVideo(c.meta_video_id)}
                  className={cn(
                    'relative rounded-xl border-2 p-2 text-left transition-all',
                    sel
                      ? 'border-crm-primary bg-crm-primary/5'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  {c.url_preview && (
                    <img src={c.url_preview} alt={c.nome} className="w-full aspect-video object-cover rounded-lg mb-1.5" />
                  )}
                  <p className="text-[10px] text-gray-700 truncate font-medium">{c.nome}</p>
                  {sel && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-crm-primary rounded-full flex items-center justify-center">
                      <CheckCircle size={10} className="text-white" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {videoMsg && (
            <p className={cn(
              'text-xs mb-2 px-3 py-2 rounded-lg',
              videoMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
            )}>
              {videoMsg}
            </p>
          )}
          <button
            onClick={criarPublicoVideo}
            disabled={criandoVideo || videosSel.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white text-xs font-medium rounded-xl hover:bg-gray-900 disabled:opacity-40 transition-all"
          >
            {criandoVideo
              ? <><Loader2 size={12} className="animate-spin" /> Criando...</>
              : <><Play size={12} /> Criar público de vídeo ({videosSel.length} selecionado{videosSel.length !== 1 ? 's' : ''})</>
            }
          </button>
        </div>
      )}
    </div>
  );
}
