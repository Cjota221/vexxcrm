'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot, Save, Loader2, ToggleLeft, ToggleRight, Clock, Send, Zap,
  ChevronDown, ChevronRight, Play, MessageSquare, CheckCircle2,
  AlertTriangle, RefreshCw, Info, Sparkles, Settings,
  Users, Activity, ShieldAlert, BookOpen, Circle,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn, formatRelativeTime } from '@/lib/utils';

/* ─── Types ─────────────────────────────────────────────────── */
interface AnneAutomation {
  id: string;
  rule_key: string;
  name: string;
  description: string;
  enabled: boolean;
  delay_minutes: number;
  send_mode: 'auto' | 'suggest';
  message_template: string;
}

interface AnneConfig {
  system_prompt: string | null;
  model: string;
  provider: string;
  send_mode: 'auto' | 'suggest';
  automations: AnneAutomation[];
}

interface SandboxResult {
  event: { trigger: string; targetColumn: string; motivo: string; score: number } | null;
  action_preview: string;
  kanban_move: string | null;
  message_suggestion: string | null;
  chain_of_thought: string[];
}

interface AnneLogEntry {
  id: string;
  tipo: 'silenciosa' | 'ativa' | 'handover' | 'erro';
  agente_executor: string;
  agente_usado?: string;
  intencao?: string;
  gatilho_ativado: string | null;
  confianca_classificacao: number | null;
  acoes_executadas: Array<{ acao: string; resultado: string; latencia_ms: number }>;
  mensagem_enviada: string | null;
  chain_of_thought: string[] | null;
  duracao_total_ms: number | null;
  duracao_ms?: number;
  requer_revisao: boolean;
  created_at: string;
}

interface AnneLogsSummary {
  silenciosas: number;
  ativas: number;
  handovers: number;
  erros: number;
  avg_latency_ms: number;
  handovers_pendentes: number;
}

interface AgentData {
  id: string;
  slug: string;
  name: string;
  description: string;
  enabled: boolean;
  knowledge_base: string | null;
  knowledge_tokens: number;
  executions_total: number;
  executions_today: number;
  avg_latency_ms: number;
  last_executed_at: string | null;
}

interface HandoverEntry {
  id: string;
  client_id: string | null;
  client_name?: string | null;
  phone?: string | null;
  chat_id: string;
  motivo: string;
  reason?: string;
  palavra_gatilho: string | null;
  tipo_gatilho: string;
  status: 'aguardando' | 'assumido' | 'resolvido';
  assumido_por: string | null;
  dossie: {
    ultimas_mensagens?: Array<{ from_me: boolean; body: string }>;
    perfil_cliente?: Record<string, unknown>;
    [key: string]: unknown;
  };
  mensagem_transicao: string | null;
  created_at: string;
}

/* ─── Helpers ───────────────────────────────────────────────── */
const RULE_ICONS: Record<string, React.ReactNode> = {
  cart_recovery:   <Zap       size={15} className="text-amber-500" />,
  welcome_lead:    <MessageSquare size={15} className="text-emerald-500" />,
  payment_confirm: <CheckCircle2 size={15} className="text-blue-500" />,
  tracking_reply:  <Send       size={15} className="text-purple-500" />,
};

const LOG_TIPO_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string; badge: string; dot: string }> = {
  silenciosa: { label: 'Silenciosa', icon: '🔇', color: 'text-gray-600', bg: 'bg-gray-100',  badge: 'bg-gray-100 text-gray-600',  dot: 'bg-gray-400' },
  ativa:      { label: 'Ativa',      icon: '📣', color: 'text-blue-600', bg: 'bg-blue-50',   badge: 'bg-blue-100 text-blue-700',  dot: 'bg-blue-500' },
  handover:   { label: 'Handover',   icon: '⚠️', color: 'text-red-600',  bg: 'bg-red-50',    badge: 'bg-red-100 text-red-700',    dot: 'bg-red-500' },
  erro:       { label: 'Erro',       icon: '❌', color: 'text-red-700',  bg: 'bg-red-100',   badge: 'bg-red-200 text-red-800',    dot: 'bg-red-600' },
};

const AGENT_SLUGS = ['comercial', 'logistica', 'faq', 'triagem'] as const;
const AGENT_LABELS: Record<string, { icon: string; color: string; label: string }> = {
  comercial: { icon: '🏷️', color: 'text-amber-700',   label: 'Comercial' },
  logistica: { icon: '🚚', color: 'text-blue-700',    label: 'Logística' },
  faq:       { icon: '❓', color: 'text-purple-700',  label: 'FAQ' },
  triagem:   { icon: '👋', color: 'text-emerald-700', label: 'Triagem' },
};

type PageTab = 'config' | 'agentes' | 'feed' | 'handovers';

const PAGE_TABS: { key: PageTab; label: string; icon: React.ReactNode }[] = [
  { key: 'config',    label: 'Configuração',   icon: <Settings size={14} /> },
  { key: 'agentes',   label: 'Agentes',         icon: <Users size={14} /> },
  { key: 'feed',      label: 'Feed ao Vivo',    icon: <Activity size={14} /> },
  { key: 'handovers', label: 'Handovers',       icon: <ShieldAlert size={14} /> },
];

const DEFAULT_PROMPT = `Você é a Anne, assistente virtual da loja {{loja}}.
Você é educada, usa emojis de moda, é rápida e focada em converter carrinhos em vendas.
Ao responder dúvidas sobre frete, consulte os dados reais do pedido.
Nunca invente informações — se não souber, diga que vai verificar.
Tom: amigável, animado, como uma consultora de moda.`;

/* ─── Componente principal ──────────────────────────────────── */
export default function AnneConfigPage() {
  const queryClient = useQueryClient();

  // ── Estado local ─────────────────────────────────────────────
  const [activeTab, setActiveTab]         = useState<PageTab>('config');
  const [systemPrompt, setSystemPrompt]   = useState('');
  const [globalMode, setGlobalMode]       = useState<'auto' | 'suggest'>('suggest');
  const [automations, setAutomations]     = useState<AnneAutomation[]>([]);
  const [expandedRule, setExpandedRule]   = useState<string | null>(null);
  const [sandboxText, setSandboxText]     = useState('');
  const [sandboxFromMe, setSandboxFromMe] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<SandboxResult | null>(null);
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const sandboxRef = useRef<HTMLTextAreaElement>(null);

  // ── Carregar config ───────────────────────────────────────────
  const { data, isLoading } = useQuery<AnneConfig>({
    queryKey: ['anne-config'],
    queryFn: async () => {
      const res = await api.get<AnneConfig>('/api/v2/anne/config');
      return res.data;
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (data) {
      setSystemPrompt(data.system_prompt ?? DEFAULT_PROMPT);
      setGlobalMode(data.send_mode);
      setAutomations(data.automations ?? []);
    }
  }, [data]);

  // ── Salvar config ─────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.patch('/api/v2/anne/config', {
        system_prompt: systemPrompt,
        send_mode: globalMode,
        automations: automations.map(a => ({
          rule_key: a.rule_key,
          enabled: a.enabled,
          delay_minutes: a.delay_minutes,
          send_mode: a.send_mode,
          message_template: a.message_template,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anne-config'] });
      setSavedIndicator(true);
      setTimeout(() => setSavedIndicator(false), 2500);
    },
  });

  // ── Queries — Feed ao Vivo ───────────────────────────────────
  const { data: logsData, isLoading: logsLoading, refetch: refetchLogs } = useQuery<{
    logs: AnneLogEntry[];
    total: number;
    summary: AnneLogsSummary;
  }>({
    queryKey: ['anne-logs-feed'],
    queryFn: async () => {
      const res = await api.get<{ logs: AnneLogEntry[]; total: number; summary: AnneLogsSummary }>(
        '/api/v2/anne/logs?limit=50&dias=1',
      );
      return res.data;
    },
    staleTime: 15_000,
    refetchInterval: activeTab === 'feed' ? 15_000 : false,
    enabled: activeTab === 'feed',
  });

  // ── Queries — Handovers ───────────────────────────────────────
  const { data: handoversData, isLoading: handoversLoading, refetch: refetchHandovers } = useQuery<{
    handovers: HandoverEntry[];
  }>({
    queryKey: ['anne-handovers'],
    queryFn: async () => {
      const res = await api.get<{ handovers: HandoverEntry[] }>('/api/v2/anne/handover?status=aguardando');
      return res.data;
    },
    staleTime: 30_000,
    refetchInterval: activeTab === 'handovers' ? 30_000 : false,
    enabled: activeTab === 'handovers',
  });

  // ── Queries — Agentes ──────────────────────────────────────────
  const [agentKnowledge, setAgentKnowledge]     = useState<Record<string, string>>({});
  const [agentSaving, setAgentSaving]           = useState<string | null>(null);
  const [agentSaved, setAgentSaved]             = useState<string | null>(null);
  const [expandedAgent, setExpandedAgent]       = useState<string | null>('comercial');

  const { data: agentsData, isLoading: agentsLoading } = useQuery<{ agents: AgentData[] }>({
    queryKey: ['anne-agents'],
    queryFn: async () => {
      const results = await Promise.all(
        AGENT_SLUGS.map(slug =>
          api.get<{ agent: AgentData }>(`/api/v2/agentes/${slug}/knowledge`).then(r => r.data.agent),
        ),
      );
      return { agents: results };
    },
    staleTime: 60_000,
    enabled: activeTab === 'agentes',
  });

  useEffect(() => {
    if (agentsData?.agents) {
      const map: Record<string, string> = {};
      agentsData.agents.forEach(a => { map[a.slug] = a.knowledge_base ?? ''; });
      setAgentKnowledge(map);
    }
  }, [agentsData]);

  const saveAgentKnowledge = useCallback(async (slug: string) => {
    setAgentSaving(slug);
    try {
      await api.post(`/api/v2/agentes/${slug}/knowledge`, { knowledge_base: agentKnowledge[slug] ?? '' });
      queryClient.invalidateQueries({ queryKey: ['anne-agents'] });
      setAgentSaved(slug);
      setTimeout(() => setAgentSaved(null), 2000);
    } finally {
      setAgentSaving(null);
    }
  }, [agentKnowledge, queryClient]);

  // ── Resolver handover ─────────────────────────────────────────
  const resolveHandover = async (handoverId: string, status: 'assumido' | 'resolvido') => {
    await api.patch('/api/v2/anne/handover', { handover_id: handoverId, status });
    refetchHandovers();
  };

  // ── Sandbox ───────────────────────────────────────────────────
  const handleSandbox = async () => {
    if (!sandboxText.trim()) return;
    setSandboxLoading(true);
    setSandboxResult(null);
    try {
      const res = await api.post<SandboxResult>('/api/v2/anne/sandbox', {
        text: sandboxText,
        from_me: sandboxFromMe,
      });
      setSandboxResult(res.data);
    } catch {
      setSandboxResult({
        event: null,
        action_preview: 'Erro ao consultar o sandbox.',
        kanban_move: null,
        message_suggestion: null,
        chain_of_thought: ['❌ Falha ao comunicar com a API.'],
      });
    } finally {
      setSandboxLoading(false);
    }
  };

  // ── Helpers de automação ──────────────────────────────────────
  const updateAutomation = (ruleKey: string, patch: Partial<AnneAutomation>) => {
    setAutomations(prev => prev.map(a => a.rule_key === ruleKey ? { ...a, ...patch } : a));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-crm-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa] p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-crm-primary flex items-center justify-center shadow-sm">
              <Bot size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900">Anne OS — Sistema Multi-Agente</h1>
              <p className="text-sm text-gray-500 mt-0.5">Orquestradora · 4 Agentes · Pipeline Autônomo · Handover Humano</p>
            </div>
          </div>
          {activeTab === 'config' && (
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all',
                savedIndicator
                  ? 'bg-emerald-500 text-white'
                  : 'bg-crm-primary text-white hover:bg-crm-primary/90 disabled:opacity-50'
              )}
            >
              {saveMutation.isPending
                ? <Loader2 size={15} className="animate-spin" />
                : savedIndicator
                  ? <CheckCircle2 size={15} />
                  : <Save size={15} />
              }
              {savedIndicator ? 'Salvo!' : 'Salvar Configurações'}
            </button>
          )}
          {activeTab === 'feed' && (
            <button onClick={() => refetchLogs()} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <RefreshCw size={13} /> Atualizar
            </button>
          )}
        </div>

        {/* ── Abas de navegação ─────────────────────────────── */}
        <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-100 p-1 w-fit shadow-sm">
          {PAGE_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                activeTab === tab.key
                  ? 'bg-crm-primary text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.key === 'handovers' && (handoversData?.handovers?.length ?? 0) > 0 && (
                <span className="ml-1 text-[9px] font-black bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                  {handoversData!.handovers.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════ */}
        {/* ABA: CONFIGURAÇÃO (existente)                       */}
        {/* ════════════════════════════════════════════════════ */}
        {activeTab === 'config' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

          {/* ── Coluna esquerda ─────────────────────────────── */}
          <div className="space-y-5">

            {/* Camada A — Prompt Mestre */}
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
                <Sparkles size={16} className="text-crm-primary" />
                <h2 className="text-sm font-bold text-gray-800">A. Prompt Mestre — Personalidade</h2>
              </div>
              <div className="p-5">
                <p className="text-xs text-gray-500 mb-3">
                  Defina o tom de voz da Anne. Use <code className="bg-gray-100 px-1 rounded text-[10px]">{'{{loja}}'}</code> para inserir o nome da loja.
                </p>
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  rows={8}
                  placeholder={DEFAULT_PROMPT}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-crm-primary/50 bg-gray-50 text-gray-800 font-mono leading-relaxed"
                />
                <div className="flex items-center gap-2 mt-3">
                  <Info size={12} className="text-gray-400 shrink-0" />
                  <p className="text-[10px] text-gray-400">
                    Este prompt é enviado como contexto para todas as respostas da Anne.
                  </p>
                </div>
              </div>
            </section>

            {/* Camada C — Modo Global */}
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
                <Settings size={16} className="text-crm-primary" />
                <h2 className="text-sm font-bold text-gray-800">Modo Global de Autonomia</h2>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-xs text-gray-500">
                  Controla o comportamento padrão para automações que não têm modo específico.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {/* Suggest */}
                  <button
                    onClick={() => setGlobalMode('suggest')}
                    className={cn(
                      'flex flex-col items-start p-3.5 rounded-xl border-2 transition-all text-left',
                      globalMode === 'suggest'
                        ? 'border-crm-primary bg-crm-primary/5'
                        : 'border-gray-100 hover:border-gray-200'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={cn(
                        'w-3 h-3 rounded-full border-2',
                        globalMode === 'suggest' ? 'border-crm-primary bg-crm-primary' : 'border-gray-300'
                      )} />
                      <span className="text-xs font-bold text-gray-800">🤝 Sugerir</span>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed">
                      Anne prepara a mensagem em amarelo — humano clica para enviar.
                    </p>
                  </button>
                  {/* Auto */}
                  <button
                    onClick={() => setGlobalMode('auto')}
                    className={cn(
                      'flex flex-col items-start p-3.5 rounded-xl border-2 transition-all text-left',
                      globalMode === 'auto'
                        ? 'border-crm-primary bg-crm-primary/5'
                        : 'border-gray-100 hover:border-gray-200'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={cn(
                        'w-3 h-3 rounded-full border-2',
                        globalMode === 'auto' ? 'border-crm-primary bg-crm-primary' : 'border-gray-300'
                      )} />
                      <span className="text-xs font-bold text-gray-800">🤖 Automático</span>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed">
                      Anne envia diretamente, sem aprovação humana.
                    </p>
                  </button>
                </div>
              </div>
            </section>

            {/* Camada B — Automações (Triggers) */}
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
                <Zap size={16} className="text-crm-primary" />
                <h2 className="text-sm font-bold text-gray-800">B. Automações — Gatilhos (Se → Então)</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {automations.map(auto => (
                  <div key={auto.rule_key} className="px-5 py-4">
                    {/* Header da regra */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => updateAutomation(auto.rule_key, { enabled: !auto.enabled })}
                        className="shrink-0"
                        title={auto.enabled ? 'Desativar' : 'Ativar'}
                      >
                        {auto.enabled
                          ? <ToggleRight size={24} className="text-crm-primary" />
                          : <ToggleLeft size={24} className="text-gray-300" />
                        }
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {RULE_ICONS[auto.rule_key]}
                          <span className={cn(
                            'text-sm font-semibold',
                            auto.enabled ? 'text-gray-800' : 'text-gray-400'
                          )}>
                            {auto.name}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{auto.description}</p>
                      </div>

                      <button
                        onClick={() => setExpandedRule(expandedRule === auto.rule_key ? null : auto.rule_key)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors shrink-0"
                      >
                        {expandedRule === auto.rule_key
                          ? <ChevronDown size={14} />
                          : <ChevronRight size={14} />
                        }
                      </button>
                    </div>

                    {/* Detalhes expandidos */}
                    {expandedRule === auto.rule_key && (
                      <div className="mt-4 space-y-3 pl-8">
                        {/* Delay */}
                        {auto.rule_key === 'cart_recovery' && (
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                              <Clock size={10} className="inline mr-1" />Delay antes de disparar
                            </label>
                            <div className="flex items-center gap-2 mt-1">
                              <input
                                type="number"
                                min={5}
                                max={1440}
                                value={auto.delay_minutes}
                                onChange={e => updateAutomation(auto.rule_key, { delay_minutes: Number(e.target.value) })}
                                className="w-20 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-crm-primary/50"
                              />
                              <span className="text-xs text-gray-500">minutos</span>
                              <span className="text-[10px] text-gray-400">
                                ({auto.delay_minutes >= 60
                                  ? `${(auto.delay_minutes / 60).toFixed(1)}h`
                                  : `${auto.delay_minutes}min`
                                })
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Modo de envio */}
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                            Modo de Envio
                          </label>
                          <div className="flex gap-2 mt-1">
                            {(['suggest', 'auto'] as const).map(mode => (
                              <button
                                key={mode}
                                onClick={() => updateAutomation(auto.rule_key, { send_mode: mode })}
                                className={cn(
                                  'px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors',
                                  auto.send_mode === mode
                                    ? 'bg-crm-primary/10 border-crm-primary/30 text-crm-primary'
                                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                                )}
                              >
                                {mode === 'suggest' ? '🤝 Sugerir' : '🤖 Auto'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Template de mensagem */}
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                            Template da Mensagem
                          </label>
                          <textarea
                            value={auto.message_template ?? ''}
                            onChange={e => updateAutomation(auto.rule_key, { message_template: e.target.value })}
                            rows={4}
                            placeholder="Oi {{nome}}! ..."
                            className="mt-1 w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 resize-none focus:outline-none focus:border-crm-primary/50 bg-gray-50 font-mono"
                          />
                          <p className="text-[9px] text-gray-400 mt-1">
                            Variáveis: {'{{nome}}'} {'{{loja}}'} {'{{produto}}'} {'{{codigo_rastreio}}'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* ── Coluna direita — Sandbox ─────────────────────── */}
          <div className="space-y-5">
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col" style={{ minHeight: 540 }}>
              <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
                <Play size={16} className="text-crm-primary" />
                <h2 className="text-sm font-bold text-gray-800">C. Sandbox — Teste o Agente</h2>
              </div>

              <div className="flex-1 flex flex-col p-5 gap-4">
                <p className="text-xs text-gray-500">
                  Digite uma mensagem e veja o que a Anne faria — <strong>sem alterar dados reais</strong>.
                </p>

                {/* Input */}
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 select-none cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sandboxFromMe}
                        onChange={e => setSandboxFromMe(e.target.checked)}
                        className="rounded border-gray-300 text-crm-primary focus:ring-crm-primary"
                      />
                      Mensagem do bot/atendente
                    </label>
                  </div>
                  <textarea
                    ref={sandboxRef}
                    value={sandboxText}
                    onChange={e => setSandboxText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSandbox(); }
                    }}
                    rows={3}
                    placeholder={'Exemplos:\n"Oi, quero saber mais sobre as sandálias"\n"O pagamento do seu pedido nº 5260270 foi aprovado. ✅"'}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-crm-primary/50 bg-gray-50 text-gray-800"
                  />
                  <button
                    onClick={handleSandbox}
                    disabled={sandboxLoading || !sandboxText.trim()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-crm-primary text-white text-sm font-semibold hover:bg-crm-primary/90 disabled:opacity-40 transition-colors"
                  >
                    {sandboxLoading
                      ? <Loader2 size={15} className="animate-spin" />
                      : <Play size={15} />
                    }
                    {sandboxLoading ? 'Processando...' : 'Simular Resposta'}
                  </button>
                </div>

                {/* Resultado */}
                {sandboxResult && (
                  <div className="flex-1 space-y-3 animate-in fade-in duration-200">

                    {/* Preview da ação */}
                    <div className={cn(
                      'rounded-xl p-3.5 border',
                      sandboxResult.kanban_move
                        ? 'bg-crm-primary/5 border-crm-primary/20'
                        : 'bg-gray-50 border-gray-200'
                    )}>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                        Ação Prevista
                      </p>
                      <p className="text-sm text-gray-800 font-medium">{sandboxResult.action_preview}</p>
                      {sandboxResult.kanban_move && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <span className="text-[10px] text-gray-500">Mover para:</span>
                          <span className="text-[10px] font-bold text-crm-primary bg-crm-primary/10 px-2 py-0.5 rounded">
                            {sandboxResult.kanban_move}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Sugestão de mensagem */}
                    {sandboxResult.message_suggestion && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1.5">
                          💬 Mensagem Sugerida
                        </p>
                        <p className="text-xs text-gray-700 font-mono leading-relaxed whitespace-pre-wrap">
                          {sandboxResult.message_suggestion}
                        </p>
                      </div>
                    )}

                    {/* Chain of Thought */}
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <RefreshCw size={10} />
                        Cadeia de Raciocínio (Chain of Thought)
                      </p>
                      <div className="space-y-1">
                        {sandboxResult.chain_of_thought.map((step, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="text-[9px] text-gray-400 font-mono mt-0.5 shrink-0 w-4">{i + 1}.</span>
                            <p className="text-[11px] text-gray-600 leading-relaxed">{step}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Card informativo */}
            <div className="bg-gradient-to-br from-crm-primary/8 to-crm-primary/3 rounded-2xl border border-crm-primary/15 p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={15} className="text-crm-primary" />
                <h3 className="text-sm font-bold text-crm-primary">Ferramentas do Agente</h3>
              </div>
              <div className="space-y-2">
                {[
                  { icon: '🔧', label: 'Tool_Update_Pipeline', desc: 'Move clientes no Kanban' },
                  { icon: '📦', label: 'Tool_Fetch_Orders', desc: 'Lê pedidos e rastreio' },
                  { icon: '💬', label: 'Tool_Send_WhatsApp', desc: 'Dispara mensagens de up' },
                  { icon: '👤', label: 'Tool_Update_Client', desc: 'Atualiza nome e etiquetas' },
                ].map(t => (
                  <div key={t.label} className="flex items-start gap-2.5">
                    <span className="text-sm">{t.icon}</span>
                    <div>
                      <p className="text-[11px] font-bold text-gray-700 font-mono">{t.label}</p>
                      <p className="text-[10px] text-gray-500">{t.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        )} {/* fim activeTab === 'config' */}

        {/* ════════════════════════════════════════════════════ */}
        {/* ABA: AGENTES — Knowledge Base Editor               */}
        {/* ════════════════════════════════════════════════════ */}
        {activeTab === 'agentes' && (
          <div className="space-y-4">
            {agentsLoading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">Carregando agentes…</span>
              </div>
            ) : (
              AGENT_SLUGS.map(slug => {
                const agent = agentsData?.agents?.find((a: AgentData) => a.slug === slug);
                const isExpanded = expandedAgent === slug;
                const cfg = AGENT_LABELS[slug];
                return (
                  <section key={slug} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <button
                      onClick={() => {
                        setExpandedAgent(isExpanded ? null : slug);
                        if (!isExpanded && agent?.knowledge_base && !agentKnowledge[slug]) {
                          setAgentKnowledge(prev => ({ ...prev, [slug]: agent.knowledge_base ?? '' }));
                        }
                      }}
                      className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{cfg.icon}</span>
                        <div className="text-left">
                          <p className="text-sm font-bold text-gray-800">{agent?.name ?? cfg.label}</p>
                          <p className="text-[11px] text-gray-500">{agent?.description ?? 'Carregando…'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        {agent && (
                          <div className="flex gap-4 text-right mr-1">
                            <div>
                              <p className="text-[9px] text-gray-400 uppercase tracking-wide">Hoje</p>
                              <p className="text-xs font-bold text-gray-700">{agent.executions_today ?? 0}</p>
                            </div>
                            <div>
                              <p className="text-[9px] text-gray-400 uppercase tracking-wide">Tokens KB</p>
                              <p className="text-xs font-bold text-gray-700">{agent.knowledge_tokens ?? 0}</p>
                            </div>
                          </div>
                        )}
                        {isExpanded
                          ? <ChevronDown size={16} className="text-gray-400" />
                          : <ChevronRight size={16} className="text-gray-400" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-5 border-t border-gray-50">
                        <p className="text-[10px] text-gray-400 mt-3 mb-2 flex items-center gap-1">
                          <BookOpen size={10} />
                          Base de Conhecimento — máx 8.000 tokens (~32k chars)
                        </p>
                        <textarea
                          value={agentKnowledge[slug] ?? agent?.knowledge_base ?? ''}
                          onChange={e => setAgentKnowledge(prev => ({ ...prev, [slug]: e.target.value }))}
                          rows={12}
                          placeholder={`Cole aqui as instruções, regras e base de conhecimento para o agente ${cfg.label}…`}
                          className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-crm-primary/50 bg-gray-50 font-mono leading-relaxed"
                        />
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[9px] text-gray-400">
                            ~{Math.ceil(((agentKnowledge[slug] ?? agent?.knowledge_base ?? '').length) / 4)} tokens estimados
                          </span>
                          <button
                            onClick={() => saveAgentKnowledge(slug)}
                            disabled={agentSaving === slug}
                            className={cn(
                              'flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all',
                              agentSaved === slug
                                ? 'bg-emerald-500 text-white'
                                : 'bg-crm-primary text-white hover:bg-crm-primary/90 disabled:opacity-60'
                            )}
                          >
                            {agentSaving === slug
                              ? <Loader2 size={12} className="animate-spin" />
                              : agentSaved === slug
                                ? <CheckCircle2 size={12} />
                                : <Save size={12} />}
                            {agentSaved === slug ? 'Salvo!' : 'Salvar Base'}
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                );
              })
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════ */}
        {/* ABA: FEED AO VIVO — Execução em tempo real         */}
        {/* ════════════════════════════════════════════════════ */}
        {activeTab === 'feed' && (
          <div className="space-y-4">
            {/* Resumo */}
            {logsData?.summary && (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                {[
                  { label: 'Silenciosas', value: logsData.summary.silenciosas, color: 'text-gray-600' },
                  { label: 'Ativas', value: logsData.summary.ativas, color: 'text-blue-600' },
                  { label: 'Handovers', value: logsData.summary.handovers, color: 'text-red-600' },
                  { label: 'Erros', value: logsData.summary.erros, color: 'text-orange-600' },
                  { label: 'Latência média', value: `${logsData.summary.avg_latency_ms ?? 0}ms`, color: 'text-crm-primary' },
                  { label: 'Pendentes', value: logsData.summary.handovers_pendentes, color: 'text-amber-600' },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-xl border border-gray-100 px-3 py-3 text-center shadow-sm">
                    <p className={cn('text-lg font-black', s.color)}>{s.value}</p>
                    <p className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Lista de logs */}
            {logsLoading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">Carregando feed…</span>
              </div>
            ) : !logsData?.logs?.length ? (
              <div className="text-center py-16">
                <Activity size={28} className="text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-400">Nenhuma execução nas últimas 24h</p>
              </div>
            ) : (
              <div className="space-y-2">
                {logsData.logs.map((log: AnneLogEntry) => {
                  const tipoCfg = LOG_TIPO_CONFIG[log.tipo] ?? LOG_TIPO_CONFIG['silenciosa'];
                  return (
                    <div key={log.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm flex items-start gap-3">
                      <span className={cn('w-2 h-2 rounded-full shrink-0 mt-1.5', tipoCfg.dot)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', tipoCfg.badge)}>
                            {log.tipo}
                          </span>
                          {(log.agente_usado ?? log.agente_executor) && (
                            <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                              {AGENT_LABELS[log.agente_usado ?? log.agente_executor]?.label ?? (log.agente_usado ?? log.agente_executor)}
                            </span>
                          )}
                          {log.intencao && (
                            <span className="text-[10px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">{log.intencao}</span>
                          )}
                          <span className="text-[9px] text-gray-400 ml-auto">{log.duracao_ms ?? log.duracao_total_ms ?? 0}ms</span>
                        </div>
                        {log.mensagem_enviada && (
                          <p className="text-xs text-gray-700 mt-1.5 font-mono leading-relaxed line-clamp-2">
                            {log.mensagem_enviada}
                          </p>
                        )}
                        {(log.chain_of_thought?.length ?? 0) > 0 && (
                          <details className="mt-2">
                            <summary className="text-[9px] text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                              Ver cadeia de raciocínio ({log.chain_of_thought!.length} passos)
                            </summary>
                            <div className="mt-1.5 pl-2 border-l-2 border-gray-100 space-y-0.5">
                              {log.chain_of_thought!.map((step, i) => (
                                <p key={i} className="text-[10px] text-gray-500 leading-relaxed">
                                  <span className="text-gray-400 mr-1">{i + 1}.</span>{step}
                                </p>
                              ))}
                            </div>
                          </details>
                        )}
                        <p className="text-[9px] text-gray-400 mt-1.5">
                          {new Date(log.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════ */}
        {/* ABA: HANDOVERS — Transferências em aberto          */}
        {/* ════════════════════════════════════════════════════ */}
        {activeTab === 'handovers' && (
          <div className="space-y-4">
            {handoversLoading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">Carregando handovers…</span>
              </div>
            ) : !handoversData?.handovers?.length ? (
              <div className="text-center py-16">
                <ShieldAlert size={28} className="text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-400">Nenhum handover ativo no momento 🎉</p>
                <p className="text-[11px] text-gray-400 mt-1">Todos os atendimentos estão sendo gerenciados pela Anne</p>
              </div>
            ) : (
              <div className="space-y-3">
                {handoversData.handovers.map((hv: HandoverEntry) => (
                  <div key={hv.id} className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                          <ShieldAlert size={16} className="text-red-500" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-800">{hv.client_name ?? 'Cliente'}</p>
                          <p className="text-[11px] text-gray-500">{hv.phone ?? hv.chat_id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn(
                          'text-[10px] font-bold px-2 py-0.5 rounded-full',
                          hv.status === 'aguardando'
                            ? 'bg-amber-100 text-amber-700'
                            : hv.status === 'assumido'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-emerald-100 text-emerald-700'
                        )}>
                          {hv.status.charAt(0).toUpperCase() + hv.status.slice(1)}
                        </span>
                        <p className="text-[9px] text-gray-400">
                          {new Date(hv.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                      </div>
                    </div>

                    {/* Motivo */}
                    <div className="px-5 pb-3">
                      <p className="text-[10px] font-semibold text-gray-500 mb-1">Motivo da transferência</p>
                      <p className="text-xs text-gray-700 bg-red-50 rounded-lg px-3 py-2 leading-relaxed">{hv.reason ?? hv.motivo}</p>
                    </div>

                    {/* Dossiê */}
                    {hv.dossie && (
                      <details className="px-5 pb-3">
                        <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-700 select-none flex items-center gap-1">
                          <BookOpen size={10} /> Ver dossiê completo
                        </summary>
                        <div className="mt-2 bg-gray-50 rounded-xl p-3 space-y-2">
                          {(hv.dossie.ultimas_mensagens?.length ?? 0) > 0 && (
                            <div>
                              <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-1">Últimas mensagens</p>
                              <div className="space-y-1">
                                {hv.dossie.ultimas_mensagens!.map((m, i) => (
                                  <p key={i} className={cn('text-[10px] px-2 py-1 rounded', m.from_me ? 'bg-crm-primary/10 text-crm-primary' : 'bg-white border border-gray-100 text-gray-700')}>
                                    {m.from_me ? '🤖 ' : '👤 '}{m.body}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                          {hv.dossie.perfil_cliente && (
                            <div>
                              <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-1">Perfil</p>
                              <div className="flex gap-3 flex-wrap">
                                {Object.entries(hv.dossie.perfil_cliente).map(([k, v]) => (
                                  <span key={k} className="text-[10px] bg-white border border-gray-100 rounded-lg px-2 py-0.5">
                                    <span className="text-gray-400">{k}:</span> <strong className="text-gray-700">{String(v)}</strong>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </details>
                    )}

                    {/* Ações */}
                    {hv.status !== 'resolvido' && (
                      <div className="px-5 pb-4 flex gap-2">
                        {hv.status === 'aguardando' && (
                          <button
                            onClick={() => resolveHandover(hv.id, 'assumido')}
                            className="flex-1 py-2 rounded-xl border border-blue-200 text-blue-700 text-xs font-bold hover:bg-blue-50 transition-colors"
                          >
                            Assumir atendimento
                          </button>
                        )}
                        <button
                          onClick={() => resolveHandover(hv.id, 'resolvido')}
                          className="flex-1 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-colors"
                        >
                          ✓ Marcar resolvido + reativar Anne
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
