'use client';

/**
 * AnneFAB — Botão Flutuante Global da Anne
 *
 * Persiste em todas as telas (Central, CRM, Inteligência).
 * Mantém contexto da página ativa (client_id, page_context).
 * Interface de chat IA compacta e premium.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import {
  Bot,
  Send,
  X,
  Minus,
  Maximize2,
  Sparkles,
  RotateCcw,
  Copy,
  Check,
  ChevronRight,
} from 'lucide-react';
import { useAnne } from '@/hooks/useAnne';
import { cn } from '@/lib/utils';

/* ─── Tipos ─────────────────────────────────────────────── */

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface PageContext {
  label: string;
  color: string;
  icon: string;
}

/* ─── Contexto por rota ──────────────────────────────────── */

function detectPageContext(pathname: string): PageContext {
  if (pathname.startsWith('/central'))
    return { label: 'Central de Atendimento', color: 'from-crm-primary to-crm-secondary', icon: '💬' };
  if (pathname.startsWith('/crm'))
    return { label: 'CRM', color: 'from-purple-600 to-violet-700', icon: '🧠' };
  if (pathname.startsWith('/inteligencia') || pathname.startsWith('/intelligence'))
    return { label: 'Inteligência', color: 'from-orange-500 to-amber-600', icon: '📊' };
  if (pathname.startsWith('/campanhas') || pathname.startsWith('/campaigns'))
    return { label: 'Campanhas', color: 'from-green-600 to-emerald-700', icon: '📣' };
  return { label: 'VEXX CRM', color: 'from-crm-primary to-crm-secondary', icon: '⚡' };
}

/* ─── Sugestões rápidas por contexto ─────────────────────── */

const QUICK_SUGGESTIONS: Record<string, string[]> = {
  central:    ['Resumir última conversa', 'Cliente pronto para fechar?', 'Sugerir mensagem de follow-up'],
  crm:        ['Analisar perfil deste cliente', 'Quando foi a última compra?', 'Risco de churn?'],
  inteligencia: ['Quem são os VIPs em risco?', 'Melhores clientes para campanha', 'Tendência de recompra hoje'],
  campanhas:  ['Template para reativação', 'Melhor horário para enviar', 'Segmento mais lucrativo'],
  default:    ['Resumo do dia', 'Clientes VIP para contatar', 'Oportunidades de hoje'],
};

function getQuickSuggestions(pathname: string): string[] {
  if (pathname.startsWith('/central')) return QUICK_SUGGESTIONS.central;
  if (pathname.startsWith('/crm')) return QUICK_SUGGESTIONS.crm;
  if (pathname.startsWith('/inteligencia') || pathname.startsWith('/intelligence')) return QUICK_SUGGESTIONS.inteligencia;
  if (pathname.startsWith('/campanhas') || pathname.startsWith('/campaigns')) return QUICK_SUGGESTIONS.campanhas;
  return QUICK_SUGGESTIONS.default;
}

/* ─── Formatador de mensagem ─────────────────────────────── */

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [msg.content]);

  const isAssistant = msg.role === 'assistant';

  return (
    <div className={cn('group flex gap-2', isAssistant ? 'items-start' : 'items-start flex-row-reverse')}>
      {isAssistant && (
        <div className="w-6 h-6 rounded-full bg-linear-to-br from-crm-primary to-crm-secondary flex items-center justify-center shrink-0 mt-0.5">
          <Bot size={12} className="text-white" />
        </div>
      )}
      <div className={cn('max-w-[85%] relative', isAssistant ? '' : '')}>
        <div className={cn(
          'px-3 py-2 rounded-xl text-xs leading-relaxed',
          isAssistant
            ? 'bg-gray-50 text-gray-800 rounded-tl-sm border border-gray-100'
            : 'bg-crm-primary text-white rounded-tr-sm'
        )}>
          {msg.content}
        </div>
        <div className="flex items-center gap-1 mt-0.5 px-1">
          <span className="text-[10px] text-gray-400">
            {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {isAssistant && (
            <button
              onClick={handleCopy}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-gray-400 hover:text-gray-600"
            >
              {copied ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Componente Principal ───────────────────────────────── */

export function AnneFAB({ clientId }: { clientId?: string }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Olá! Sou a Anne 👋\nEstou aqui para ajudar com análises, sugestões e automações. O que precisa?',
      timestamp: new Date(),
    },
  ]);
  const [hasNotification, setHasNotification] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage, isLoading: isPending } = useAnne();

  const pageCtx = detectPageContext(pathname);
  const quickSuggestions = getQuickSuggestions(pathname);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isMinimized]);

  useEffect(() => {
    if (isOpen) {
      setHasNotification(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
  };

  const handleSend = useCallback(async (text?: string) => {
    const content = (text || input).trim();
    if (!content || isPending) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      const chatHistory = messages.slice(-8).map(m => ({ role: m.role, content: m.content }));
      const data = await sendMessage({
        message: content,
        context: {
          ...(clientId ? { client_id: clientId } : {}),
          chat_history: chatHistory,
        },
      });

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data?.reply || 'Desculpe, não consegui processar.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);

      if (!isOpen) setHasNotification(true);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Ops, ocorreu um erro. Tente novamente.',
        timestamp: new Date(),
      }]);
    }
  }, [input, isPending, messages, sendMessage, clientId, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReset = () => {
    setMessages([{
      id: 'welcome-reset',
      role: 'assistant',
      content: 'Conversa reiniciada. Como posso ajudar? 🔄',
      timestamp: new Date(),
    }]);
  };

  /* ── FAB fechado ──────────────────────────────────── */
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-xl transition-all duration-300',
          'bg-linear-to-br from-crm-primary to-crm-secondary',
          'flex items-center justify-center',
          'hover:scale-110 hover:shadow-2xl active:scale-95',
          'ring-4 ring-white/20'
        )}
        title="Anne IA — Clique para abrir"
      >
        <Bot size={22} className="text-white" />
        {hasNotification && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse" />
        )}
        {/* Pulse ring */}
        <span className="absolute inset-0 rounded-full ring-2 ring-crm-secondary/40 animate-ping" />
      </button>
    );
  }

  /* ── FAB minimizado ───────────────────────────────── */
  if (isMinimized) {
    return (
      <div
        className="fixed bottom-6 right-6 z-50 bg-white rounded-2xl shadow-xl border border-gray-200 flex items-center gap-3 px-4 py-3 cursor-pointer hover:shadow-2xl transition-all"
        onClick={() => setIsMinimized(false)}
      >
        <div className="w-8 h-8 rounded-full bg-linear-to-br from-crm-primary to-crm-secondary flex items-center justify-center">
          <Bot size={16} className="text-white" />
        </div>
        <div className="leading-tight">
          <p className="text-xs font-bold text-gray-900">Anne IA</p>
          <p className="text-[10px] text-gray-400">{pageCtx.icon} {pageCtx.label}</p>
        </div>
        <Maximize2 size={14} className="text-gray-400" />
      </div>
    );
  }

  /* ── FAB aberto ───────────────────────────────────── */
  return (
    <div className="fixed bottom-6 right-6 z-50 w-90 flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
      style={{ maxHeight: 'calc(100vh - 7rem)' }}>

      {/* Header */}
      <div className={cn('flex items-center justify-between px-4 py-3 bg-linear-to-r', pageCtx.color)}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <Bot size={16} className="text-white" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-white">Anne IA</p>
            <p className="text-[10px] text-white/70 flex items-center gap-1">
              <span>{pageCtx.icon}</span>
              <span>{pageCtx.label}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleReset}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Reiniciar conversa"
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{ maxHeight: '340px' }}>
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {isPending && (
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-linear-to-br from-crm-primary to-crm-secondary flex items-center justify-center shrink-0">
              <Bot size={12} className="text-white" />
            </div>
            <div className="bg-gray-50 border border-gray-100 px-3 py-2 rounded-xl rounded-tl-sm">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Suggestions */}
      {messages.length <= 1 && (
        <div className="px-3 py-2 border-t border-gray-100 flex gap-1.5 flex-wrap">
          {quickSuggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSend(s)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-crm-primary bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors truncate max-w-full"
            >
              <ChevronRight size={10} className="shrink-0" />
              <span className="truncate">{s}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-3 border-t border-gray-100 bg-gray-50/50">
        <div className="flex items-end gap-2 bg-white rounded-xl border border-gray-200 focus-within:border-crm-primary/50 focus-within:ring-2 focus-within:ring-crm-primary/10 transition-all px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Pergunte à Anne..."
            className="flex-1 text-sm bg-transparent outline-none text-gray-800 placeholder:text-gray-400 resize-none leading-relaxed"
            style={{ maxHeight: '100px' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isPending}
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all',
              input.trim() && !isPending
                ? 'bg-crm-primary text-white hover:bg-crm-secondary shadow-sm'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            )}
          >
            {isPending
              ? <Sparkles size={14} className="animate-spin" />
              : <Send size={14} />
            }
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5 text-center">
          Enter para enviar · Shift+Enter para nova linha
        </p>
      </div>
    </div>
  );
}
