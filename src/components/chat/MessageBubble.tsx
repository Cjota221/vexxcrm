'use client';

import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/utils';
import { Check, CheckCheck } from 'lucide-react';
import type { Message } from '@/types';

interface MessageBubbleProps {
  message: Message;
}

/**
 * Bolha de mensagem estilo WhatsApp.
 */
export function MessageBubble({ message }: MessageBubbleProps) {
  const isFromMe = message.from_me;

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
        {/* Media content */}
        {message.media_url && message.type === 'image' && (
          <div className="mb-1 rounded-lg overflow-hidden">
            <img
              src={message.media_url}
              alt="Imagem"
              className="max-w-full rounded-lg"
              loading="lazy"
            />
          </div>
        )}

        {message.media_url && message.type === 'audio' && (
          <audio controls className="max-w-full">
            <source src={message.media_url} />
          </audio>
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
