'use client';

import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/utils';
import { Check, CheckCheck, Mic, Eye } from 'lucide-react';
import type { Message } from '@/types';

interface MessageBubbleProps {
  message: Message;
}

/**
 * Bolha de mensagem estilo WhatsApp.
 * Suporta texto, mídia, transcrição de áudio e descrição de imagem (IA).
 */
export function MessageBubble({ message }: MessageBubbleProps) {
  const isFromMe = message.from_me;
  const metadata = message.metadata as Record<string, unknown> | undefined;
  const transcription = metadata?.transcription as string | undefined;
  const aiDescription = metadata?.ai_description as string | undefined;
  const aiProcessed = metadata?.ai_processed as boolean | undefined;

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
        {message.media_url && message.type === 'image' && (
          <div className="mb-1">
            <div className="rounded-lg overflow-hidden">
              <img
                src={message.media_url}
                alt="Imagem"
                className="max-w-full rounded-lg"
                loading="lazy"
              />
            </div>
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
        {message.media_url && message.type === 'audio' && (
          <div className="mb-1">
            <audio controls className="max-w-full">
              <source src={message.media_url} />
            </audio>
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
        {message.media_url && message.type === 'video' && (
          <div className="mb-1 rounded-lg overflow-hidden">
            <video controls className="max-w-full rounded-lg">
              <source src={message.media_url} />
            </video>
          </div>
        )}

        {/* Media content — Documento */}
        {message.media_url && message.type === 'document' && (
          <div className="mb-1">
            <a
              href={message.media_url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-2 p-2 rounded-lg text-xs underline',
                isFromMe ? 'bg-white/10 text-white/90' : 'bg-black/5 text-blue-600'
              )}
            >
              📎 Documento
            </a>
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
