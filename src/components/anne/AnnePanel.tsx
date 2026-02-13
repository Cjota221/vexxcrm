'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, Send, Sparkles, X, Minimize2, Maximize2 } from 'lucide-react';
import { useAnne } from '@/hooks/useAnne';
import { cn } from '@/lib/utils';

interface AnnePanelProps {
  clientId?: string;
  className?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/**
 * Painel da Anne (IA Assistente) — chat com a IA para suporte ao atendente.
 */
export function AnnePanel({ clientId, className }: AnnePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Olá! Sou a Anne, sua assistente de vendas com IA. Como posso ajudar? 🤖',
      timestamp: new Date(),
    },
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { sendMessage, isLoading: isPending } = useAnne();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isPending) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const text = input.trim();
    setInput('');

    try {
      // Enviar histórico para a Anne ter contexto da conversa
      const chatHistory = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-10) // Últimas 10 mensagens para não estourar tokens
        .map(m => ({ role: m.role, content: m.content }));

      const data = await sendMessage({
        message: text,
        context: {
          ...(clientId ? { client_id: clientId } : {}),
          chat_history: chatHistory,
        },
      });
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data?.reply || 'Desculpe, não consegui processar.',
          timestamp: new Date(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Ops, ocorreu um erro. Tente novamente.',
          timestamp: new Date(),
        },
      ]);
    }
  };

  // Botão flutuante
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed bottom-6 right-6 z-50',
          'w-14 h-14 rounded-full bg-crm-primary text-white',
          'flex items-center justify-center shadow-lg',
          'hover:scale-105 transition-transform',
          className
        )}
        title="Abrir Anne IA"
      >
        <Bot size={24} />
      </button>
    );
  }

  return (
    <div
      className={cn(
        'fixed bottom-6 right-6 z-50',
        'bg-white rounded-2xl shadow-2xl border border-surface-200',
        'flex flex-col overflow-hidden transition-all duration-300',
        isMinimized ? 'w-72 h-14' : 'w-96 h-[500px]',
        className
      )}
    >
      {/* Header */}
      <div className="h-14 bg-crm-primary text-white flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={18} />
          <span className="font-semibold text-sm">Anne IA</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 hover:bg-white/20 rounded transition-colors"
          >
            {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 hover:bg-white/20 rounded transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 wa-scrollbar">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm',
                  msg.role === 'user'
                    ? 'ml-auto bg-crm-primary text-white rounded-br-sm'
                    : 'bg-surface-100 text-txt-primary rounded-bl-sm'
                )}
              >
                {msg.content}
              </div>
            ))}
            {isPending && (
              <div className="max-w-[85%] bg-surface-100 rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm text-txt-secondary">
                <span className="flex items-center gap-1.5">
                  <Bot size={14} className="animate-pulse" />
                  Pensando...
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-surface-200 p-3 flex gap-2 shrink-0">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Pergunte à Anne..."
              className="flex-1 text-sm bg-surface-50 border border-surface-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crm-primary/30 focus:border-crm-primary transition-all"
              disabled={isPending}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isPending}
              className="w-9 h-9 rounded-xl bg-crm-primary text-white flex items-center justify-center hover:bg-crm-primary/90 disabled:opacity-50 transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
