'use client';

/**
 * TodayInHistory — "Hoje na História"
 *
 * Card que mostra clientes que compraram nesta mesma data (dia/mês) em anos anteriores.
 * Fonte de oportunidades de reativação com contexto emocional.
 * 
 * Botão WhatsApp: abre modal interno com sugestão de mensagem da Anne — sem link externo.
 */

import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, ChevronDown, ChevronRight, Star, MessageCircle, Loader2, CalendarDays, Repeat2, Send, X, Bot } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import { VariablePicker, BASIC_VARIABLES } from '@/components/ui/VariablePicker';

/* ─── Tipos ───────────────────────────────────── */

interface HistoricalClient {
  client_id: string;
  name: string;
  phone: string;
  status: string;
  order_number: string;
  total: number;
  created_at: string;
}

interface HistoricalYear {
  year: number;
  total_orders: number;
  total_revenue: number;
  clients: HistoricalClient[];
}

interface LoyalClient {
  client_id: string;
  name: string;
  phone: string;
  years_count: number;
}

interface HistoricalSalesData {
  date: { day: number; month: number; month_name: string; label: string };
  years: HistoricalYear[];
  total_unique_clients: number;
  total_historic_orders: number;
  loyal_clients: LoyalClient[];
  same_day_other_months: Array<{
    year: number;
    month: number;
    month_name: string;
    orders: number;
    revenue: number;
    top_clients: Array<{ name: string; phone: string; total: number }>;
  }>;
  comparison: {
    today: { orders: number; revenue: number };
    prev_month_same_day: { year: number; month: number; month_name: string; orders: number; revenue: number } | null;
    same_month_prev_year: { year: number; month: number; month_name: string; orders: number; revenue: number } | null;
  } | null;
}

/* ─── Componente ──────────────────────────────── */

export function TodayInHistory() {
  const [expanded, setExpanded] = useState(false);
  const [expandedYear, setExpandedYear] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'years' | 'months'>('years');

  // Modal de envio direto
  const [sendModal, setSendModal] = useState<{
    client: HistoricalClient;
    yearLabel: string;
  } | null>(null);
  const [sendMsg, setSendMsg] = useState('');
  const sendMsgRef = useRef<HTMLTextAreaElement>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const openSendModal = (client: HistoricalClient, yearLabel: string) => {
    const defaultMsg = `Olá, ${client.name.split(' ')[0]}! 👋 Lembrei que você comprou conosco nesta mesma época e queria te dar uma oferta especial de retorno. Posso te ajudar?`;
    setSendMsg(defaultMsg);
    setSendResult(null);
    setSendModal({ client, yearLabel });
  };

  const handleSend = async () => {
    if (!sendModal || !sendMsg.trim()) return;
    setIsSending(true);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: sendModal.client.phone, content: sendMsg, type: 'text', clientId: sendModal.client.client_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');
      setSendResult('✅ Mensagem enviada com sucesso!');
    } catch (err) {
      setSendResult(`❌ ${err instanceof Error ? err.message : 'Erro ao enviar'}`);
    } finally {
      setIsSending(false);
    }
  };

  const { data, isLoading, isError } = useQuery<HistoricalSalesData>({
    queryKey: ['today-in-history'],
    queryFn: async () => {
      const res = await api.get<HistoricalSalesData>('/api/intelligence/historical-sales');
      return res.data;
    },
    staleTime: 10 * 60_000,
  });

  const MONTHS = [
    '', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
  ];

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center justify-center gap-3 min-h-40">
        <Loader2 size={20} className="animate-spin text-crm-primary" />
        <span className="text-sm text-gray-400">Carregando histórico...</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
        <History size={24} className="text-gray-200 mx-auto mb-2" />
        <p className="text-sm text-gray-400">Não foi possível carregar o histórico.</p>
      </div>
    );
  }

  const noHistory = data.years.length === 0;
  const monthLabel = MONTHS[data.date.month] ?? '';
  const sameDayMonths = data.same_day_other_months ?? [];

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Header — clicável para expandir/colapsar */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full px-5 py-4 bg-linear-to-r from-violet-600 to-purple-700 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <History size={18} className="text-white" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-bold text-white">Hoje na História</h3>
              <p className="text-[11px] text-white/70">
                Dia {data.date.day} · anos e meses anteriores
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xl font-black text-white">{data.total_historic_orders}</p>
              <p className="text-[10px] text-white/60">pedidos históricos</p>
            </div>
            <ChevronDown
              size={18}
              className={cn('text-white/70 transition-transform duration-200', expanded && 'rotate-180')}
            />
          </div>
        </button>

        {expanded && (
        <div className="p-5 space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 text-center">
              <p className="text-[10px] text-violet-500 uppercase tracking-wide mb-0.5">Clientes únicos</p>
              <p className="text-lg font-black text-violet-700">{data.total_unique_clients}</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
              <p className="text-[10px] text-amber-600 uppercase tracking-wide mb-0.5">Clientes fiéis</p>
              <p className="text-lg font-black text-amber-700">{data.loyal_clients.length}</p>
              <p className="text-[9px] text-amber-500">2+ anos nesta data</p>
            </div>
          </div>

          {/* Clientes fiéis */}
          {data.loyal_clients.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Star size={10} className="text-amber-500" /> Fiéis a esta data
              </p>
              <div className="space-y-2">
                {data.loyal_clients.map(c => (
                  <div key={c.client_id} className="flex items-center gap-3 bg-amber-50/60 border border-amber-100 rounded-xl px-3 py-2.5">
                    <div className="w-7 h-7 rounded-full bg-amber-200 flex items-center justify-center shrink-0">
                      <Repeat2 size={12} className="text-amber-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{c.name}</p>
                      <p className="text-[10px] text-gray-400">{c.phone}</p>
                    </div>
                    <span className="text-[10px] font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg shrink-0">
                      {c.years_count}x
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Abas: Anos anteriores vs Outros meses */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setActiveTab('years')}
              className={cn(
                'flex-1 text-[11px] font-semibold py-1.5 rounded-lg transition-all',
                activeTab === 'years' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              📅 Anos anteriores ({data.years.length})
            </button>
            <button
              onClick={() => setActiveTab('months')}
              className={cn(
                'flex-1 text-[11px] font-semibold py-1.5 rounded-lg transition-all',
                activeTab === 'months' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              🗓 Outros meses ({sameDayMonths.length})
            </button>
          </div>

          {/* Aba: Histórico por ano */}
          {activeTab === 'years' && (
            <>
          {noHistory ? (
            <div className="flex flex-col items-center py-8 text-center">
              <CalendarDays size={32} className="text-gray-200 mb-2" />
              <p className="text-sm font-medium text-gray-400">Nenhum pedido nesta data em anos anteriores</p>
              <p className="text-xs text-gray-300 mt-1">O histórico aparecerá aqui conforme os clientes repetirem compras.</p>
            </div>
          ) : (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <CalendarDays size={10} className="text-gray-400" /> Dia {data.date.day} de {monthLabel} em anos anteriores
              </p>
              <div className="space-y-2">
                {data.years.map(yr => (
                  <div key={yr.year} className="border border-gray-100 rounded-xl overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
                      onClick={() => setExpandedYear(expandedYear === yr.year ? null : yr.year)}
                    >
                      <div className="flex items-center gap-2">
                        {expandedYear === yr.year
                          ? <ChevronDown size={12} className="text-gray-400" />
                          : <ChevronRight size={12} className="text-gray-400" />
                        }
                        <span className="text-xs font-bold text-gray-700">{yr.year}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-gray-400">{yr.total_orders} pedidos</span>
                        <span className="text-[10px] font-bold text-gray-600">{formatCurrency(yr.total_revenue)}</span>
                      </div>
                    </button>

                    {expandedYear === yr.year && (
                      <div className="divide-y divide-gray-50">
                        {yr.clients.map((c, i) => (
                          <div key={i} className="flex items-center gap-2.5 px-3 py-2 bg-white">
                            <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                              <span className="text-[9px] font-bold text-violet-600">
                                {(c.name ?? '?')[0].toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-semibold text-gray-800 truncate">{c.name}</p>
                              <p className="text-[9px] text-gray-400">Pedido #{c.order_number}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[11px] font-bold text-gray-700">{formatCurrency(c.total)}</p>
                              {c.phone && (
                                <button
                                  onClick={() => openSendModal(c, String(yr.year))}
                                  className={cn(
                                    'inline-flex items-center gap-0.5 text-[9px] text-green-600',
                                    'hover:text-green-700 transition-colors'
                                  )}
                                >
                                  <MessageCircle size={8} /> Msg
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
            </>
          )}

          {/* Aba: Mesmo dia em outros meses */}
          {activeTab === 'months' && (
            <div className="space-y-2">
              {sameDayMonths.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <CalendarDays size={32} className="text-gray-200 mb-2" />
                  <p className="text-sm font-medium text-gray-400">Nenhum pedido no dia {data.date.day} em outros meses</p>
                </div>
              ) : (
                <>
                  <p className="text-[10px] text-gray-400 mb-3">
                    Pedidos registrados no dia <strong>{data.date.day}</strong> em outros meses (anos anteriores)
                  </p>
                  {sameDayMonths.map((entry, i) => (
                    <div key={i} className="border border-gray-100 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50">
                        <div className="flex items-center gap-2">
                          <CalendarDays size={12} className="text-violet-400" />
                          <span className="text-xs font-bold text-gray-700">
                            {entry.month_name} / {entry.year}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-gray-400">{entry.orders} pedidos</span>
                          <span className="text-[10px] font-bold text-gray-600">{formatCurrency(entry.revenue)}</span>
                        </div>
                      </div>
                      {entry.top_clients.length > 0 && (
                        <div className="divide-y divide-gray-50">
                          {entry.top_clients.map((c, j) => (
                            <div key={j} className="flex items-center justify-between px-3 py-2 bg-white">
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                                  <span className="text-[8px] font-bold text-violet-600">
                                    {(c.name ?? '?')[0].toUpperCase()}
                                  </span>
                                </div>
                                <p className="text-[11px] font-medium text-gray-700 truncate max-w-30">{c.name}</p>
                              </div>
                              <span className="text-[11px] font-bold text-gray-600">{formatCurrency(c.total)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

        </div>
        )}
      </div>

      {/* ── Modal de Envio Direto ─────────────────────── */}
      {sendModal && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-60 backdrop-blur-sm"
            onClick={() => setSendModal(null)}
          />
          <div className="fixed inset-0 z-61 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="px-5 py-4 bg-linear-to-r from-green-600 to-emerald-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                    <MessageCircle size={16} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Enviar Mensagem</h3>
                    <p className="text-[11px] text-white/70">
                      {sendModal.client.name} · comprou em {sendModal.yearLabel}
                    </p>
                  </div>
                </div>
                <button onClick={() => setSendModal(null)} className="p-1.5 hover:bg-white/20 rounded-lg">
                  <X size={16} className="text-white" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex items-start gap-2 p-3 bg-violet-50 border border-violet-100 rounded-xl">
                  <Bot size={16} className="text-violet-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-violet-700">
                    Anne sugere mencionar a compra anterior para criar contexto emocional e aumentar a taxa de resposta.
                  </p>
                </div>

                <textarea
                  ref={sendMsgRef}
                  rows={5}
                  className="w-full text-sm border border-gray-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-green-500/30"
                  value={sendMsg}
                  onChange={(e) => setSendMsg(e.target.value)}
                />
                <VariablePicker
                  textareaRef={sendMsgRef}
                  value={sendMsg}
                  onChange={setSendMsg}
                  variables={BASIC_VARIABLES}
                />

                {sendResult && (
                  <div className={`p-3 rounded-xl text-sm font-medium ${sendResult.startsWith('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {sendResult}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setSendModal(null)}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50"
                  >
                    Fechar
                  </button>
                  {!sendResult?.startsWith('✅') && (
                    <button
                      onClick={handleSend}
                      disabled={isSending || !sendMsg.trim()}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      {isSending ? 'Enviando...' : 'Enviar'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}