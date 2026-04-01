'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bot, CheckCircle, XCircle, AlertTriangle, Sparkles,
  Copy, ChevronDown, ChevronUp, RefreshCw, Save,
  Zap, Eye, BarChart2, Brain, Search, Palette, MessageCircle,
  Key, Store, Activity, PenSquare, Settings2, CheckSquare,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';

/** Fetch autenticado — lê o token do store Zustand (persiste no localStorage) */
function authFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = useAuthStore.getState().accessToken;
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
}

/* ─── Tipos ────────────────────────────────────────────────────────────────── */

interface AgentStatus {
  anne: { active: boolean; provider: string; model: string };
  jose: { active: boolean; metaConnected: boolean; accountName?: string; lastRun?: string; metaError?: string };
  claudio: { active: boolean; hasApiKey: boolean };
  pedro: { active: boolean; hasApiKey: boolean };
  judite: { active: boolean; hasApiKey: boolean };
}

interface AITeamConfig {
  auto_reply_api_key: string;
  analytics_api_key: string;
  strategy_api_key: string;
  research_api_key: string;
  visual_api_key: string;
  meta_ad_account_id: string;
  meta_access_token: string;
  brand_produto: string;
  brand_publico: string;
  brand_ticket: string;
  brand_objetivo: string;
  analysis_enabled: boolean;
  research_enabled: boolean;
  visual_enabled: boolean;
  pause_roas_threshold: number;
  scale_roas_threshold: number;
}

interface AIAction {
  id: string;
  agent: string;
  action_type: string;
  alvo_nome: string;
  motivo: string;
  impacto_esperado: string;
  urgencia: string;
  status: string;
  created_at: string;
}

interface GeneratedCopy {
  id: string;
  headline: string;
  texto_principal: string;
  cta: string;
  publico_sugerido: string;
  justificativa: string;
  status: string;
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function actionLabel(tipo: string, alvoNome: string): string {
  const labels: Record<string, string> = {
    pausar_anuncio: `Pausar "${alvoNome}"`,
    escalar_orcamento: `Aumentar orçamento de "${alvoNome}"`,
    reduzir_orcamento: `Reduzir orçamento de "${alvoNome}"`,
    criar_copy: `Criar novo anúncio para substituir "${alvoNome}"`,
    testar_publico: `Testar novo público para "${alvoNome}"`,
  };
  return labels[tipo] || `${tipo}: "${alvoNome}"`;
}

function urgenciaBadge(urgencia: string) {
  if (urgencia === 'imediata') return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">Urgente</span>;
  if (urgencia === 'proximas_24h') return <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">24h</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">Esta semana</span>;
}

function agentIcon(agent: string): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    jose:      <BarChart2 size={14} className="text-blue-500" />,
    claudio:   <Brain size={14} className="text-purple-500" />,
    pedro:     <Search size={14} className="text-orange-500" />,
    judite:    <Palette size={14} className="text-pink-500" />,
    sentinela: <Eye size={14} className="text-indigo-500" />,
  };
  return icons[agent] || <Bot size={14} className="text-gray-500" />;
}

/* ─── Card de status de agente ───────────────────────────────────────────────── */

interface AgentCardProps {
  icon: React.ReactNode;
  nome: string;
  funcao: string;
  modelo: string;
  ativo: boolean;
  configurado: boolean;
  metrica?: string;
  onConfigure?: () => void;
}

function AgentCard({ icon, nome, funcao, modelo, ativo, configurado, metrica, onConfigure }: AgentCardProps) {
  const statusColor = !configurado ? 'border-yellow-300 bg-yellow-50' : ativo ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50';
  const dotCls = !configurado ? 'bg-amber-400' : ativo ? 'bg-green-500' : 'bg-gray-400';
  const label = !configurado ? 'Configurar' : ativo ? 'Ativo' : 'Aguardando';
  const labelCls = !configurado ? 'text-amber-700' : ativo ? 'text-green-700' : 'text-gray-500';

  return (
    <div className={`rounded-xl border-2 p-4 flex flex-col gap-2 ${statusColor}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{nome}</p>
            <p className="text-xs text-gray-500">{modelo}</p>
          </div>
        </div>
        <span className={`flex items-center gap-1 text-xs font-medium ${labelCls}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
          {label}
        </span>
      </div>
      <p className="text-xs text-gray-600">{funcao}</p>
      {metrica && <p className="text-xs font-medium text-gray-700">{metrica}</p>}
      {!configurado && onConfigure && (
        <button
          onClick={onConfigure}
          className="mt-1 text-xs px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-medium transition-colors"
        >
          Configurar agora
        </button>
      )}
    </div>
  );
}

/* ─── Card de ação aguardando aprovação ─────────────────────────────────────── */

interface ActionCardProps {
  action: AIAction;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

function ActionCard({ action, onApprove, onReject }: ActionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    setLoading(true);
    await onApprove(action.id);
    setLoading(false);
  }

  async function handleReject() {
    setLoading(true);
    await onReject(action.id);
    setLoading(false);
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="flex items-center">{agentIcon(action.agent)}</span>
            <span className="font-medium text-gray-900 text-sm">
              {actionLabel(action.action_type, action.alvo_nome)}
            </span>
            {urgenciaBadge(action.urgencia)}
          </div>
          <p className="text-sm text-gray-600">{action.motivo}</p>

          {expanded && (
            <div className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 space-y-1">
              <p><strong>Impacto esperado:</strong> {action.impacto_esperado}</p>
              <p className="flex items-center gap-1"><strong>Sugerido por:</strong> {agentIcon(action.agent)} {action.agent}</p>
            </div>
          )}
        </div>

        <button
          onClick={() => setExpanded(e => !e)}
          className="text-gray-400 hover:text-gray-600 flex-shrink-0"
          aria-label="Ver detalhes"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={handleApprove}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          <CheckCircle size={14} /> Aprovar
        </button>
        <button
          onClick={handleReject}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition-colors disabled:opacity-50"
        >
          <XCircle size={14} /> Rejeitar
        </button>
        <button
          onClick={() => setExpanded(e => !e)}
          className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
          aria-label="Ver detalhes"
        >
          <Eye size={14} />
        </button>
      </div>
    </div>
  );
}

/* ─── Card de copy gerado ────────────────────────────────────────────────────── */

interface CopyCardProps {
  copy: GeneratedCopy;
  onDiscard: (id: string) => void;
}

function CopyCard({ copy, onDiscard }: CopyCardProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const text = `${copy.headline}\n\n${copy.texto_principal}\n\n${copy.cta}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
      <div className="space-y-2 mb-3">
        <p className="font-semibold text-gray-900 text-sm">{copy.headline}</p>
        <p className="text-sm text-gray-600 leading-relaxed">{copy.texto_principal}</p>
        <span className="inline-block px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
          {copy.cta}
        </span>
      </div>

      {copy.publico_sugerido && (
        <p className="text-xs text-gray-500 mb-3">
          <strong>Público:</strong> {copy.publico_sugerido}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        >
          <Copy size={13} />
          {copied ? 'Copiado!' : 'Copiar texto'}
        </button>
        <button
          onClick={() => onDiscard(copy.id)}
          className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
          aria-label="Descartar"
        >
          <XCircle size={14} />
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   PAGE PRINCIPAL
   ═══════════════════════════════════════════════════════════════════════════════ */

export default function TimeIAPage() {
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [actions, setActions] = useState<AIAction[]>([]);
  const [copies, setCopies] = useState<GeneratedCopy[]>([]);
  const [config, setConfig] = useState<AITeamConfig>({
    auto_reply_api_key: '', analytics_api_key: '', strategy_api_key: '',
    research_api_key: '', visual_api_key: '', meta_ad_account_id: '',
    meta_access_token: '', brand_produto: '', brand_publico: '',
    brand_ticket: '', brand_objetivo: '', analysis_enabled: false,
    research_enabled: false, visual_enabled: false,
    pause_roas_threshold: 1.5, scale_roas_threshold: 3.0,
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [runningAnalysis, setRunningAnalysis] = useState(false);
  const [activeTab, setActiveTab] = useState<'aprovacao' | 'copies' | 'config'>('aprovacao');

  const loadData = useCallback(async () => {
    try {
      const [statusRes, actionsRes, copiesRes, configRes] = await Promise.all([
        authFetch('/api/ai-team/status'),
        authFetch('/api/ai-team/actions?status=pending_approval'),
        authFetch('/api/ai-team/copies?status=draft'),
        authFetch('/api/ai-team/config'),
      ]);

      if (statusRes.ok) setAgentStatus(await statusRes.json());
      if (actionsRes.ok) {
        const data = await actionsRes.json();
        setActions(data.data || []);
      }
      if (copiesRes.ok) {
        const data = await copiesRes.json();
        setCopies(data.data || []);
      }
      if (configRes.ok) {
        const data = await configRes.json();
        if (data.config) {
          setConfig(prev => ({ ...prev, ...data.config }));
        }
      }
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleApprove(id: string) {
    await authFetch(`/api/ai-team/actions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    setActions(prev => prev.filter(a => a.id !== id));
  }

  async function handleReject(id: string) {
    await authFetch(`/api/ai-team/actions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected' }),
    });
    setActions(prev => prev.filter(a => a.id !== id));
  }

  async function handleDiscardCopy(id: string) {
    await authFetch('/api/ai-team/copies', {
      method: 'PATCH',
      body: JSON.stringify({ id, status: 'discarded' }),
    });
    setCopies(prev => prev.filter(c => c.id !== id));
  }

  async function handleSaveConfig() {
    setSavingConfig(true);
    try {
      await authFetch('/api/ai-team/config', {
        method: 'PUT',
        body: JSON.stringify(config),
      });
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
      await loadData();
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleRunAnalysis() {
    setRunningAnalysis(true);
    try {
      await authFetch('/api/cron/ai-team', { method: 'POST' });
      await new Promise(r => setTimeout(r, 2000)); // aguardar processamento
      await loadData();
    } finally {
      setRunningAnalysis(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 flex items-center gap-2">
          <RefreshCw size={18} className="animate-spin" />
          Carregando time de IAs...
        </div>
      </div>
    );
  }

  const urgentActions = actions.filter(a => a.urgencia === 'imediata');

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bot size={24} className="text-indigo-600" />
            Time de IAs
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Suas IAs especializadas trabalhando em conjunto — você aprova antes de executar
          </p>
        </div>
        <button
          onClick={handleRunAnalysis}
          disabled={runningAnalysis}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
        >
          {runningAnalysis
            ? <><RefreshCw size={14} className="animate-spin" /> Analisando...</>
            : <><Zap size={14} /> Analisar agora</>}
        </button>
      </div>

      {/* Alerta de ações urgentes */}
      {urgentActions.length > 0 && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">
            <strong>{urgentActions.length} ação urgente</strong> aguardando aprovação —
            {urgentActions[0]?.motivo}
          </p>
        </div>
      )}

      {/* Cards dos agentes */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <AgentCard
          icon={<MessageCircle size={20} className="text-emerald-500" />}
          nome="Anne"
          funcao="Atendimento WhatsApp"
          modelo={agentStatus?.anne.model || 'llama-3.3-70b-versatile'}
          ativo={agentStatus?.anne.active ?? true}
          configurado={true}
          metrica="Sempre ativa"
        />
        <AgentCard
          icon={<BarChart2 size={20} className="text-blue-500" />}
          nome="José"
          funcao="Análise de métricas"
          modelo="gpt-4o-mini"
          ativo={agentStatus?.jose.active ?? false}
          configurado={agentStatus?.jose.metaConnected ?? false}
          metrica={agentStatus?.jose.accountName
            ? `Conta: ${agentStatus.jose.accountName}`
            : agentStatus?.jose.lastRun
              ? `Últ: ${new Date(agentStatus.jose.lastRun).toLocaleDateString('pt-BR')}`
              : undefined}
        />
        <AgentCard
          icon={<Brain size={20} className="text-purple-500" />}
          nome="Cláudio"
          funcao="Estratégia + Copies"
          modelo="claude-haiku-4-5"
          ativo={agentStatus?.claudio.active ?? false}
          configurado={agentStatus?.claudio.hasApiKey ?? false}
          metrica={copies.length > 0 ? `${copies.length} copies prontos` : undefined}
        />
        <AgentCard
          icon={<Search size={20} className="text-orange-500" />}
          nome="Pedro"
          funcao="Tendências de mercado"
          modelo="Perplexity Sonar"
          ativo={agentStatus?.pedro.active ?? false}
          configurado={agentStatus?.pedro.hasApiKey ?? false}
        />
        <AgentCard
          icon={<Palette size={20} className="text-pink-500" />}
          nome="Judite"
          funcao="Avaliação de criativos"
          modelo="Gemini 2.0 Flash"
          ativo={agentStatus?.judite.active ?? false}
          configurado={agentStatus?.judite.hasApiKey ?? false}
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0">
          {([
            { key: 'aprovacao', label: 'Fila de Aprovação', icon: <CheckSquare size={14} />, count: actions.length },
            { key: 'copies',    label: 'Copies do Cláudio', icon: <PenSquare size={14} />,  count: copies.length },
            { key: 'config',    label: 'Configurações',     icon: <Settings2 size={14} />,  count: 0 },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Fila de aprovação */}
      {activeTab === 'aprovacao' && (
        <div>
          {actions.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <CheckCircle size={40} className="mx-auto mb-3 opacity-40" />
              <p className="font-medium">Nenhuma ação aguardando aprovação</p>
              <p className="text-sm mt-1">Clique em "Analisar agora" para o time gerar sugestões</p>
            </div>
          ) : (
            <div className="space-y-3">
              {actions.map(action => (
                <ActionCard
                  key={action.id}
                  action={action}
                  onApprove={handleApprove}
                  onReject={handleReject}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Copies */}
      {activeTab === 'copies' && (
        <div>
          {copies.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Sparkles size={40} className="mx-auto mb-3 opacity-40" />
              <p className="font-medium">Nenhum copy gerado ainda</p>
              <p className="text-sm mt-1">O Cláudio gera copies após analisar suas campanhas</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {copies.map(copy => (
                <CopyCard
                  key={copy.id}
                  copy={copy}
                  onDiscard={handleDiscardCopy}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Configurações */}
      {activeTab === 'config' && (
        <div className="space-y-6">

          {/* API Keys */}
          <div className="border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Key size={16} className="text-gray-500" /> API Keys dos Agentes</h3>
            <p className="text-xs text-gray-500">
              Cole a chave de cada IA abaixo. As keys ficam salvas com segurança no banco de dados.
              Campos em branco mantêm a key atual.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><MessageCircle size={13} className="text-emerald-500" /> Anne — Groq API Key <span className="text-xs text-green-600">(gratuita)</span></span>
                <p className="text-xs text-gray-400 mb-1">console.groq.com → API Keys</p>
                <input
                  type="password"
                  placeholder={config.auto_reply_api_key ? '••••••••' : 'gsk_...'}
                  value={config.auto_reply_api_key === '••••••••' ? '' : config.auto_reply_api_key}
                  onChange={e => setConfig(c => ({ ...c, auto_reply_api_key: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><BarChart2 size={13} className="text-blue-500" /> José — OpenAI API Key</span>
                <p className="text-xs text-gray-400 mb-1">platform.openai.com → API Keys</p>
                <input
                  type="password"
                  placeholder={config.analytics_api_key ? '••••••••' : 'sk-...'}
                  value={config.analytics_api_key === '••••••••' ? '' : config.analytics_api_key}
                  onChange={e => setConfig(c => ({ ...c, analytics_api_key: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Brain size={13} className="text-purple-500" /> Cláudio — OpenAI API Key</span>
                <p className="text-xs text-gray-400 mb-1">platform.openai.com → API Keys</p>
                <input
                  type="password"
                  placeholder={config.strategy_api_key ? '••••••••' : 'sk-...'}
                  value={config.strategy_api_key === '••••••••' ? '' : config.strategy_api_key}
                  onChange={e => setConfig(c => ({ ...c, strategy_api_key: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Search size={13} className="text-orange-500" /> Pedro — OpenAI API Key</span>
                <p className="text-xs text-gray-400 mb-1">platform.openai.com → API Keys</p>
                <input
                  type="password"
                  placeholder={config.research_api_key ? '••••••••' : 'sk-...'}
                  value={config.research_api_key === '••••••••' ? '' : config.research_api_key}
                  onChange={e => setConfig(c => ({ ...c, research_api_key: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Palette size={13} className="text-pink-500" /> Judite — OpenAI API Key</span>
                <p className="text-xs text-gray-400 mb-1">platform.openai.com → API Keys</p>
                <input
                  type="password"
                  placeholder={config.visual_api_key ? '••••••••' : 'sk-...'}
                  value={config.visual_api_key === '••••••••' ? '' : config.visual_api_key}
                  onChange={e => setConfig(c => ({ ...c, visual_api_key: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
            </div>
          </div>

          {/* Meta Ads */}
          <div className="border border-gray-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2"><BarChart2 size={16} className="text-blue-500" /> Conta de Anúncios (Meta Ads)</h3>
              <span className="text-xs">
                {agentStatus?.jose.metaConnected
                  ? <span className="flex items-center gap-1.5 text-green-600"><span className="w-2 h-2 rounded-full bg-green-500" />{agentStatus.jose.accountName || 'Conectado'}</span>
                  : <span className="flex items-center gap-1.5 text-red-500"><span className="w-2 h-2 rounded-full bg-red-500" />Não conectado{agentStatus?.jose.metaError ? ` — ${agentStatus.jose.metaError}` : ''}</span>}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">ID da Conta de Anúncios</span>
                <p className="text-xs text-gray-400 mb-1">business.facebook.com → Contas de anúncios</p>
                <input
                  type="text"
                  placeholder="act_123456789"
                  value={config.meta_ad_account_id}
                  onChange={e => setConfig(c => ({ ...c, meta_ad_account_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">Token de Acesso Meta</span>
                <p className="text-xs text-gray-400 mb-1">Meta Graph Explorer → token 60 dias</p>
                <input
                  type="password"
                  placeholder={config.meta_access_token ? '••••••••' : 'EAAx...'}
                  value={config.meta_access_token === '••••••••' ? '' : config.meta_access_token}
                  onChange={e => setConfig(c => ({ ...c, meta_access_token: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
            </div>
          </div>

          {/* Contexto da marca */}
          <div className="border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Store size={16} className="text-gray-500" /> Contexto da Marca</h3>
            <p className="text-xs text-gray-500">O Cláudio usa essas informações para gerar estratégias e copies relevantes.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Produto / Nicho</span>
                <input
                  type="text"
                  placeholder="Ex: rasteirinhas femininas para revenda"
                  value={config.brand_produto}
                  onChange={e => setConfig(c => ({ ...c, brand_produto: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">Público-alvo</span>
                <input
                  type="text"
                  placeholder="Ex: mulheres 25-45, renda C/B, sul/sudeste"
                  value={config.brand_publico}
                  onChange={e => setConfig(c => ({ ...c, brand_publico: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">Ticket Médio</span>
                <input
                  type="text"
                  placeholder="Ex: R$ 120-350"
                  value={config.brand_ticket}
                  onChange={e => setConfig(c => ({ ...c, brand_ticket: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">Objetivo das Campanhas</span>
                <input
                  type="text"
                  placeholder="Ex: geração de leads para revendedoras"
                  value={config.brand_objetivo}
                  onChange={e => setConfig(c => ({ ...c, brand_objetivo: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
            </div>
          </div>

          {/* Ativar agentes */}
          <div className="border border-gray-200 rounded-xl p-5 space-y-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Activity size={16} className="text-indigo-500" /> Ativar Agentes</h3>
            <div className="space-y-3">
              {([
                { key: 'analysis_enabled', label: 'José + Cláudio — Análise diária de Meta Ads', desc: 'Roda todo dia às 08h automaticamente' },
                { key: 'research_enabled', label: 'Pedro — Pesquisa de tendências', desc: 'Executa junto com a análise diária' },
                { key: 'visual_enabled', label: 'Judite — Avaliação de criativos', desc: 'Avalia imagens de anúncios na análise' },
              ] as const).map(item => (
                <label key={item.key} className="flex items-start gap-3 cursor-pointer group">
                  <div className="relative flex-shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      checked={config[item.key]}
                      onChange={e => setConfig(c => ({ ...c, [item.key]: e.target.checked }))}
                      className="sr-only"
                    />
                    <div
                      className={`w-10 h-6 rounded-full transition-colors ${config[item.key] ? 'bg-indigo-600' : 'bg-gray-200'}`}
                      onClick={() => setConfig(c => ({ ...c, [item.key]: !c[item.key] }))}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mt-1 ${config[item.key] ? 'translate-x-5' : 'translate-x-1'}`} />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{item.label}</p>
                    <p className="text-xs text-gray-500">{item.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Botão salvar */}
          <button
            onClick={handleSaveConfig}
            disabled={savingConfig}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors disabled:opacity-60"
          >
            {savingConfig
              ? <><RefreshCw size={16} className="animate-spin" /> Salvando...</>
              : configSaved
                ? <><CheckCircle size={16} /> Salvo com sucesso!</>
                : <><Save size={16} /> Salvar configurações</>}
          </button>
        </div>
      )}
    </div>
  );
}
