'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/utils';
import { Check, CheckCheck, Mic, Eye, ImageOff, RefreshCw, Download } from 'lucide-react';
import { api } from '@/lib/api';
import type { Message } from '@/types';

interface MessageBubbleProps {
  message: Message;
}

/**
 * Bolha de mensagem estilo WhatsApp.
 * Suporta texto, mídia, transcrição de áudio e descrição de imagem (IA).
 * Trata mídias com URL expirada (403) e oferece re-download.
 */
export function MessageBubble({ message }: MessageBubbleProps) {
  const isFromMe = message.from_me;
  const metadata = message.metadata as Record<string, unknown> | undefined;
  const transcription = metadata?.transcription as string | undefined;
  const aiDescription = metadata?.ai_description as string | undefined;
  const aiProcessed = metadata?.ai_processed as boolean | undefined;
  const [mediaError, setMediaError] = useState(false);
  const [isRedownloading, setIsRedownloading] = useState(false);
  const [fixedUrl, setFixedUrl] = useState<string | null>(null);

  const currentMediaUrl = fixedUrl || message.media_url;

  /**
   * Tenta re-baixar a mídia expirada via Evolution API → Supabase Storage.
   */
  const handleRedownload = useCallback(async () => {
    setIsRedownloading(true);
    try {
      const response = await api.post<{ data: { media_url: string } }>('/api/media/redownload', {
        messageId: message.id,
      });

      if (response.error) {
        console.warn('[MessageBubble] Re-download falhou:', response.error);
        return;
      }

      const newUrl = (response.data as any)?.data?.media_url || (response.data as any)?.media_url;
      if (newUrl) {
        setFixedUrl(newUrl);
        setMediaError(false);
      }
    } catch (err) {
      console.warn('[MessageBubble] Erro no re-download:', err);
    } finally {
      setIsRedownloading(false);
    }
  }, [message.id]);

  /**
   * Ao detectar erro de carregamento de mídia (403 URL expirada),
   * tenta re-download automático. Só mostra fallback se re-download falhar.
   */
  const handleMediaError = useCallback(async () => {
    // Se já tentou re-download antes, não tenta de novo — exibe fallback
    if (isRedownloading || fixedUrl) {
      setMediaError(true);
      return;
    }

    setIsRedownloading(true);
    try {
      const response = await api.post<{ data: { media_url: string } }>('/api/media/redownload', {
        messageId: message.id,
      });

      const newUrl = (response.data as any)?.data?.media_url || (response.data as any)?.media_url;
      if (newUrl && !response.error) {
        setFixedUrl(newUrl);
        // Não seta mediaError — a nova URL vai tentar carregar
      } else {
        setMediaError(true);
      }
    } catch {
      setMediaError(true);
    } finally {
      setIsRedownloading(false);
    }
  }, [message.id, isRedownloading, fixedUrl]);

  const statusIcon = () => {
    if (!isFromMe) return null;
    switch (message.status) {
      case 'sent':
        return <Check size={14} className="text-white/60" />;
      case 'delivered':
        return <CheckCheck size={14} className="text-white/60" />;
      case 'read':
        return <CheckCheck size={14} className="text-sky-300" />;
      case 'failed':
        return <span className="text-[10px] text-red-300">!</span>;
      default:
        return null;
    }
  };

  return (
    <div
      className={cn(
        'flex mb-1',
        isFromMe ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[65%] px-3 py-2 rounded-bubble relative',
          isFromMe
            ? 'bg-wa-bubble-out text-white rounded-tr-sm'
            : 'bg-wa-bubble-in text-wa-text-primary rounded-tl-sm'
        )}
      >
        {/* Media content — Imagem */}
        {currentMediaUrl && message.type === 'image' && (
          <div className="mb-1">
            {mediaError ? (
              <MediaErrorFallback
                type="image"
                isFromMe={isFromMe}
                isRedownloading={isRedownloading}
                onRedownload={handleRedownload}
              />
            ) : (
              <div className="rounded-lg overflow-hidden">
                <img
                  src={currentMediaUrl}
                  alt="Imagem"
                  className="max-w-full rounded-lg"
                  loading="lazy"
                  onError={handleMediaError}
                />
              </div>
            )}
            {/* Descrição IA da imagem */}
            {aiDescription && (
              <div className={cn(
                'mt-1.5 p-2 rounded-lg text-[11px] leading-relaxed',
                isFromMe
                  ? 'bg-white/10 text-white/80'
                  : 'bg-black/5 text-wa-text-secondary'
              )}>
                <div className="flex items-center gap-1 mb-0.5 opacity-70">
                  <Eye size={10} />
                  <span className="text-[9px] font-medium uppercase tracking-wide">Visão IA</span>
                </div>
                <p>{aiDescription}</p>
              </div>
            )}
          </div>
        )}

        {/* Media content — Áudio + Transcrição */}
        {currentMediaUrl && message.type === 'audio' && (
          <div className="mb-1">
            {mediaError ? (
              <MediaErrorFallback
                type="audio"
                isFromMe={isFromMe}
                isRedownloading={isRedownloading}
                onRedownload={handleRedownload}
              />
            ) : (
              <audio controls className="max-w-full" onError={handleMediaError}>
                <source src={currentMediaUrl} />
              </audio>
            )}
            {/* Transcrição do áudio (IA) */}
            {transcription && (
              <div className={cn(
                'mt-1.5 p-2 rounded-lg text-[11px] leading-relaxed',
                isFromMe
                  ? 'bg-white/10 text-white/80'
                  : 'bg-black/5 text-wa-text-secondary'
              )}>
                <div className="flex items-center gap-1 mb-0.5 opacity-70">
                  <Mic size={10} />
                  <span className="text-[9px] font-medium uppercase tracking-wide">Transcrição</span>
                </div>
                <p>{transcription}</p>
              </div>
            )}
            {/* Indicador de processamento pendente */}
            {message.media_url && !transcription && !aiProcessed && !isFromMe && (
              <div className={cn(
                'mt-1 text-[9px] opacity-50 flex items-center gap-1',
                isFromMe ? 'text-white/40' : 'text-wa-text-secondary'
              )}>
                <Mic size={9} className="animate-pulse" />
                <span>Transcrevendo...</span>
              </div>
            )}
          </div>
        )}

        {/* Media content — Vídeo */}
        {currentMediaUrl && message.type === 'video' && (
          <div className="mb-1 rounded-lg overflow-hidden">
            {mediaError ? (
              <MediaErrorFallback
                type="video"
                isFromMe={isFromMe}
                isRedownloading={isRedownloading}
                onRedownload={handleRedownload}
              />
            ) : (
              <video controls className="max-w-full rounded-lg" onError={handleMediaError}>
                <source src={currentMediaUrl} />
              </video>
            )}
          </div>
        )}

        {/* Media content — Documento */}
        {currentMediaUrl && message.type === 'document' && (
          <div className="mb-1">
            {mediaError ? (
              <MediaErrorFallback
                type="document"
                isFromMe={isFromMe}
                isRedownloading={isRedownloading}
                onRedownload={handleRedownload}
              />
            ) : (
              <a
                href={currentMediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center gap-2 p-2 rounded-lg text-xs underline',
                  isFromMe ? 'bg-white/10 text-white/90' : 'bg-black/5 text-blue-600'
                )}
              >
                📎 Documento
              </a>
            )}
          </div>
        )}

        {/* Text content */}
        {message.content && (
          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </p>
        )}

        {/* Timestamp + status */}
        <div className={cn(
          'flex items-center gap-1 mt-1',
          isFromMe ? 'justify-end' : 'justify-end'
        )}>
          <span className={cn(
            'text-[11px]',
            isFromMe ? 'text-white/50' : 'text-wa-text-secondary'
          )}>
            {formatTime(message.timestamp)}
          </span>
          {statusIcon()}
        </div>
      </div>
    </div>
  );
}

/**
 * Fallback visual quando uma mídia retorna 403 (URL expirada).
 * Oferece botão de re-download via Evolution API → Supabase Storage.
 */
function MediaErrorFallback({
  type,
  isFromMe,
  isRedownloading,
  onRedownload,
}: {
  type: string;
  isFromMe: boolean;
  isRedownloading: boolean;
  onRedownload: () => void;
}) {
  const labels: Record<string, string> = {
    image: '🖼️ Imagem',
    video: '🎥 Vídeo',
    audio: '🎵 Áudio',
    document: '📎 Documento',
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 p-4 rounded-lg',
        isFromMe ? 'bg-white/10' : 'bg-black/5'
      )}
    >
      <ImageOff
        size={24}
        className={cn(
          isFromMe ? 'text-white/40' : 'text-wa-text-secondary'
        )}
      />
      <p
        className={cn(
          'text-[11px] text-center',
          isFromMe ? 'text-white/50' : 'text-wa-text-secondary'
        )}
      >
        {labels[type] || 'Mídia'} indisponível
      </p>
      <button
        onClick={onRedownload}
        disabled={isRedownloading}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all',
          isFromMe
            ? 'bg-white/20 text-white/80 hover:bg-white/30'
            : 'bg-black/10 text-wa-text-primary hover:bg-black/15',
          isRedownloading && 'opacity-50 cursor-not-allowed'
        )}
      >
        {isRedownloading ? (
          <>
            <RefreshCw size={12} className="animate-spin" />
            Baixando...
          </>
        ) : (
          <>
            <Download size={12} />
            Re-baixar
          </>
        )}
      </button>
    </div>
  );
}
