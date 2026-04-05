'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Zap, Send, Mic, Bot, TrendingUp, Users, Target,
  BarChart2, ChevronRight, Loader2, BookOpen, Plus,
  CheckCircle, Eye, EyeOff, Save, Settings, AlertCircle,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';

/* ─── Tipos ──────────────────────────────────────────────────────────────── */

interface Mensagem {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/* ─── Constantes ─────────────────────────────────────────────────────────── */

const ACOES_RAPIDAS = [
  { label: 'Analisar campanhas',  prompt: 'Analise as campanhas ativas e me dê um resumo de performance com sugestões de otimização.' },
  { label: 'Criar campanha',      prompt: 'Preciso criar uma nova campanha. Me ajude a definir objetivo, público e copy.' },
  { label: 'Ver relatório',       prompt: 'Gere um relatório executivo das últimas campanhas com principais insights e próximos passos.' },
  { label: 'Otimizar copy',       prompt: 'Analise os copies dos anúncios atuais e sugira melhorias para aumentar CTR e conversão.' },
];

const BASE_CONHECIMENTO = [
  'Catálogo CJ Rasteirinhas 2024',
  'Histórico de campanhas Q1/2025',
  'Público-alvo: perfis revendedoras',
  'Playbook de tráfego pago',
];

/* ─── Componente ─────────────────────────────────────────────────────────── */

export default function JarvisPage() {
  const [mensagens, setMensagens]     = useState<Mensagem[]>([{
    role:      'assistant',
    content:   'Olá! Sou o **JARVIS**, motor de inteligência do VEXX CRM.\n\nPosso analisar campanhas, criar estratégias, gerar copies e identificar oportunidades. Como posso ajudar?',
    timestamp: new Date(),
  }]);
  const [input, setInput]             = useState('');
  const [carregando, setCarregando]   = useState(false);

  // Config do token
  const [apiKey, setApiKey]           = useState('');
  const [mostrarKey, setMostrarKey]   = useState(false);
  const [salvando, setSalvando]       = useState(false);
  const [savedOk, setSavedOk]         = useState(false);
  const [erroConfig, setErroConfig]   = useState('');
  const [keyConfigurada, setKeyConfigurada] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const { accessToken } = useAuthStore();

  useEffect(() => {
    // Verificar se já tem key configurada
    fetch('/api/jarvis/config', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(r => r.json())
      .then((d: { configurado?: boolean }) => setKeyConfigurada(d.configurado ?? false))
      .catch(() => {});
  }, [accessToken]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  async function salvarToken() {
    if (!apiKey.trim()) return;
    setSalvando(true);
    setErroConfig('');
    try {
      const res = await fetch('/api/jarvis/config', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body:    JSON.stringify({ anthropic_api_key: apiKey }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Erro ao salvar');
      setSavedOk(true);
      setKeyConfigurada(true);
      setApiKey('');
      setTimeout(() => setSavedOk(false), 3000);
    } catch (err) {
      setErroConfig(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  async function enviar(texto?: string) {
    const msg = (texto ?? input).trim();
    if (!msg || carregando) return;

    setMensagens(prev => [...prev, { role: 'user', content: msg, timestamp: new Date() }]);
    setInput('');
    setCarregando(true);

    try {
      const historico = mensagens.map(m => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/jarvis/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body:    JSON.stringify({ mensagem: msg, historico }),
      });
      const data = await res.json() as { resposta?: string; error?: string };
      setMensagens(prev => [...prev, {
        role:      'assistant',
        content:   data.resposta ?? data.error ?? 'Erro ao processar.',
        timestamp: new Date(),
      }]);
    } catch {
      setMensagens(prev => [...prev, {
        role: 'assistant', content: 'Falha de conexão. Tente novamente.', timestamp: new Date(),
      }]);
    } finally {
      setCarregando(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
  }

  function renderTexto(texto: string) {
    return texto.split('\n').map((linha, i, arr) => {
      const html = linha.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return (
        <span key={i}>
          <span dangerouslySetInnerHTML={{ __html: html }} />
          {i < arr.length - 1 && <br />}
        </span>
      );
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-txt-primary flex items-center gap-2">
          <Zap size={24} className="text-crm-primary" />
          Jarvis
        </h1>
        <p className="text-sm text-txt-secondary mt-1">
          Motor de inteligência central do VEXX CRM
        </p>
      </div>

      <div className="flex gap-5 items-start">

        {/* ── COLUNA ESQUERDA (30%) ────────────────────────────────────────── */}
        <div className="w-[30%] min-w-[240px] space-y-4">

          {/* Status */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Settings size={15} className="text-txt-secondary" />
              <span className="text-sm font-semibold text-txt-primary">Configuração</span>
            </div>

            <div className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg mb-4 text-xs font-medium',
              keyConfigurada
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-amber-50 border border-amber-200 text-amber-700',
            )}>
              {keyConfigurada
                ? <><CheckCircle size={13} /> Token Anthropic configurado</>
                : <><AlertCircle size={13} /> Token não configurado</>}
            </div>

            {/* Input do token */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-txt-secondary">
                Anthropic API Key
              </label>
              <div className="relative">
                <input
                  type={mostrarKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full px-3 py-2 pr-9 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
                />
                <button
                  onClick={() => setMostrarKey(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {mostrarKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              {erroConfig && (
                <p className="text-xs text-red-500">{erroConfig}</p>
              )}

              <button
                onClick={salvarToken}
                disabled={!apiKey.trim() || salvando}
                className="w-full flex items-center justify-center gap-1.5 py-2 bg-crm-primary text-white text-xs font-medium rounded-xl hover:bg-crm-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {salvando
                  ? <Loader2 size={13} className="animate-spin" />
                  : savedOk
                  ? <><CheckCircle size={13} /> Salvo!</>
                  : <><Save size={13} /> Salvar token</>}
              </button>

              <p className="text-[10px] text-txt-secondary">
                Obtenha sua key em{' '}
                <span className="font-mono text-crm-primary">console.anthropic.com</span>
              </p>
            </div>
          </Card>

          {/* Ações rápidas */}
          <Card className="p-4">
            <p className="text-xs font-semibold text-txt-secondary uppercase tracking-wide mb-3">
              Ações rápidas
            </p>
            <div className="space-y-1.5">
              {ACOES_RAPIDAS.map((acao) => (
                <button
                  key={acao.label}
                  onClick={() => enviar(acao.prompt)}
                  disabled={carregando || !keyConfigurada}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-100 hover:border-crm-primary/30 hover:bg-crm-primary/5 transition-all group disabled:opacity-40 disabled:cursor-not-allowed text-left"
                >
                  <span className="text-xs text-txt-secondary group-hover:text-crm-primary transition-colors">
                    {acao.label}
                  </span>
                  <ChevronRight size={12} className="text-gray-300 group-hover:text-crm-primary shrink-0" />
                </button>
              ))}
            </div>
          </Card>

          {/* Base de conhecimento */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-txt-secondary uppercase tracking-wide">
                Base de conhecimento
              </p>
              <button className="text-gray-400 hover:text-crm-primary transition-colors">
                <Plus size={14} />
              </button>
            </div>
            <div className="space-y-1.5">
              {BASE_CONHECIMENTO.map((doc) => (
                <div key={doc} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                  <BookOpen size={12} className="text-gray-400 shrink-0" />
                  <span className="text-xs text-txt-secondary truncate">{doc}</span>
                  <CheckCircle size={10} className="text-green-500 shrink-0 ml-auto" />
                </div>
              ))}
            </div>
            <button className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-gray-200 text-gray-400 hover:text-crm-primary hover:border-crm-primary/30 transition-all text-xs">
              <Plus size={12} /> Adicionar documento
            </button>
          </Card>
        </div>

        {/* ── COLUNA DIREITA — Chat (70%) ──────────────────────────────────── */}
        <Card className="flex-1 flex flex-col overflow-hidden h-[calc(100vh-200px)]">

          {/* Header do chat */}
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-crm-primary flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-sm text-txt-primary tracking-wide">JARVIS</p>
              <p className="text-[11px] text-txt-secondary">Motor de inteligência do VEXX</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <span className={cn(
                'w-2 h-2 rounded-full',
                keyConfigurada ? 'bg-green-400' : 'bg-amber-400',
              )} />
              <span className="text-xs text-txt-secondary">
                {keyConfigurada ? 'online' : 'configure o token'}
              </span>
            </div>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {mensagens.map((msg, i) => (
              <div key={i} className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                <div className={cn(
                  'w-7 h-7 rounded-xl shrink-0 flex items-center justify-center mt-0.5',
                  msg.role === 'assistant' ? 'bg-crm-primary/10' : 'bg-crm-primary',
                )}>
                  {msg.role === 'assistant'
                    ? <Zap size={13} className="text-crm-primary" />
                    : <Bot size={13} className="text-white" />}
                </div>
                <div className={cn(
                  'max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed',
                  msg.role === 'assistant'
                    ? 'bg-gray-50 text-txt-primary border border-gray-100 rounded-tl-sm'
                    : 'bg-crm-primary text-white rounded-tr-sm',
                )}>
                  {renderTexto(msg.content)}
                  <p className={cn(
                    'text-[10px] mt-1.5',
                    msg.role === 'assistant' ? 'text-txt-secondary' : 'text-white/60',
                  )}>
                    {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}

            {carregando && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-xl bg-crm-primary/10 flex items-center justify-center shrink-0">
                  <Zap size={13} className="text-crm-primary" />
                </div>
                <div className="px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl rounded-tl-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-5 py-4 border-t border-gray-100 shrink-0">
            {!keyConfigurada && (
              <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 flex items-center gap-2">
                <AlertCircle size={13} />
                Configure o token Anthropic no painel ao lado para usar o Jarvis.
              </div>
            )}
            <div className="flex items-end gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 focus-within:border-crm-primary/40 focus-within:bg-white transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!keyConfigurada}
                placeholder={keyConfigurada ? 'Fale com o Jarvis... (Enter para enviar)' : 'Configure o token primeiro'}
                rows={1}
                className="flex-1 bg-transparent text-txt-primary placeholder-gray-400 text-sm resize-none focus:outline-none min-h-[24px] max-h-[120px] disabled:cursor-not-allowed"
                onInput={e => {
                  const t = e.currentTarget;
                  t.style.height = 'auto';
                  t.style.height = `${t.scrollHeight}px`;
                }}
              />
              <div className="flex items-center gap-2 shrink-0">
                <button className="text-gray-300 hover:text-gray-500 transition-colors" title="Voz (em breve)">
                  <Mic size={18} />
                </button>
                <button
                  onClick={() => enviar()}
                  disabled={!input.trim() || carregando || !keyConfigurada}
                  className="w-8 h-8 rounded-xl bg-crm-primary hover:bg-crm-primary/90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                >
                  {carregando
                    ? <Loader2 size={14} className="text-white animate-spin" />
                    : <Send size={14} className="text-white" />}
                </button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
