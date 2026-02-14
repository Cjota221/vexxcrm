'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Brain,
  Sparkles,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Bot,
  Send,
  X,
  Minimize2,
  Maximize2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  useIntelligenceOverview,
  useRFMDistribution,
  useCalculateRFM,
} from '@/hooks/useIntelligence';
import { useAnne } from '@/hooks/useAnne';
import { RFMOverview } from '@/components/intelligence/RFMOverview';
import { SegmentGrid } from '@/components/intelligence/SegmentGrid';
import { RFMChart } from '@/components/intelligence/RFMChart';
import { AIAlerts } from '@/components/intelligence/AIAlerts';
import { CalculateRFMButton } from '@/components/intelligence/CalculateRFMButton';
import { SeasonalInsights } from '@/components/intelligence/SeasonalInsights';
import { ProductTrends } from '@/components/intelligence/ProductTrends';
import type { ClientListItem } from '@/components/intelligence/ClientListDrawer';
import { cn } from '@/lib/utils';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Chat Message type
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/**
 * Intelligence Dashboard — Painel completo de IA comportamental.
 * RFM Engine, Segmentação, Alertas, Predições.
 */
export default function IntelligencePage() {
  const router = useRouter();
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // ── Anne Chat State ──
  const [anneOpen, setAnneOpen] = useState(false);
  const [anneMinimized, setAnneMinimized] = useState(false);
  const [anneInput, setAnneInput] = useState('');
  const [anneMessages, setAnneMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Olá! Sou a Anne, sua assistente de IA. 🤖\n\nSelecione clientes em qualquer segmento ou evento sazonal e me envie — vou sugerir estratégias de reativação, upsell e recuperação personalizadas!',
      timestamp: new Date(),
    },
  ]);
  const anneMessagesEndRef = useRef<HTMLDivElement>(null);
  const { sendMessage: anneSendMessage, isLoading: anneIsPending } = useAnne();

  useEffect(() => {
    anneMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [anneMessages]);

  // Callback quando clientes são selecionados e enviados à Anne
  const handleAskAnne = useCallback((clients: ClientListItem[], context: string) => {
    setAnneOpen(true);
    setAnneMinimized(false);

    // Montar prompt com dados dos clientes
    const clientsSummary = clients.slice(0, 10).map(c => {
      const parts = [`• ${c.name || 'Sem nome'}`];
      if (c.phone) parts.push(`Tel: ${c.phone}`);
      if (c.total_orders) parts.push(`${c.total_orders} pedidos`);
      if (c.total_spent) parts.push(`R$ ${c.total_spent.toFixed(2)} gasto`);
      if (c.last_order_at) parts.push(`Último: ${new Date(c.last_order_at).toLocaleDateString('pt-BR')}`);
      if (c.rfm_segment) parts.push(`Segmento: ${c.rfm_segment}`);
      if (c.churn_probability) parts.push(`Churn: ${c.churn_probability}%`);
      return parts.join(' | ');
    }).join('\n');

    const moreText = clients.length > 10 ? `\n... e mais ${clients.length - 10} clientes` : '';

    const autoMessage = `Preciso de sugestões para estes ${clients.length} clientes do grupo "${context}":\n\n${clientsSummary}${moreText}\n\nO que devo fazer para recuperar/engajar esses clientes? Quais ações, mensagens e ofertas você sugere?`;

    // Adicionar como mensagem do usuário
    const userMsg: ChatMessage = {
      role: 'user',
      content: autoMessage,
      timestamp: new Date(),
    };
    setAnneMessages(prev => [...prev, userMsg]);

    // Enviar para a Anne
    const chatHistory = anneMessages
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    anneSendMessage({
      message: autoMessage,
      context: { chat_history: chatHistory },
    }).then(data => {
      setAnneMessages(prev => [...prev, {
        role: 'assistant',
        content: data?.reply || 'Desculpe, não consegui processar.',
        timestamp: new Date(),
      }]);
    }).catch(() => {
      setAnneMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Ops, ocorreu um erro. Tente novamente.',
        timestamp: new Date(),
      }]);
    });
  }, [anneMessages, anneSendMessage]);

  // Handler de envio manual de mensagem
  const handleAnneSend = async () => {
    if (!anneInput.trim() || anneIsPending) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: anneInput.trim(),
      timestamp: new Date(),
    };
    setAnneMessages(prev => [...prev, userMsg]);
    const text = anneInput.trim();
    setAnneInput('');

    try {
      const chatHistory = anneMessages
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));

      const data = await anneSendMessage({
        message: text,
        context: { chat_history: chatHistory },
      });
      setAnneMessages(prev => [...prev, {
        role: 'assistant',
        content: data?.reply || 'Desculpe, não consegui processar.',
        timestamp: new Date(),
      }]);
    } catch {
      setAnneMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Ops, ocorreu um erro. Tente novamente.',
        timestamp: new Date(),
      }]);
    }
  };

  // Verificar autenticação
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
      }
    };
    checkAuth();
  }, [router]);

  // Dados
  const {
    data: overview,
    isLoading: isLoadingOverview,
    error: overviewError,
    refetch: refetchOverview,
  } = useIntelligenceOverview();

  const {
    data: rfmData,
    isLoading: isLoadingRFM,
    refetch: refetchRFM,
  } = useRFMDistribution();

  const calculateRFM = useCalculateRFM();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [lastReport, setLastReport] = useState<any>(null);

  // Handler do cálculo RFM
  const handleCalculateRFM = async () => {
    try {
      setNotification(null);
      const result = await calculateRFM.mutateAsync();
      if (result?.report) {
        setLastReport(result.report);
        setNotification({
          type: 'success',
          message: `✅ RFM calculado! ${result.report.stats.total_processed} clientes processados, ${result.report.stats.segment_changes} mudanças de segmento.`,
        });
      }
      // Refetch dados
      refetchOverview();
      refetchRFM();
    } catch (error) {
      setNotification({
        type: 'error',
        message: `❌ Erro ao calcular RFM: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      });
    }
  };

  // Loading state
  const isLoading = isLoadingOverview || isLoadingRFM;

  // Extract overview data
  const ov = overview?.overview;
  const kpis = ov?.kpis || {
    vip_count: 0,
    risk_count: 0,
    attention_count: 0,
    upsell_count: 0,
    avg_churn_probability: 0,
    avg_purchase_prob_30d: 0,
    total_ltv_projected_12m: 0,
    avg_sentiment: 0,
  };
  const rfmDistribution = ov?.rfm?.distribution || {};
  const totalCalculated = ov?.rfm?.total_calculated || 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalClients = (ov?.rfm as any)?.total_clients || 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coveragePct = (ov?.rfm as any)?.coverage_pct || 0;
  const lastCalculatedAt = ov?.rfm?.last_calculated_at || null;
  const events7d = ov?.events?.total_7d || 0;

  // Distribution com dados detalhados do endpoint /rfm
  const detailedDistribution = rfmData?.distribution || {};

  return (
    <div className="min-h-screen bg-surface-bg">
      {/* ─── HEADER ─── */}
      <div className="bg-white border-b border-surface-border px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
              <Brain size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-txt-primary flex items-center gap-2">
                Inteligência Artificial
                <Sparkles size={18} className="text-yellow-500" />
              </h1>
              <p className="text-sm text-txt-muted">
                Motor RFM, segmentação comportamental e predições de IA
              </p>
            </div>
          </div>

          {/* Botão de refresh */}
          <button
            onClick={() => { refetchOverview(); refetchRFM(); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-surface-border text-sm text-txt-secondary hover:bg-surface-50 transition-colors"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {/* ─── NOTIFICAÇÃO ─── */}
      {notification && (
        <div className={`mx-6 mt-4 p-4 rounded-xl flex items-center gap-3 ${
          notification.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle2 size={18} className="text-green-600 shrink-0" />
          ) : (
            <AlertCircle size={18} className="text-red-600 shrink-0" />
          )}
          <p className="text-sm">{notification.message}</p>
          <button
            onClick={() => setNotification(null)}
            className="ml-auto text-sm font-medium hover:underline"
          >
            Fechar
          </button>
        </div>
      )}

      {/* ─── CONTEÚDO ─── */}
      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={40} className="animate-spin text-crm-primary mb-4" />
            <p className="text-sm text-txt-muted">Carregando inteligência artificial...</p>
          </div>
        ) : overviewError ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
            <AlertCircle size={40} className="text-red-400 mx-auto mb-4" />
            <h3 className="text-base font-semibold text-red-800 mb-2">Erro ao carregar dados</h3>
            <p className="text-sm text-red-600">{overviewError instanceof Error ? overviewError.message : 'Erro desconhecido'}</p>
            <button
              onClick={() => refetchOverview()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
            {/* Linha 1: KPIs + Calcular */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <RFMOverview
                  kpis={kpis}
                  totalCalculated={totalCalculated}
                  totalClients={totalClients}
                  coveragePct={coveragePct}
                  lastCalculatedAt={lastCalculatedAt}
                  events7d={events7d}
                />
              </div>
              <div>
                <CalculateRFMButton
                  onCalculate={handleCalculateRFM}
                  isCalculating={calculateRFM.isPending}
                  lastReport={lastReport}
                />
              </div>
            </div>

            {/* Linha 2: Gráfico de distribuição + Alertas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RFMChart distribution={rfmDistribution} />
              <AIAlerts alerts={[]} kpis={kpis} />
            </div>

            {/* Linha 3: Grid completo de segmentos */}
            <SegmentGrid
              distribution={detailedDistribution}
              totalClients={totalCalculated}
              onAskAnne={handleAskAnne}
            />

            {/* Linha 4: Inteligência v2 — Sazonalidade + Produto */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SeasonalInsights onAskAnne={handleAskAnne} />
              <ProductTrends />
            </div>

            {/* Linha 5: Nota sobre estado */}
            {totalCalculated === 0 && (
              <div className="bg-violet-50 border border-violet-200 rounded-2xl p-8 text-center">
                <Brain size={48} className="text-violet-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-violet-800 mb-2">
                  Nenhum cálculo RFM realizado
                </h3>
                <p className="text-sm text-violet-600 max-w-md mx-auto mb-4">
                  Clique em &quot;Calcular RFM Agora&quot; para analisar todos os seus clientes
                  e gerar segmentação inteligente, predições de churn e oportunidades de upsell.
                </p>
                <p className="text-xs text-violet-500">
                  O cálculo usa dados de pedidos sincronizados da FacilZap para determinar
                  Recência, Frequência e Valor Monetário de cada cliente.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══ CHAT FLUTUANTE DA ANNE ═══ */}
      {!anneOpen ? (
        <button
          onClick={() => setAnneOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-linear-to-br from-crm-primary to-crm-secondary text-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform group"
          title="Abrir Anne IA"
        >
          <Bot size={24} />
          <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
            <Sparkles size={10} className="text-white" />
          </span>
        </button>
      ) : (
        <div
          className={cn(
            'fixed bottom-6 right-6 z-50',
            'bg-white rounded-2xl shadow-2xl border border-surface-200',
            'flex flex-col overflow-hidden transition-all duration-300',
            anneMinimized ? 'w-80 h-14' : 'w-105 h-137.5'
          )}
        >
          {/* Header do Chat */}
          <div className="h-14 bg-linear-to-r from-crm-primary to-crm-secondary text-white flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-2">
              <Bot size={18} />
              <div>
                <span className="font-semibold text-sm">Anne IA</span>
                {anneIsPending && (
                  <span className="ml-2 text-[10px] text-white/70 animate-pulse">pensando...</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setAnneMinimized(!anneMinimized)}
                className="p-1.5 hover:bg-white/20 rounded transition-colors"
              >
                {anneMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
              </button>
              <button
                onClick={() => setAnneOpen(false)}
                className="p-1.5 hover:bg-white/20 rounded transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {!anneMinimized && (
            <>
              {/* Mensagens */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {anneMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap',
                      msg.role === 'user'
                        ? 'ml-auto bg-crm-primary text-white rounded-br-sm'
                        : 'bg-surface-100 text-txt-primary rounded-bl-sm'
                    )}
                  >
                    {msg.content}
                  </div>
                ))}
                {anneIsPending && (
                  <div className="max-w-[85%] bg-surface-100 rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm text-txt-secondary">
                    <span className="flex items-center gap-1.5">
                      <Bot size={14} className="animate-pulse" />
                      Analisando clientes...
                    </span>
                  </div>
                )}
                <div ref={anneMessagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-surface-200 p-3 flex gap-2 shrink-0">
                <input
                  value={anneInput}
                  onChange={(e) => setAnneInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAnneSend()}
                  placeholder="Pergunte à Anne..."
                  className="flex-1 text-sm bg-surface-50 border border-surface-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crm-primary/30 focus:border-crm-primary transition-all"
                  disabled={anneIsPending}
                />
                <button
                  onClick={handleAnneSend}
                  disabled={!anneInput.trim() || anneIsPending}
                  className="w-9 h-9 rounded-xl bg-crm-primary text-white flex items-center justify-center hover:bg-crm-primary/90 disabled:opacity-50 transition-colors"
                >
                  <Send size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
