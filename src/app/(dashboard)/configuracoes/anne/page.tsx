'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Bot, Save, Loader2, ToggleLeft, ToggleRight, Clock, Send, Zap,
  ChevronDown, ChevronRight, Play, MessageSquare, CheckCircle2,
  AlertTriangle, RefreshCw, Info, ArrowRight, Sparkles, Settings,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

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

/* ─── Helpers ───────────────────────────────────────────────── */
const RULE_ICONS: Record<string, React.ReactNode> = {
  cart_recovery:   <Zap       size={15} className="text-amber-500" />,
  welcome_lead:    <MessageSquare size={15} className="text-emerald-500" />,
  payment_confirm: <CheckCircle2 size={15} className="text-blue-500" />,
  tracking_reply:  <Send       size={15} className="text-purple-500" />,
};

const DEFAULT_PROMPT = `Você é a Anne, assistente virtual da loja {{loja}}.
Você é educada, usa emojis de moda, é rápida e focada em converter carrinhos em vendas.
Ao responder dúvidas sobre frete, consulte os dados reais do pedido.
Nunca invente informações — se não souber, diga que vai verificar.
Tom: amigável, animado, como uma consultora de moda.`;

/* ─── Componente principal ──────────────────────────────────── */
export default function AnneConfigPage() {
  const queryClient = useQueryClient();

  // ── Estado local ─────────────────────────────────────────────
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
              <h1 className="text-xl font-black text-gray-900">Central de Comando — Anne</h1>
              <p className="text-sm text-gray-500 mt-0.5">Configure a personalidade, automações e modo de decisão do agente.</p>
            </div>
          </div>
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
        </div>

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
      </div>
    </div>
  );
}
