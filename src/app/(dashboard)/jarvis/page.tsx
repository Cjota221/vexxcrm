'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Zap, Send, Mic, Bot, TrendingUp, Users, Target,
  BarChart2, Plus, FileText, ChevronRight, Loader2,
  CheckCircle, AlertCircle, BookOpen,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

/* ─── Tipos ──────────────────────────────────────────────────────────────── */

interface Mensagem {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface MetricaRapida {
  label: string;
  valor: string;
  icon: React.ElementType;
  cor: string;
}

/* ─── Métricas fictícias (serão integradas em versão futura) ──────────────── */

const METRICAS: MetricaRapida[] = [
  { label: 'Campanhas ativas',  valor: '—', icon: Target,    cor: 'text-blue-400' },
  { label: 'Leads hoje',        valor: '—', icon: Users,     cor: 'text-green-400' },
  { label: 'ROAS médio',        valor: '—', icon: TrendingUp, cor: 'text-purple-400' },
  { label: 'Gasto hoje',        valor: '—', icon: BarChart2, cor: 'text-amber-400' },
];

const ACOES_RAPIDAS = [
  { label: 'Analisar campanhas', prompt: 'Analise as campanhas ativas e me dê um resumo de performance com sugestões de otimização.' },
  { label: 'Criar campanha',     prompt: 'Preciso criar uma nova campanha. Me ajude a definir objetivo, público e copy.' },
  { label: 'Ver relatório',      prompt: 'Gere um relatório executivo das últimas campanhas com principais insights e próximos passos.' },
  { label: 'Otimizar copy',      prompt: 'Analise os copies dos anúncios atuais e sugira melhorias para aumentar CTR e conversão.' },
];

const BASE_CONHECIMENTO = [
  'Catálogo CJ Rasteirinhas 2024',
  'Histórico de campanhas Q1/2025',
  'Público-alvo: perfis revendedoras',
  'Playbook de tráfego pago',
];

/* ─── Componente ─────────────────────────────────────────────────────────── */

export default function JarvisPage() {
  const [mensagens, setMensagens]   = useState<Mensagem[]>([
    {
      role: 'assistant',
      content: 'Online e pronto para operar. Sou o **JARVIS** — motor de inteligência do VEXX CRM.\n\nPosso analisar suas campanhas, criar estratégias, gerar copies e identificar oportunidades. Como posso ajudar?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput]           = useState('');
  const [carregando, setCarregando] = useState(false);
  const messagesEndRef              = useRef<HTMLDivElement>(null);
  const inputRef                    = useRef<HTMLTextAreaElement>(null);
  const { accessToken }             = useAuthStore();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  async function enviar(texto?: string) {
    const msg = (texto ?? input).trim();
    if (!msg || carregando) return;

    const novaMensagem: Mensagem = { role: 'user', content: msg, timestamp: new Date() };
    setMensagens(prev => [...prev, novaMensagem]);
    setInput('');
    setCarregando(true);

    try {
      const historico = mensagens.map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/jarvis/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ mensagem: msg, historico }),
      });

      const data = await res.json() as { resposta?: string; error?: string };

      const resposta: Mensagem = {
        role:      'assistant',
        content:   data.resposta ?? data.error ?? 'Erro ao processar resposta.',
        timestamp: new Date(),
      };
      setMensagens(prev => [...prev, resposta]);
    } catch {
      setMensagens(prev => [...prev, {
        role:      'assistant',
        content:   'Falha de conexão. Tente novamente.',
        timestamp: new Date(),
      }]);
    } finally {
      setCarregando(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  }

  /* ── Renderização de texto com markdown básico ──────────────────────────── */
  function renderTexto(texto: string) {
    return texto.split('\n').map((linha, i) => {
      const bold = linha.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return (
        <span key={i}>
          <span dangerouslySetInnerHTML={{ __html: bold }} />
          {i < texto.split('\n').length - 1 && <br />}
        </span>
      );
    });
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0 bg-[#0d1117] overflow-hidden">

      {/* ── COLUNA ESQUERDA — Painel de controle (30%) ────────────────────── */}
      <div className="w-[30%] min-w-[260px] max-w-[360px] flex flex-col border-r border-white/10 overflow-y-auto">

        {/* Header */}
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-[#1e3a5f] flex items-center justify-center">
              <Zap size={18} className="text-blue-300" />
            </div>
            <div>
              <p className="text-white font-bold text-sm tracking-wide">JARVIS</p>
              <p className="text-[11px] text-white/40">Motor de inteligência</p>
            </div>
          </div>
          {/* Status */}
          <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400 font-medium">Sistema online</span>
          </div>
        </div>

        {/* Métricas rápidas */}
        <div className="px-4 py-4 border-b border-white/10">
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-3">Métricas rápidas</p>
          <div className="grid grid-cols-2 gap-2">
            {METRICAS.map((m) => {
              const Icon = m.icon;
              return (
                <div key={m.label} className="bg-white/5 rounded-xl p-3 border border-white/5">
                  <Icon size={14} className={cn(m.cor, 'mb-1.5')} />
                  <p className="text-white font-semibold text-sm">{m.valor}</p>
                  <p className="text-white/40 text-[10px] mt-0.5">{m.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ações rápidas */}
        <div className="px-4 py-4 border-b border-white/10">
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-3">Ações rápidas</p>
          <div className="space-y-1.5">
            {ACOES_RAPIDAS.map((acao) => (
              <button
                key={acao.label}
                onClick={() => enviar(acao.prompt)}
                disabled={carregando}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/15 transition-all group disabled:opacity-40"
              >
                <span className="text-xs text-white/70 group-hover:text-white transition-colors">{acao.label}</span>
                <ChevronRight size={12} className="text-white/30 group-hover:text-white/60 shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Base de conhecimento */}
        <div className="px-4 py-4 flex-1">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Base de conhecimento</p>
            <button className="text-white/30 hover:text-white/60 transition-colors">
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-1.5">
            {BASE_CONHECIMENTO.map((doc) => (
              <div key={doc} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/5">
                <BookOpen size={12} className="text-white/30 shrink-0" />
                <span className="text-xs text-white/50 truncate">{doc}</span>
                <CheckCircle size={10} className="text-green-400/60 shrink-0 ml-auto" />
              </div>
            ))}
          </div>
          <button className="w-full mt-3 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-white/15 text-white/30 hover:text-white/50 hover:border-white/25 transition-all text-xs">
            <Plus size={12} />
            Adicionar documento
          </button>
        </div>
      </div>

      {/* ── COLUNA DIREITA — Chat (70%) ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header do chat */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-[#1e3a5f] flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm tracking-widest">JARVIS</p>
            <p className="text-[11px] text-white/40">Motor de inteligência do VEXX</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-xs text-white/40">online</span>
          </div>
        </div>

        {/* Mensagens */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {mensagens.map((msg, i) => (
            <div
              key={i}
              className={cn(
                'flex gap-3',
                msg.role === 'user' ? 'flex-row-reverse' : 'flex-row',
              )}
            >
              {/* Avatar */}
              <div className={cn(
                'w-7 h-7 rounded-lg shrink-0 flex items-center justify-center mt-0.5',
                msg.role === 'assistant' ? 'bg-[#1c2333] border border-white/10' : 'bg-[#1e3a5f]',
              )}>
                {msg.role === 'assistant'
                  ? <Zap size={13} className="text-blue-300" />
                  : <Bot size={13} className="text-white" />}
              </div>

              {/* Balão */}
              <div className={cn(
                'max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed',
                msg.role === 'assistant'
                  ? 'bg-[#1c2333] text-white/90 rounded-tl-sm border border-white/5'
                  : 'bg-[#1e3a5f] text-white rounded-tr-sm',
              )}>
                {renderTexto(msg.content)}
                <p className={cn(
                  'text-[10px] mt-1.5',
                  msg.role === 'assistant' ? 'text-white/25' : 'text-white/35',
                )}>
                  {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}

          {/* Indicador de digitação */}
          {carregando && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-[#1c2333] border border-white/10 flex items-center justify-center shrink-0">
                <Zap size={13} className="text-blue-300" />
              </div>
              <div className="px-4 py-3 bg-[#1c2333] border border-white/5 rounded-2xl rounded-tl-sm">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-white/10 shrink-0">
          <div className="flex items-end gap-3 bg-[#1c2333] border border-white/10 rounded-2xl px-4 py-3 focus-within:border-[#1e3a5f]/60 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Fale com o Jarvis... (Enter para enviar)"
              rows={1}
              className="flex-1 bg-transparent text-white/90 placeholder-white/20 text-sm resize-none focus:outline-none min-h-[24px] max-h-[120px]"
              style={{ height: 'auto' }}
              onInput={e => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = `${t.scrollHeight}px`;
              }}
            />
            <div className="flex items-center gap-2 shrink-0">
              <button
                className="text-white/20 hover:text-white/50 transition-colors"
                title="Enviar por voz (em breve)"
              >
                <Mic size={18} />
              </button>
              <button
                onClick={() => enviar()}
                disabled={!input.trim() || carregando}
                className="w-8 h-8 rounded-xl bg-[#1e3a5f] hover:bg-[#16304f] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              >
                {carregando
                  ? <Loader2 size={14} className="text-white animate-spin" />
                  : <Send size={14} className="text-white" />}
              </button>
            </div>
          </div>
          <p className="text-center text-[10px] text-white/15 mt-2">
            JARVIS pode cometer erros. Verifique informações críticas antes de agir.
          </p>
        </div>
      </div>
    </div>
  );
}
