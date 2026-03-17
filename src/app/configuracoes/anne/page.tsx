'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot, Settings, Brain, Zap, FlaskConical,
  Eye, EyeOff, Loader2, Send, ChevronDown, ChevronUp,
  ShoppingCart, Activity, CheckCircle2, AlertCircle, Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useUIStore } from '@/store/ui';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnneConfig {
  system_prompt: string | null;
  model: string;
  provider: string;
  send_mode: 'auto' | 'suggest';
  automations: AnneAutomation[];
}

interface AnneAutomation {
  id?: string;
  rule_key: string;
  name: string;
  description: string;
  enabled: boolean;
  delay_minutes: number;
  send_mode: 'auto' | 'suggest';
  message_template: string | null;
}

interface AnneAgent {
  slug: string;
  name: string;
  description: string;
  system_prompt: string;
  knowledge_base: string | null;
  knowledge_tokens: number;
  enabled: boolean;
}

interface TenantAIConfig {
  openai_api_key: string | null;
  openai_model: string;
  openai_provider: string;
  openai_base_url: string | null;
}

interface AnneStats {
  carts_recovered_today: number;
  automations_fired_today: number;
  suggestions_pending: number;
  carts_pending: number;
}

interface SandboxResult {
  event: { trigger: string; score: number; targetColumn: string } | null;
  action_preview: string;
  kanban_move: string | null;
  message_suggestion: string | null;
  chain_of_thought: string[];
}

type AddToast = (t: { type: 'success' | 'error' | 'warning' | 'info'; title: string; message?: string }) => void;

// ─── Constants ────────────────────────────────────────────────────────────────

const PROVIDERS = [
  { value: 'openai',     label: 'OpenAI' },
  { value: 'anthropic',  label: 'Anthropic (Claude)' },
  { value: 'google',     label: 'Google (Gemini)' },
  { value: 'groq',       label: 'Groq' },
  { value: 'deepseek',   label: 'DeepSeek' },
  { value: 'custom',     label: 'Custom / Self-hosted' },
];

const MODELS: Record<string, { value: string; label: string }[]> = {
  openai:     [
    { value: 'gpt-4o-mini',   label: 'GPT-4o Mini (recomendado)' },
    { value: 'gpt-4o',        label: 'GPT-4o' },
    { value: 'gpt-4-turbo',   label: 'GPT-4 Turbo' },
  ],
  anthropic:  [
    { value: 'claude-3-5-haiku-20241022',   label: 'Claude 3.5 Haiku (recomendado)' },
    { value: 'claude-3-5-sonnet-20241022',  label: 'Claude 3.5 Sonnet' },
    { value: 'claude-opus-4-6',             label: 'Claude Opus 4.6' },
  ],
  google:     [
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (recomendado)' },
    { value: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro' },
  ],
  groq:       [
    { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (recomendado)' },
    { value: 'mixtral-8x7b-32768',      label: 'Mixtral 8x7B' },
  ],
  deepseek:   [{ value: 'deepseek-chat', label: 'DeepSeek Chat' }],
  custom:     [],
};

const DEFAULT_AUTOMATIONS: AnneAutomation[] = [
  {
    rule_key: 'cart_recovery',
    name: 'Recuperação de Carrinho',
    description: 'Envia mensagem para clientes que abandonaram o carrinho',
    enabled: false, delay_minutes: 120, send_mode: 'suggest',
    message_template: 'Olá {{nome}}! Vi que você deixou alguns itens no carrinho 🛒\n\nSeus produtos ainda estão disponíveis. Posso te ajudar a finalizar o pedido?\n\n{{link_carrinho}}',
  },
  {
    rule_key: 'welcome_lead',
    name: 'Boas-vindas a Leads',
    description: 'Mensagem automática para novos leads que entram em contato',
    enabled: false, delay_minutes: 0, send_mode: 'suggest',
    message_template: 'Olá {{nome}}! Seja bem-vindo(a) à {{nome_loja}} 🎉\n\nSou a Anne, assistente virtual. Como posso te ajudar hoje?',
  },
  {
    rule_key: 'payment_confirm',
    name: 'Confirmação de Pagamento',
    description: 'Notifica o cliente quando o pagamento é confirmado',
    enabled: false, delay_minutes: 0, send_mode: 'auto',
    message_template: 'Olá {{nome}}! ✅ Seu pagamento foi confirmado!\n\nPedido: {{produto}}\nEm breve iniciaremos a separação.',
  },
  {
    rule_key: 'tracking_reply',
    name: 'Resposta de Rastreio',
    description: 'Responde automaticamente quando o cliente pergunta sobre entrega',
    enabled: false, delay_minutes: 0, send_mode: 'suggest',
    message_template: 'Olá {{nome}}! 📦 Aqui está o rastreio do seu pedido:\n\n{{codigo_rastreio}}',
  },
];

const AGENT_META = [
  { slug: 'comercial',  name: 'Comercial',  description: 'Preços, grades, MOQ e desconto B2B',    emoji: '💼' },
  { slug: 'logistica',  name: 'Logística',  description: 'Rastreio, prazos e transportadoras',    emoji: '🚚' },
  { slug: 'faq',        name: 'FAQ',        description: 'Endereço, horário e políticas gerais',  emoji: '❓' },
  { slug: 'triagem',    name: 'Triagem',    description: 'Onboarding de novos clientes',          emoji: '🔎' },
] as const;

const PERSONA_VARS = ['{{nome_loja}}', '{{nome_atendente}}', '{{link_catalogo}}', '{{nome_cliente}}', '{{segmento_rfm}}'];
const AUTO_VARS    = ['{{nome}}', '{{produto}}', '{{link_carrinho}}', '{{codigo_rastreio}}', '{{nome_loja}}'];
const COT_ICONS    = ['💬', '📊', '⚡', '🔍', '✅', '🎯', '📱', '🧠'];

function mergeAutomations(fromApi: AnneAutomation[]): AnneAutomation[] {
  return DEFAULT_AUTOMATIONS.map(def => {
    const found = fromApi.find(a => a.rule_key === def.rule_key);
    return found ? { ...def, ...found } : { ...def };
  });
}

// ─── Small primitives ─────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
      {children}
    </p>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 rounded-full transition-colors duration-200 shrink-0',
        checked ? 'bg-crm-primary' : 'bg-gray-200',
      )}
      role="switch"
      aria-checked={checked}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-[22px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}

function VarChips({
  vars, textareaRef, value, onChange,
}: {
  vars: string[];
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (v: string) => void;
}) {
  const insert = (v: string) => {
    const el = textareaRef.current;
    if (!el) { onChange(value + v); return; }
    const start = el.selectionStart ?? value.length;
    const end   = el.selectionEnd   ?? value.length;
    const next  = value.slice(0, start) + v + value.slice(end);
    onChange(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + v.length, start + v.length);
    }, 0);
  };

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {vars.map(v => (
        <button
          key={v}
          onClick={() => insert(v)}
          className="px-2 py-0.5 text-xs bg-crm-primary/10 text-crm-primary rounded-full hover:bg-crm-primary/20 transition-colors font-mono"
        >
          {v}
        </button>
      ))}
    </div>
  );
}

// ─── Tab 1 — Conexão ──────────────────────────────────────────────────────────

function TabConexao({ addToast }: { addToast: AddToast }) {
  const [showKey,   setShowKey]   = useState(false);
  const [provider,  setProvider]  = useState('openai');
  const [apiKey,    setApiKey]    = useState('');
  const [model,     setModel]     = useState('gpt-4o-mini');
  const [baseUrl,   setBaseUrl]   = useState('');
  const [sendMode,  setSendMode]  = useState<'suggest' | 'auto'>('suggest');
  const [testState, setTestState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  const { data: tenantData, isLoading: loadingTenant } = useQuery({
    queryKey: ['tenant-config'],
    queryFn: async () => { const r = await api.get<TenantAIConfig>('/api/tenants/me'); return r.data; },
    staleTime: 60_000,
  });

  const { data: anneConfig } = useQuery({
    queryKey: ['anne-config'],
    queryFn: async () => { const r = await api.get<AnneConfig>('/api/v2/anne/config'); return r.data; },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (tenantData) {
      setProvider(tenantData.openai_provider || 'openai');
      setApiKey(tenantData.openai_api_key || '');
      setModel(tenantData.openai_model || 'gpt-4o-mini');
      setBaseUrl(tenantData.openai_base_url || '');
    }
  }, [tenantData]);

  useEffect(() => {
    if (anneConfig) setSendMode(anneConfig.send_mode ?? 'suggest');
  }, [anneConfig]);

  // Quando troca de provedor, seleciona o primeiro modelo da lista
  const prevProvider = useRef(provider);
  useEffect(() => {
    if (prevProvider.current !== provider) {
      prevProvider.current = provider;
      const list = MODELS[provider] ?? [];
      if (list.length > 0) setModel(list[0].value);
    }
  }, [provider]);

  const saveTenant = useMutation({
    mutationFn: () => api.patch('/api/tenants/me', {
      openai_api_key:    apiKey || null,
      openai_model:      model,
      openai_provider:   provider,
      openai_base_url:   baseUrl || null,
    }),
    onSuccess: () => addToast({ type: 'success', title: 'Configuração salva!' }),
    onError:   () => addToast({ type: 'error',   title: 'Erro ao salvar configuração' }),
  });

  const saveSendMode = useMutation({
    mutationFn: () => api.patch('/api/v2/anne/config', { send_mode: sendMode }),
    onSuccess: () => addToast({ type: 'success', title: 'Modo de envio atualizado!' }),
    onError:   () => addToast({ type: 'error',   title: 'Erro ao salvar modo' }),
  });

  const handleTest = async () => {
    setTestState('loading');
    const r = await api.post('/api/v2/anne/sandbox', { text: 'Olá' });
    setTestState(r.error ? 'error' : 'ok');
  };

  const models      = MODELS[provider] ?? [];
  const showBaseUrl = provider === 'custom' || provider === 'groq';

  if (loadingTenant) return <TabLoader />;

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Provedor + chave + modelo */}
      <Card padding="md">
        <h3 className="text-base font-semibold text-gray-900 mb-5">Provedor de IA</h3>
        <div className="space-y-4">

          <div>
            <FieldLabel>Provedor</FieldLabel>
            <select
              value={provider}
              onChange={e => setProvider(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-crm-primary/30 focus:border-crm-primary"
            >
              {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          <div>
            <FieldLabel>API Key</FieldLabel>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-xl text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-crm-primary/30 focus:border-crm-primary"
              />
              <button
                onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <FieldLabel>Modelo</FieldLabel>
            {models.length > 0 ? (
              <select
                value={model}
                onChange={e => setModel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-crm-primary/30 focus:border-crm-primary"
              >
                {models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            ) : (
              <input
                value={model}
                onChange={e => setModel(e.target.value)}
                placeholder="nome-do-modelo"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-crm-primary/30 focus:border-crm-primary"
              />
            )}
          </div>

          {showBaseUrl && (
            <div>
              <FieldLabel>URL Base</FieldLabel>
              <input
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-crm-primary/30 focus:border-crm-primary"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 mt-6 flex-wrap">
          <PrimaryBtn loading={saveTenant.isPending} onClick={() => saveTenant.mutate()}>
            Salvar Configuração
          </PrimaryBtn>
          <SecondaryBtn
            loading={testState === 'loading'}
            disabled={!apiKey}
            onClick={handleTest}
            icon={<Send size={14} />}
          >
            Testar Conexão
          </SecondaryBtn>
          {testState === 'ok' && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
              <CheckCircle2 size={15} /> Conexão OK
            </span>
          )}
          {testState === 'error' && (
            <span className="flex items-center gap-1.5 text-sm text-red-500 font-medium">
              <AlertCircle size={15} /> Falha na conexão
            </span>
          )}
        </div>
      </Card>

      {/* Modo de envio global */}
      <Card padding="md">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Modo de Envio Global</h3>
        <p className="text-sm text-gray-500 mb-5">
          Define o comportamento padrão da Anne. Pode ser sobrescrito por automação.
        </p>
        <div className="space-y-3">
          {[
            { value: 'suggest', icon: '🤝', title: 'Sugerir (Human-in-the-Loop)', desc: 'Anne coloca a mensagem em amarelo — humano aprova antes do envio' },
            { value: 'auto',    icon: '🤖', title: 'Automático',                  desc: 'Anne envia diretamente sem intervenção humana' },
          ].map(opt => (
            <label
              key={opt.value}
              className={cn(
                'flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors',
                sendMode === opt.value
                  ? 'border-crm-primary bg-crm-primary/5'
                  : 'border-gray-200 hover:border-gray-300',
              )}
            >
              <input
                type="radio"
                name="send_mode"
                value={opt.value}
                checked={sendMode === opt.value}
                onChange={() => setSendMode(opt.value as 'suggest' | 'auto')}
                className="mt-0.5 accent-crm-primary"
              />
              <div>
                <p className="text-sm font-semibold text-gray-800">{opt.icon} {opt.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="mt-4">
          <PrimaryBtn loading={saveSendMode.isPending} onClick={() => saveSendMode.mutate()}>
            Salvar Modo
          </PrimaryBtn>
        </div>
      </Card>
    </div>
  );
}

// ─── Tab 2 — Personalidade ────────────────────────────────────────────────────

function TabPersonalidade({ addToast }: { addToast: AddToast }) {
  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['anne-config'],
    queryFn: async () => { const r = await api.get<AnneConfig>('/api/v2/anne/config'); return r.data; },
    staleTime: 60_000,
  });

  useEffect(() => { if (data) setPrompt(data.system_prompt ?? ''); }, [data]);

  const saveMutation = useMutation({
    mutationFn: (p: string | null) => api.patch('/api/v2/anne/config', { system_prompt: p }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anne-config'] });
      addToast({ type: 'success', title: 'Prompt salvo!' });
    },
    onError: () => addToast({ type: 'error', title: 'Erro ao salvar prompt' }),
  });

  // Preview com substituição por valores de exemplo
  const SAMPLE: Record<string, string> = {
    '{{nome_loja}}':      'Moda Atacado SP',
    '{{nome_atendente}}': 'Carol',
    '{{link_catalogo}}':  'https://catalogo.vexx.com.br',
    '{{nome_cliente}}':   'João',
    '{{segmento_rfm}}':   'VIP',
  };
  const preview = prompt.replace(/\{\{(\w+)\}\}/g, m => SAMPLE[m] ?? m);

  if (isLoading) return <TabLoader />;

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <strong>Dica:</strong> O System Prompt define a personalidade, tom e regras da Anne.
        Deixe em branco para usar o Prompt de Fábrica otimizado para vendas no atacado.
      </div>

      <Card padding="md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">System Prompt</h3>
          <button
            onClick={() => setPrompt('')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-crm-primary border border-crm-primary/30 rounded-lg hover:bg-crm-primary/5 transition-colors"
          >
            <Sparkles size={12} /> Usar Prompt de Fábrica
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Você é a Anne, assistente de vendas da {{nome_loja}}. Seu tom é amigável e profissional..."
          className="w-full h-72 p-3 text-sm font-mono border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-crm-primary/30 focus:border-crm-primary bg-gray-50 leading-relaxed"
        />

        <div className="mt-2 mb-1">
          <p className="text-xs text-gray-400">Clique para inserir no cursor:</p>
        </div>
        <VarChips vars={PERSONA_VARS} textareaRef={textareaRef} value={prompt} onChange={setPrompt} />

        <div className="flex items-center gap-3 mt-5">
          <PrimaryBtn loading={saveMutation.isPending} onClick={() => saveMutation.mutate(prompt || null)}>
            Salvar Prompt
          </PrimaryBtn>
          <SecondaryBtn loading={saveMutation.isPending} onClick={() => { setPrompt(''); saveMutation.mutate(null); }}>
            Resetar para Fábrica
          </SecondaryBtn>
        </div>
      </Card>

      {prompt && (
        <Card padding="md">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Preview — variáveis substituídas por valores de exemplo
          </h3>
          <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-gray-50 p-4 rounded-xl leading-relaxed border border-gray-100 max-h-64 overflow-y-auto">
            {preview}
          </pre>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 3 — Automações ───────────────────────────────────────────────────────

function AutomationCard({ automation: initial, addToast }: { automation: AnneAutomation; addToast: AddToast }) {
  const [auto, setAuto] = useState(initial);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const update = <K extends keyof AnneAutomation>(key: K, value: AnneAutomation[K]) =>
    setAuto(a => ({ ...a, [key]: value }));

  const saveMutation = useMutation({
    mutationFn: () => api.patch('/api/v2/anne/config', {
      automations: [{
        rule_key:         auto.rule_key,
        enabled:          auto.enabled,
        delay_minutes:    auto.delay_minutes,
        send_mode:        auto.send_mode,
        message_template: auto.message_template,
      }],
    }),
    onSuccess: () => addToast({ type: 'success', title: `${auto.name} salva!` }),
    onError:   () => addToast({ type: 'error',   title: 'Erro ao salvar automação' }),
  });

  return (
    <Card padding="none">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3 min-w-0">
          <Toggle checked={auto.enabled} onChange={v => update('enabled', v)} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">{auto.name}</p>
            <p className="text-xs text-gray-500 truncate">{auto.description}</p>
          </div>
        </div>
        <Badge variant={auto.enabled ? 'success' : 'neutral'} className="shrink-0 ml-3">
          {auto.enabled ? 'Ativa' : 'Inativa'}
        </Badge>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel>Enviar após (minutos)</FieldLabel>
            <input
              type="number"
              min={0}
              value={auto.delay_minutes}
              onChange={e => update('delay_minutes', Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-crm-primary/30 focus:border-crm-primary"
            />
          </div>
          <div>
            <FieldLabel>Modo de envio</FieldLabel>
            <select
              value={auto.send_mode}
              onChange={e => update('send_mode', e.target.value as 'auto' | 'suggest')}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-crm-primary/30 focus:border-crm-primary"
            >
              <option value="suggest">🤝 Sugerir</option>
              <option value="auto">🤖 Automático</option>
            </select>
          </div>
        </div>

        <div>
          <FieldLabel>Template da mensagem</FieldLabel>
          <textarea
            ref={textareaRef}
            value={auto.message_template ?? ''}
            onChange={e => update('message_template', e.target.value)}
            placeholder="Olá {{nome}}! ..."
            className="w-full h-28 p-3 text-sm font-mono border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-crm-primary/30 focus:border-crm-primary bg-gray-50"
          />
          <VarChips
            vars={AUTO_VARS}
            textareaRef={textareaRef}
            value={auto.message_template ?? ''}
            onChange={v => update('message_template', v)}
          />
        </div>

        <div className="flex justify-end">
          <PrimaryBtn loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            Salvar
          </PrimaryBtn>
        </div>
      </div>
    </Card>
  );
}

function TabAutomacoes({ addToast }: { addToast: AddToast }) {
  const { data, isLoading } = useQuery({
    queryKey: ['anne-config'],
    queryFn: async () => { const r = await api.get<AnneConfig>('/api/v2/anne/config'); return r.data; },
    staleTime: 60_000,
  });

  if (isLoading) return <TabLoader />;

  return (
    <div className="space-y-4 max-w-2xl">
      {mergeAutomations(data?.automations ?? []).map(auto => (
        <AutomationCard key={auto.rule_key} automation={auto} addToast={addToast} />
      ))}
    </div>
  );
}

// ─── Tab 4 — Agentes ──────────────────────────────────────────────────────────

function AgentCard({
  meta, agent, onSave, isSaving,
}: {
  meta: typeof AGENT_META[number];
  agent: AnneAgent | null;
  onSave: (slug: string, payload: { knowledge_base: string; enabled: boolean }) => void;
  isSaving: boolean;
}) {
  const [kb,          setKb]          = useState(agent?.knowledge_base ?? '');
  const [enabled,     setEnabled]     = useState(agent?.enabled ?? false);
  const [promptOpen,  setPromptOpen]  = useState(false);

  useEffect(() => {
    if (agent) { setKb(agent.knowledge_base ?? ''); setEnabled(agent.enabled); }
  }, [agent]);

  const estimatedTokens = Math.ceil(kb.length / 4);

  return (
    <Card padding="none">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl shrink-0">{meta.emoji}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-gray-900">{meta.name}</p>
              <Badge variant={enabled ? 'success' : 'neutral'}>{enabled ? 'Ativo' : 'Inativo'}</Badge>
            </div>
            <p className="text-xs text-gray-500 truncate">{meta.description}</p>
          </div>
        </div>
        <Toggle checked={enabled} onChange={setEnabled} />
      </div>

      <div className="px-5 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <FieldLabel>Base de Conhecimento</FieldLabel>
          <span className="text-xs text-gray-400 shrink-0 ml-2">
            ~{estimatedTokens.toLocaleString('pt-BR')} tokens
          </span>
        </div>
        <textarea
          value={kb}
          onChange={e => setKb(e.target.value)}
          placeholder={`Cole aqui: tabela de preços, regras, FAQ para o agente ${meta.name.toLowerCase()}...`}
          className="w-full h-40 p-3 text-sm font-mono border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-crm-primary/30 focus:border-crm-primary bg-gray-50"
        />

        {agent?.system_prompt && (
          <div>
            <button
              onClick={() => setPromptOpen(v => !v)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors"
            >
              {promptOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              Ver prompt do agente
            </button>
            {promptOpen && (
              <pre className="mt-2 p-3 text-xs font-mono text-gray-500 bg-gray-50 rounded-xl border border-gray-100 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                {agent.system_prompt}
              </pre>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <PrimaryBtn
            loading={isSaving}
            onClick={() => onSave(meta.slug, { knowledge_base: kb, enabled })}
          >
            Salvar Base
          </PrimaryBtn>
        </div>
      </div>
    </Card>
  );
}

function TabAgentes({ addToast }: { addToast: AddToast }) {
  const [savingSlug, setSavingSlug] = useState<string | null>(null);

  const { data: agents, isLoading } = useQuery({
    queryKey: ['anne-agents'],
    queryFn: async () => {
      const results = await Promise.all(
        AGENT_META.map(({ slug }) => api.get<{ agent: AnneAgent }>(`/api/v2/agentes/${slug}/knowledge`)),
      );
      return results.map((r, i) => {
        const raw = r.data as Record<string, unknown> | null;
        return (raw?.agent ?? raw) as AnneAgent ?? null;
      });
    },
    staleTime: 60_000,
  });

  const handleSave = async (slug: string, payload: { knowledge_base: string; enabled: boolean }) => {
    setSavingSlug(slug);
    const r = await api.post(`/api/v2/agentes/${slug}/knowledge`, payload);
    setSavingSlug(null);
    if (r.error) {
      addToast({ type: 'error',   title: `Erro ao salvar agente ${slug}` });
    } else {
      addToast({ type: 'success', title: 'Base de conhecimento salva!' });
    }
  };

  if (isLoading) return <TabLoader />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {AGENT_META.map((meta, i) => (
        <AgentCard
          key={meta.slug}
          meta={meta}
          agent={agents?.[i] ?? null}
          onSave={handleSave}
          isSaving={savingSlug === meta.slug}
        />
      ))}
    </div>
  );
}

// ─── Tab 5 — Sandbox ──────────────────────────────────────────────────────────

function TabSandbox({ addToast }: { addToast: AddToast }) {
  const [input,   setInput]   = useState('');
  const [fromMe,  setFromMe]  = useState(false);
  const [result,  setResult]  = useState<SandboxResult | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!input.trim()) return;
    setRunning(true);
    const r = await api.post<SandboxResult>('/api/v2/anne/sandbox', { text: input, from_me: fromMe });
    setRunning(false);
    if (r.error) {
      addToast({ type: 'error', title: 'Erro no sandbox', message: r.error });
    } else {
      setResult(r.data);
    }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
        <strong>Sandbox:</strong> Simule o pipeline da Anne sem afetar clientes reais.
        Cole uma mensagem como se fosse um cliente e veja o que a Anne faria.
      </div>

      <Card padding="md">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Mensagem de teste</h3>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && e.ctrlKey && run()}
          placeholder="Ex: Oi, quero saber o preço do vestido floral no atacado..."
          className="w-full h-28 p-3 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-crm-primary/30 focus:border-crm-primary bg-gray-50"
        />
        <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={fromMe}
              onChange={e => setFromMe(e.target.checked)}
              className="rounded accent-crm-primary"
            />
            Mensagem enviada por mim (from_me)
          </label>
          <PrimaryBtn loading={running} disabled={!input.trim()} onClick={run} icon={<FlaskConical size={14} />}>
            {running ? 'Simulando...' : 'Simular'}
          </PrimaryBtn>
        </div>
        <p className="text-xs text-gray-400 mt-2">Ctrl+Enter para simular</p>
      </Card>

      {result && (
        <div className="space-y-4 animate-in fade-in duration-300">
          {/* Cards de resultado */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card padding="sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Padrão Detectado</p>
              {result.event ? (
                <>
                  <p className="text-sm font-bold text-gray-900 mb-2">{result.event.trigger}</p>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-crm-primary rounded-full"
                      style={{ width: `${Math.round((result.event.score ?? 0) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{Math.round((result.event.score ?? 0) * 100)}% confiança</p>
                </>
              ) : (
                <p className="text-sm text-gray-400">Nenhum padrão detectado</p>
              )}
            </Card>

            <Card padding="sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Ação Prevista</p>
              <p className="text-sm text-gray-800 leading-relaxed">{result.action_preview || '—'}</p>
            </Card>

            <Card padding="sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Movimento Kanban</p>
              {result.kanban_move
                ? <Badge variant="info">{result.kanban_move}</Badge>
                : <p className="text-sm text-gray-400">Nenhum</p>
              }
            </Card>
          </div>

          {/* Sugestão de mensagem — estilo WhatsApp */}
          {result.message_suggestion && (
            <Card padding="sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Sugestão de Mensagem</p>
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl rounded-tl-none px-4 py-3 max-w-xs">
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {result.message_suggestion}
                </p>
              </div>
            </Card>
          )}

          {/* Chain of thought */}
          {(result.chain_of_thought?.length ?? 0) > 0 && (
            <Card padding="sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Raciocínio da Anne</p>
              <ol className="space-y-2">
                {result.chain_of_thought.map((step, i) => (
                  <li key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl text-sm text-gray-700 leading-relaxed">
                    <span className="shrink-0 text-base leading-snug">{COT_ICONS[i % COT_ICONS.length]}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared button primitives ─────────────────────────────────────────────────

function PrimaryBtn({
  children, loading, disabled, onClick, icon,
}: {
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="flex items-center gap-2 px-4 py-2 bg-crm-primary text-white rounded-xl text-sm font-semibold hover:bg-crm-primary/90 transition-colors disabled:opacity-50 shrink-0"
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

function SecondaryBtn({
  children, loading, disabled, onClick, icon,
}: {
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 shrink-0"
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

function TabLoader() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="animate-spin text-crm-primary" size={28} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type TabKey = 'conexao' | 'personalidade' | 'automacoes' | 'agentes' | 'sandbox';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'conexao',       label: 'Conexão',       icon: <Settings    size={15} /> },
  { key: 'personalidade', label: 'Personalidade', icon: <Brain       size={15} /> },
  { key: 'automacoes',    label: 'Automações',    icon: <Zap         size={15} /> },
  { key: 'agentes',       label: 'Agentes',       icon: <Bot         size={15} /> },
  { key: 'sandbox',       label: 'Sandbox',       icon: <FlaskConical size={15} /> },
];

export default function AnneConfigPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('conexao');
  const { addToast } = useUIStore();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['anne-stats'],
    queryFn: async () => { const r = await api.get<AnneStats>('/api/v2/anne/stats'); return r.data; },
    staleTime: 60_000,
    refetchInterval: 3 * 60_000,
  });

  const { data: tenantData } = useQuery({
    queryKey: ['tenant-config'],
    queryFn: async () => { const r = await api.get<TenantAIConfig>('/api/tenants/me'); return r.data; },
    staleTime: 60_000,
  });

  const isActive = !!tenantData?.openai_api_key;

  const kpis = [
    { label: 'Carrinhos recuperados hoje',  value: stats?.carts_recovered_today  ?? 0, icon: <ShoppingCart size={18} className="text-emerald-600" />, bg: 'bg-emerald-50' },
    { label: 'Automações disparadas hoje',  value: stats?.automations_fired_today ?? 0, icon: <Activity     size={18} className="text-blue-600"    />, bg: 'bg-blue-50'    },
    { label: 'Sugestões pendentes',         value: stats?.suggestions_pending     ?? 0, icon: <Zap          size={18} className="text-amber-600"   />, bg: 'bg-amber-50'   },
    { label: 'Carrinhos pendentes',         value: stats?.carts_pending           ?? 0, icon: <ShoppingCart size={18} className="text-purple-600"  />, bg: 'bg-purple-50'  },
  ];

  return (
    <div className="max-w-5xl mx-auto">

      {/* ── Page header ───────────────────────────────────────────── */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-crm-primary flex items-center justify-center shadow-sm shrink-0">
          <Bot size={22} className="text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">Anne IA</h1>
            <Badge variant={isActive ? 'success' : 'neutral'}>
              {isActive ? '● Anne Ativa' : '○ Anne Inativa'}
            </Badge>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">Configure a inteligência artificial da sua loja</p>
        </div>
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpis.map(kpi => (
          <div key={kpi.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            {statsLoading ? (
              <div className="space-y-2 animate-pulse">
                <div className="w-9 h-9 bg-gray-100 rounded-xl" />
                <div className="w-10 h-6 bg-gray-100 rounded" />
                <div className="w-28 h-3 bg-gray-100 rounded" />
              </div>
            ) : (
              <>
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-3', kpi.bg)}>
                  {kpi.icon}
                </div>
                <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-tight">{kpi.label}</p>
              </>
            )}
          </div>
        ))}
      </div>

      {/* ── Tab navigation ────────────────────────────────────────── */}
      <div className="flex items-center gap-0.5 border-b border-gray-200 mb-6 overflow-x-auto scrollbar-none">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0',
              activeTab === tab.key
                ? 'border-crm-primary text-crm-primary'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ───────────────────────────────────────────── */}
      {activeTab === 'conexao'       && <TabConexao       addToast={addToast} />}
      {activeTab === 'personalidade' && <TabPersonalidade addToast={addToast} />}
      {activeTab === 'automacoes'    && <TabAutomacoes    addToast={addToast} />}
      {activeTab === 'agentes'       && <TabAgentes       addToast={addToast} />}
      {activeTab === 'sandbox'       && <TabSandbox       addToast={addToast} />}
    </div>
  );
}
