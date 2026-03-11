'use client';

/**
 * MediaMessage.tsx
 * Container padronizado para imagem/vídeo (max 300×400px) + lightbox.
 * DocumentMessage: ícone + nome do arquivo, link para download.
 * Skeleton enquanto carrega. Fallback elegante para URL expirada.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import Download from 'yet-another-react-lightbox/plugins/download';
import 'yet-another-react-lightbox/styles.css';
import { ImageOff, FileText, FileSpreadsheet, FileArchive, File, Download as DownloadIcon, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Imagem ───────────────────────────────────────────────────────────────────

interface MediaMessageProps {
  url: string;
  type: 'image' | 'video';
  caption?: string;
  thumbnailUrl?: string;
  isFromMe?: boolean;
  onRedownload?: () => void;
  isRedownloading?: boolean;
}

export function MediaMessage({
  url, type, caption, thumbnailUrl, isFromMe = false,
  onRedownload, isRedownloading,
}: MediaMessageProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const autoRedownloadedRef = useRef(false);

  // Quando a URL muda (re-download bem sucedido), resetar estado de erro
  useEffect(() => {
    setImgError(false);
    setLoaded(false);
    autoRedownloadedRef.current = false;
  }, [url]);

  const openLightbox = useCallback(() => {
    if (!imgError) setLightboxOpen(true);
  }, [imgError]);

  // Ao receber erro 403, tenta re-download automático UMA vez
  const handleImgError = useCallback(() => {
    setImgError(true);
    if (!autoRedownloadedRef.current && onRedownload && !isRedownloading) {
      autoRedownloadedRef.current = true;
      onRedownload();
    }
  }, [onRedownload, isRedownloading]);

  if (type === 'image') {
    return (
      <>
        {/* Container sempre 300×max400 — NUNCA quebra o layout */}
        <div
          className="relative rounded-xl overflow-hidden cursor-zoom-in group"
          style={{ width: 280, maxHeight: 380 }}
          onClick={openLightbox}
          role="button"
          tabIndex={0}
          aria-label="Abrir imagem em tela cheia"
          onKeyDown={e => e.key === 'Enter' && openLightbox()}
        >
          {/* Skeleton */}
          {!loaded && !imgError && (
            <div className="w-70 h-50 bg-gray-200 animate-pulse rounded-xl" />
          )}

          {imgError ? (
            <MediaErrorFallback
              type="image"
              isFromMe={isFromMe}
              onRedownload={onRedownload}
              isRedownloading={isRedownloading}
            />
          ) : (
            <img
              src={thumbnailUrl ?? url}
              alt={caption ?? 'Imagem'}
              onLoad={() => setLoaded(true)}
              onError={handleImgError}
              style={{
                width: '100%',
                maxHeight: 380,
                objectFit: 'cover',
                display: loaded ? 'block' : 'none',
              }}
              className="rounded-xl transition-[filter] duration-150 group-hover:brightness-90"
            />
          )}

          {/* Overlay zoom */}
          {loaded && !imgError && (
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-xl flex items-end justify-end p-2">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-white bg-black/50 rounded-full px-2 py-0.5">
                🔍 Ampliar
              </span>
            </div>
          )}
        </div>

        {caption && (
          <p className={cn('text-[13px] mt-1.5 max-w-70 wrap-break-word leading-relaxed',
            isFromMe ? 'text-[#111b21]' : 'text-[#111B21]'
          )}>
            {caption}
          </p>
        )}

        <Lightbox
          open={lightboxOpen}
          close={() => setLightboxOpen(false)}
          slides={[{ src: url, alt: caption }]}
          plugins={[Zoom, Download]}
          zoom={{ maxZoomPixelRatio: 4, scrollToZoom: true }}
          styles={{ container: { backgroundColor: 'rgba(0,0,0,0.93)' } }}
        />
      </>
    );
  }

  // ─── Vídeo ────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 280 }} className="rounded-xl overflow-hidden">
      <video
        src={url}
        poster={thumbnailUrl}
        controls
        preload="none"
        crossOrigin="anonymous"
        style={{ maxWidth: 280, maxHeight: 380, width: '100%' }}
        className="rounded-xl"
        onError={() => setImgError(true)}
      >
        Seu navegador não suporta vídeo.
      </video>
      {caption && (
        <p className={cn('text-[13px] mt-1 wrap-break-word', isFromMe ? 'text-[#111b21]' : 'text-[#111B21]')}>
          {caption}
        </p>
      )}
    </div>
  );
}

// ─── Documento ────────────────────────────────────────────────────────────────

interface DocumentMessageProps {
  url: string;
  fileName?: string;
  mimeType?: string;
  isFromMe?: boolean;
}

const EXT_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  PDF: FileText,
  XLS: FileSpreadsheet,
  XLSX: FileSpreadsheet,
  DOC: FileText,
  DOCX: FileText,
  ZIP: FileArchive,
  RAR: FileArchive,
};

const EXT_COLORS: Record<string, string> = {
  PDF: 'text-red-500',
  XLS: 'text-green-600',
  XLSX: 'text-green-600',
  DOC: 'text-blue-600',
  DOCX: 'text-blue-600',
  ZIP: 'text-yellow-600',
  RAR: 'text-yellow-600',
};

export function DocumentMessage({ url, fileName, mimeType, isFromMe = false }: DocumentMessageProps) {
  const ext = fileName?.split('.').pop()?.toUpperCase() ?? 'DOC';
  const IconComponent = EXT_ICONS[ext] ?? File;
  const iconColor = EXT_COLORS[ext] ?? 'text-gray-500';

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2.5 max-w-65',
        'transition-colors',
        isFromMe
          ? 'bg-black/5 hover:bg-black/10'
          : 'bg-white border border-gray-100 shadow-sm hover:bg-gray-50',
      )}
    >
      <div className={cn('shrink-0', iconColor)}>
        <IconComponent size={28} />
      </div>
      <div className="min-w-0">
        <p className={cn('text-[13px] font-medium truncate',
          isFromMe ? 'text-[#111b21]' : 'text-[#111B21]'
        )}>
          {fileName ?? 'Documento'}
        </p>
        <p className={cn('text-[11px]', isFromMe ? 'text-[#667781]' : 'text-gray-400')}>
          {ext} · Toque para abrir
        </p>
      </div>
      <DownloadIcon size={14} className={isFromMe ? 'text-[#667781]' : 'text-gray-400'} />
    </a>
  );
}

// ─── Fallback para mídia indisponível ─────────────────────────────────────────

function MediaErrorFallback({
  type, isFromMe, onRedownload, isRedownloading,
}: {
  type: string; isFromMe: boolean;
  onRedownload?: () => void; isRedownloading?: boolean;
}) {
  const labels: Record<string, string> = {
    image: '🖼️ Imagem', video: '🎥 Vídeo', audio: '🎵 Áudio', document: '📎 Documento',
  };

  return (
    <div className={cn(
      'flex flex-col items-center gap-2 px-6 py-4 rounded-xl',
      isFromMe ? 'bg-white/10' : 'bg-gray-50 border border-gray-200',
    )}>
      <ImageOff size={24} className={isFromMe ? 'text-white/40' : 'text-gray-300'} />
      <p className={cn('text-[11px] text-center', isFromMe ? 'text-white/50' : 'text-gray-400')}>
        {labels[type] ?? 'Mídia'} indisponível
      </p>
      {onRedownload && (
        <button
          onClick={e => { e.stopPropagation(); onRedownload(); }}
          disabled={isRedownloading}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-all',
            isFromMe
              ? 'bg-white/20 text-white/80 hover:bg-white/30'
              : 'bg-gray-200 text-gray-600 hover:bg-gray-300',
            isRedownloading && 'opacity-50 cursor-not-allowed',
          )}
        >
          {isRedownloading
            ? <><RefreshCw size={11} className="animate-spin" /> Baixando...</>
            : <><DownloadIcon size={11} /> Re-baixar</>
          }
        </button>
      )}
    </div>
  );
}
