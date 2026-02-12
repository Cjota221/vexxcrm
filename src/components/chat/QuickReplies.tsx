'use client';

import { useState } from 'react';
import { Sparkles, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

const DEFAULT_REPLIES = [
  'Olá! Como posso ajudar?',
  'Vou verificar o status do seu pedido.',
  'Posso te enviar o link de pagamento?',
  'Obrigado pela preferência! 😊',
  'Seu pedido foi enviado! 📦',
  'Temos uma promoção especial para você!',
];

interface QuickRepliesProps {
  onSelect: (text: string) => void;
  suggestions?: string[];
}

/**
 * Respostas rápidas com sugestões da IA (Anne).
 */
export function QuickReplies({ onSelect, suggestions }: QuickRepliesProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const replies = suggestions && suggestions.length > 0 ? suggestions : DEFAULT_REPLIES;

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-wa-text-secondary hover:text-wa-accent-green transition-colors"
        title="Respostas rápidas"
      >
        <Sparkles size={14} />
        <span>Respostas rápidas</span>
      </button>
    );
  }

  return (
    <div className="border-t border-wa-border bg-wa-bg-panel px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-wa-text-secondary flex items-center gap-1">
          <Sparkles size={12} />
          Respostas rápidas
        </span>
        <button
          onClick={() => setIsExpanded(false)}
          className="text-xs text-wa-text-secondary hover:text-wa-text-primary"
        >
          Fechar
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {replies.map((reply, i) => (
          <button
            key={i}
            onClick={() => {
              onSelect(reply);
              setIsExpanded(false);
            }}
            className={cn(
              'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs',
              'bg-wa-bg-hover text-wa-text-primary',
              'hover:bg-wa-accent-green hover:text-white transition-colors'
            )}
          >
            <Send size={10} />
            {reply}
          </button>
        ))}
      </div>
    </div>
  );
}
