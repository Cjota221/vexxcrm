'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, Smile, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageInputProps {
  onSend: (content: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

/**
 * Input de mensagem com auto-resize estilo WhatsApp.
 */
export function MessageInput({ onSend, isLoading, disabled }: MessageInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isLoading || disabled) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, onSend, isLoading, disabled]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter sem shift = enviar
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="bg-wa-bg-panel border-t border-wa-border px-4 py-3">
      <div className="flex items-end gap-2">
        {/* Emoji */}
        <button className="p-2 text-wa-text-secondary hover:text-wa-text-primary transition-colors rounded-full hover:bg-wa-bg-hover">
          <Smile size={22} />
        </button>

        {/* Attach */}
        <button className="p-2 text-wa-text-secondary hover:text-wa-text-primary transition-colors rounded-full hover:bg-wa-bg-hover">
          <Paperclip size={22} />
        </button>

        {/* Input */}
        <div className="flex-1 bg-wa-bg-input rounded-xl px-4 py-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite uma mensagem"
            rows={1}
            disabled={disabled}
            className="w-full bg-transparent text-sm text-wa-text-primary placeholder:text-wa-text-secondary outline-none resize-none max-h-[120px]"
          />
        </div>

        {/* Send / Mic */}
        {text.trim() ? (
          <button
            onClick={handleSend}
            disabled={isLoading || disabled}
            className={cn(
              'p-2.5 rounded-full transition-colors',
              'bg-wa-accent-green text-white hover:opacity-90',
              (isLoading || disabled) && 'opacity-50 cursor-not-allowed'
            )}
          >
            <Send size={20} />
          </button>
        ) : (
          <button className="p-2 text-wa-text-secondary hover:text-wa-text-primary transition-colors rounded-full hover:bg-wa-bg-hover">
            <Mic size={22} />
          </button>
        )}
      </div>
    </div>
  );
}
