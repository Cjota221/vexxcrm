'use client';

/**
 * LinkPreview — Card de preview de link (Open Graph)
 *
 * Busca metadados OG server-side via /api/og para evitar CORS.
 * Renderiza card compacto com imagem, título, descrição e domínio.
 * Mostra apenas se a URL tiver título ou imagem.
 */

import { useEffect, useState } from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OGData {
  title: string | null;
  description: string | null;
  image: string | null;
  favicon: string | null;
  domain: string;
}

interface LinkPreviewProps {
  url: string;
  isFromMe?: boolean;
}

const cache = new Map<string, OGData | null>();

export function LinkPreview({ url, isFromMe = false }: LinkPreviewProps) {
  const [data, setData] = useState<OGData | null>(cache.get(url) ?? null);
  const [loaded, setLoaded] = useState(cache.has(url));

  useEffect(() => {
    if (cache.has(url)) return;
    let cancelled = false;
    fetch(`/api/og?url=${encodeURIComponent(url)}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: OGData | null) => {
        if (cancelled) return;
        const result = (d?.title || d?.image) ? d : null;
        cache.set(url, result);
        setData(result);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) { cache.set(url, null); setLoaded(true); }
      });
    return () => { cancelled = true; };
  }, [url]);

  if (!loaded || !data) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className={cn(
        'block mt-1.5 rounded-xl overflow-hidden border transition-opacity hover:opacity-90',
        isFromMe
          ? 'border-black/10 bg-black/5'
          : 'border-gray-200 bg-white shadow-sm'
      )}
    >
      {/* Imagem OG */}
      {data.image && (
        <div className="w-full max-h-36 overflow-hidden bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.image}
            alt={data.title || ''}
            className="w-full object-cover max-h-36"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}

      {/* Texto */}
      <div className="px-2.5 py-2 space-y-0.5">
        {/* Domínio + favicon */}
        <div className="flex items-center gap-1.5">
          {data.favicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.favicon}
              alt=""
              className="w-3.5 h-3.5 rounded-sm object-contain shrink-0"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <Globe size={12} className="text-gray-400 shrink-0" />
          )}
          <span className={cn(
            'text-[10px] font-medium truncate',
            isFromMe ? 'text-[#111b21]/50' : 'text-gray-400'
          )}>
            {data.domain}
          </span>
          <ExternalLink size={9} className={cn('shrink-0 ml-auto', isFromMe ? 'text-[#111b21]/30' : 'text-gray-300')} />
        </div>

        {/* Título */}
        {data.title && (
          <p className={cn(
            'text-[12px] font-semibold leading-tight line-clamp-2',
            isFromMe ? 'text-[#111b21]' : 'text-gray-800'
          )}>
            {data.title}
          </p>
        )}

        {/* Descrição */}
        {data.description && (
          <p className={cn(
            'text-[10px] leading-snug line-clamp-2',
            isFromMe ? 'text-[#111b21]/60' : 'text-gray-500'
          )}>
            {data.description}
          </p>
        )}
      </div>
    </a>
  );
}

/**
 * Extrai a primeira URL de um texto.
 * Retorna null se não houver URL.
 */
export function extractFirstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/);
  return m?.[0] ?? null;
}
