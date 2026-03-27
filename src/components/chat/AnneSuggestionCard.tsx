'use client';

import { useState } from 'react';
import { Sparkles, Send, Pencil, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AnneSuggestion } from '@/hooks/useAnneSuggestion';

interface AnneSuggestionCardProps {
  suggestion: AnneSuggestion;
  /** Envia a mensagem sugerida diretamente */
  onSend: (text: string) => void;
  /** Copia o texto para o input de mensagem para edição */
  onEdit: (text: string) => void;
  /** Descarta a sugestão */
  onDismiss: () => void;
  className?: string;
}

/**
 * Card exibido acima do MessageInput quando a Anne gerou uma sugestão
 * de resposta no modo send_mode='suggest'.
 *
 * A operadora pode:
 *  - Enviar a sugestão diretamente (botão Enviar)
 *  - Editar no input antes de enviar (botão Editar)
 *  - Descartar a sugestão (botão X)
 */
export function AnneSuggestionCard({
  suggestion,
  onSend,
  onEdit,
  onDismiss,
  className,
}: AnneSuggestionCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [sending, setSending] = useState(false);

  const isLong = suggestion.mensagem.length > 120;
  const preview = isLong && !expanded
    ? suggestion.mensagem.slice(0, 120) + '…'
    : suggestion.mensagem;

  const handleSend = async () => {
    setSending(true);
    try {
      onSend(suggestion.mensagem);
    } finally {
      setSending(false);
    }
  };

  const confidencePct = suggestion.confidence != null
    ? Math.round(suggestion.confidence * 100)
    : null;

  return (
    <div
      className={cn(
        'mx-2 mb-1 rounded-xl border border-[#25d366]/30 bg-[#f0fdf4] dark:bg-[#0d2118] dark:border-[#25d366]/20 shadow-sm',
        className
      )}
    >
      {/* Cabeçalho */}
      <div className="flex items-center gap-2 px-3 pt-2 pb-1">
        <Sparkles size={14} className="text-[#25d366] shrink-0" />
        <span className="text-xs font-semibold text-[#1a7a3f] dark:text-[#4ade80] flex-1">
          Sugestão da Anne
          {suggestion.agent && (
            <span className="font-normal text-[#1a7a3f]/60 dark:text-[#4ade80]/60 ml-1">
              · {suggestion.agent}
            </span>
          )}
          {confidencePct !== null && (
            <span className="font-normal text-[#1a7a3f]/60 dark:text-[#4ade80]/60 ml-1">
              · {confidencePct}% confiança
            </span>
          )}
        </span>

        {/* Expandir / recolher para mensagens longas */}
        {isLong && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[#1a7a3f]/50 hover:text-[#1a7a3f] dark:text-[#4ade80]/50 dark:hover:text-[#4ade80] transition-colors"
            title={expanded ? 'Recolher' : 'Expandir'}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}

        {/* Descartar */}
        <button
          onClick={onDismiss}
          className="text-[#1a7a3f]/50 hover:text-red-500 dark:text-[#4ade80]/50 dark:hover:text-red-400 transition-colors"
          title="Descartar sugestão"
        >
          <X size={14} />
        </button>
      </div>

      {/* Texto da sugestão */}
      <p className="px-3 pb-2 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
        {preview}
      </p>

      {/* Ações */}
      <div className="flex gap-2 px-3 pb-2">
        <button
          onClick={handleSend}
          disabled={sending}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors',
            'bg-[#25d366] hover:bg-[#1eb758] text-white disabled:opacity-60 disabled:cursor-not-allowed'
          )}
        >
          <Send size={12} />
          {sending ? 'Enviando…' : 'Enviar'}
        </button>

        <button
          onClick={() => onEdit(suggestion.mensagem)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors',
            'border border-[#25d366]/40 text-[#1a7a3f] dark:text-[#4ade80]',
            'hover:bg-[#25d366]/10 dark:hover:bg-[#25d366]/20'
          )}
        >
          <Pencil size={12} />
          Editar
        </button>
      </div>
    </div>
  );
}
