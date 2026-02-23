'use client';

import { useState, useCallback, memo } from 'react';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/utils';
import { Check, CheckCheck, Mic, Eye, AlertCircle, Clock, Copy, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { parseMessageContent } from '@/lib/message-parser';
import { AudioMessage } from './AudioMessage';
import { MediaMessage, DocumentMessage } from './MediaMessage';
import { LinkPreview, extractFirstUrl } from './LinkPreview';
import type { Message } from '@/types';

interface MessageBubbleProps {
  message: Message;
  /** Callback chamado quando a transcrição é atualizada (para invalidar query) */
  onTranscriptionUpdate?: (messageId: string, transcription: string) => void;
  /** Callback para reenviar mensagem que falhou */
  onRetry?: (message: Message) => void;
}

/**
 * Bolha de mensagem estilo WhatsApp.
 * Suporta texto, mídia, transcrição de áudio e descrição de imagem (IA).
 * Trata mídias com URL expirada (403) e oferece re-download.
 * Wrapped em React.memo para evitar re-renders desnecessários quando outras mensagens mudam.
 */
function MessageBubbleComponent({ message, onTranscriptionUpdate, onRetry }: MessageBubbleProps) {
  const isFromMe = message.from_me;
  const metadata = message.metadata as Record<string, unknown> | undefined;
  const transcription = metadata?.transcription as string | undefined;
  const aiDescription = metadata?.ai_description as string | undefined;
  const aiProcessed = metadata?.ai_processed as boolean | undefined;
  const copyCode = metadata?.copy_code as string | undefined;
  const [isRedownloading, setIsRedownloading] = useState(false);
  const [fixedUrl, setFixedUrl] = useState<string | null>(null);
  const [localTranscription, setLocalTranscription] = useState<string | null>(null);

  const currentMediaUrl = fixedUrl || message.media_url;
  const displayTranscription = localTranscription ?? transcription;

  const handleRedownload = useCallback(async () => {
    if (isRedownloading) return;
    setIsRedownloading(true);
    try {
      const response = await api.post<{ data: { media_url: string } }>('/api/media/redownload', {
        messageId: message.id,
      });
      if (response.error) { console.warn('[MessageBubble] Re-download falhou:', response.error); return; }
      const newUrl = (response.data as any)?.data?.media_url || (response.data as any)?.media_url;
      if (newUrl) setFixedUrl(newUrl);
    } catch (err) {
      console.warn('[MessageBubble] Erro no re-download:', err);
    } finally {
      setIsRedownloading(false);
    }
  }, [message.id, isRedownloading]);

  const handleTranscribe = useCallback(async () => {
    try {
      const res = await api.post<{ transcription: string }>('/api/whatsapp/transcribe-audio', {
        messageId: message.id,
      });
      const text = res.data?.transcription;
      if (!text) throw new Error('Falha na transcrição');
      setLocalTranscription(text);
      onTranscriptionUpdate?.(message.id, text);
    } catch (err) {
      console.warn('[MessageBubble] Transcrição falhou:', err);
      throw err; // re-throw para AudioMessage mostrar erro
    }
  }, [message.id, onTranscriptionUpdate]);

  const statusIcon = () => {
    if (!isFromMe) return null;
    switch (message.status) {
      case 'pending':
        return <Clock size={12} className="text-[#111b21]/30" />;
      case 'sent':
        return <Check size={14} className="text-[#111b21]/50" />;
      case 'delivered':
        return <CheckCheck size={14} className="text-[#111b21]/50" />;
      case 'read':
        return <CheckCheck size={14} className="text-[#00a884]" />;
      case 'failed':
        return <AlertCircle size={13} className="text-red-500" />;
      default:
        return <Clock size={12} className="text-[#111b21]/30" />;
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
            ? 'bg-wa-bubble-out text-wa-text-bubble rounded-tr-sm'
            : 'bg-wa-bubble-in text-wa-text-primary rounded-tl-sm'
        )}
      >
      {/* Media content — Imagem */}
        {message.type === 'image' && (
          <div className="mb-1 -mx-1">
            <MediaMessage
              url={currentMediaUrl || ''}
              type="image"
              caption={message.content}
              isFromMe={isFromMe}
              onRedownload={handleRedownload}
              isRedownloading={isRedownloading}
            />
            {/* Descrição IA da imagem */}
            {aiDescription && (
              <div className={cn(
                'mt-1.5 p-2 rounded-lg text-[11px] leading-relaxed',
                isFromMe
                  ? 'bg-black/5 text-[#111b21]/80'
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
        {message.type === 'audio' && (
          <div className="mb-1">
            {!currentMediaUrl ? (
              <p className="text-xs opacity-50 py-1">Áudio indisponível</p>
            ) : (
              <AudioMessage
                url={currentMediaUrl}
                duration={(message.metadata as any)?.duration}
                isFromMe={isFromMe}
                onTranscribe={!displayTranscription && !isFromMe ? handleTranscribe : undefined}
              />
            )}
            {/* Transcrição do áudio (IA ou manual) */}
            {displayTranscription && (
              <div className={cn(
                'mt-1.5 p-2 rounded-lg text-[11px] leading-relaxed',
                isFromMe
                  ? 'bg-black/5 text-[#111b21]/80'
                  : 'bg-black/5 text-wa-text-secondary'
              )}>
                <div className="flex items-center gap-1 mb-0.5 opacity-70">
                  <Mic size={10} />
                  <span className="text-[9px] font-medium uppercase tracking-wide">Transcrição</span>
                </div>
                <p>{displayTranscription}</p>
              </div>
            )}
          </div>
        )}

        {/* Media content — Vídeo */}
        {message.type === 'video' && (
          <div className="mb-1 -mx-1">
            <MediaMessage
              url={currentMediaUrl || ''}
              type="video"
              caption={message.content}
              isFromMe={isFromMe}
              onRedownload={handleRedownload}
              isRedownloading={isRedownloading}
            />
          </div>
        )}

        {/* Media content — Documento */}
        {message.type === 'document' && (
          <div className="mb-1">
            <DocumentMessage
              url={currentMediaUrl || ''}
              fileName={(message.metadata as any)?.fileName || message.content || 'Documento'}
              mimeType={(message.metadata as any)?.mimeType || 'application/octet-stream'}
              isFromMe={isFromMe}
            />
          </div>
        )}

        {/* Text content */}
        {message.content && message.type !== 'image' && message.type !== 'video' && (
          <>
            <p className="text-sm wrap-break-word leading-relaxed">
              {parseMessageContent(message.content)}
            </p>
            {/* Link preview — renderiza card OG para a primeira URL encontrada no texto */}
            {(() => {
              const url = extractFirstUrl(message.content);
              return url ? <LinkPreview url={url} isFromMe={isFromMe} /> : null;
            })()}
          </>
        )}

        {/* Botão copy_code — renderizado para mensagens com metadata.copy_code */}
        {copyCode && (
          <div className={cn(
            'mt-2 pt-2 border-t',
            isFromMe ? 'border-black/10' : 'border-black/8'
          )}>
            <button
              onClick={() => { navigator.clipboard.writeText(copyCode).catch(() => {}); }}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-1.5 text-sm font-medium rounded-lg transition-colors',
                isFromMe
                  ? 'text-blue-600 hover:bg-black/5'
                  : 'text-blue-600 hover:bg-blue-50'
              )}
              title="Toque para copiar"
            >
              <Copy size={13} />
              <span className="font-mono text-xs">{copyCode}</span>
            </button>
          </div>
        )}

        {/* Timestamp + status */}
        <div className={cn(
          'flex items-center gap-1 mt-1',
          isFromMe ? 'justify-end' : 'justify-end'
        )}>
          <span className={cn(
            'text-[11px]',
            isFromMe ? 'text-wa-text-time' : 'text-wa-text-secondary'
          )}>
            {formatTime(message.timestamp ?? message.created_at)}
          </span>
          {statusIcon()}
        </div>

        {/* Botão de reenvio quando falhou */}
        {message.status === 'failed' && isFromMe && (
          <button
            onClick={() => onRetry?.(message)}
            className="mt-1 w-full flex items-center justify-center gap-1.5 text-[11px] text-red-500 hover:text-red-600 transition-colors"
            title="Toque para reenviar"
          >
            <RotateCcw size={11} />
            <span>Falhou · Toque para reenviar</span>
          </button>
        )}
      </div>
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleComponent, (prev, next) => (
  prev.message.id === next.message.id &&
  prev.message.status === next.message.status &&
  prev.message.content === next.message.content &&
  prev.message.media_url === next.message.media_url &&
  (prev.message.metadata as any)?.transcription === (next.message.metadata as any)?.transcription
));
