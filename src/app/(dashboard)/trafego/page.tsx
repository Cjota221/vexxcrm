'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';

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
import {
  RefreshCw, TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  Clock, ChevronRight, ChevronLeft, Copy, Pause, Play, Users,
  Image as ImageIcon, FileText, BarChart3, Zap, Target, X,
  Edit2, DollarSign, Loader2, ChevronDown, AlertOctagon, CloudDownload,
  Plus, Globe, Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─── Tipos ────────────────────────────────────────────────────────────────── */

interface CampaignAlert {
  tipo: 'danger' | 'warning';
  mensagem: string;
  acao?: string;
}

interface Campaign {
  id: string;
  nome: string;
  status: string;
  effective_status?: string;
  objetivo: string;
  spend: number;
  revenue: number;
  leads: number;
  clicks: number;
  impressions: number;
  reach: number;
  cpc: number;
  cpm: number;
  ctr: number;
  roas: number;
  cpl: number;
  frequency: number;
  orcamento_diario: number | null;
  date_start?: string;
  date_stop?: string;
  alerts: CampaignAlert[];
  health: 'great' | 'ok' | 'bad' | 'paused';
}

interface Summary {
  totalSpend: number;
  totalRevenue: number;
  totalLeads: number;
  totalClicks: number;
  totalRoas: number;
  totalCpl: number;
  totalCpc: number;
}

interface MetricsData {
  connected: boolean;
  accountName?: string;
  period?: string;
  lastAnalysis?: string | null;
  summary?: Summary;
  campaigns?: Campaign[];
  error?: string;
  fromCache?: boolean;
  cacheWarning?: string;
  lastSync?: string;
}

interface Criativo {
  id: string;
  tenant_id?: string;
  nome?: string;
  tipo: string;
  thumbnail_url?: string;
  url?: string;
  formato?: string;
  sincronizado_em?: string;
}

type Period = '1d' | '7d' | '15d' | '30d';
type Tab = 'campanhas' | 'criativos' | 'publicos' | 'textos';

/* ─── Formatadores ─────────────────────────────────────────────────────────── */

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}
function brl2(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}
function n0(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}
function pct(v: number): string {
  return v.toFixed(1) + '%';
}
function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return `hoje às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  return formatDate(iso);
}

/* ─── Sub-componentes ──────────────────────────────────────────────────────── */

function PeriodBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
        active ? 'bg-crm-primary text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      )}
    >
      {label}
    </button>
  );
}

function MetricCard({
  label, value, sub, badge, badgeColor, icon,
}: {
  label: string;
  value: string;
  sub?: string;
  badge?: string;
  badgeColor?: 'green' | 'yellow' | 'red' | 'gray';
  icon: React.ReactNode;
}) {
  const badgeStyles = {
    green:  'bg-green-100 text-green-700',
    yellow: 'bg-amber-100 text-amber-700',
    red:    'bg-red-100 text-red-700',
    gray:   'bg-gray-100 text-gray-600',
  };
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between mb-3">
        <div className="text-gray-400">{icon}</div>
        {badge && (
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', badgeStyles[badgeColor || 'gray'])}>
            {badge}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function HealthBadge({ health }: { health: Campaign['health'] }) {
  const map = {
    great:  { label: 'Ótima',   dotCls: 'bg-green-500', cls: 'bg-green-100 text-green-700' },
    ok:     { label: 'Atenção', dotCls: 'bg-amber-400', cls: 'bg-amber-100 text-amber-700' },
    bad:    { label: 'Pausar',  dotCls: 'bg-red-500',   cls: 'bg-red-100 text-red-700' },
    paused: { label: 'Pausada', dotCls: 'bg-gray-400',  cls: 'bg-gray-100 text-gray-600' },
  };
  const { label, dotCls, cls } = map[health];
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap', cls)}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotCls)} />
      {label}
    </span>
  );
}

function EffectiveStatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const map: Record<string, { label: string; cls: string }> = {
    ACTIVE:              { label: 'Rodando',       cls: 'bg-green-100 text-green-700' },
    PAUSED:              { label: 'Pausada',        cls: 'bg-gray-100 text-gray-600' },
    DELETED:             { label: 'Deletada',       cls: 'bg-red-100 text-red-700' },
    ARCHIVED:            { label: 'Arquivada',      cls: 'bg-gray-100 text-gray-500' },
    WITH_ISSUES:         { label: 'Com problema',   cls: 'bg-red-100 text-red-700' },
    IN_PROCESS:          { label: 'Processando',    cls: 'bg-blue-100 text-blue-700' },
    PENDING_REVIEW:      { label: 'Em revisão',     cls: 'bg-amber-100 text-amber-700' },
    DISAPPROVED:         { label: 'Reprovada',      cls: 'bg-red-100 text-red-700' },
    LEARNING:            { label: 'Aprendendo',     cls: 'bg-violet-100 text-violet-700' },
    LEARNING_LIMITED:    { label: 'Aprendiz. limitada', cls: 'bg-violet-100 text-violet-600' },
    CAMPAIGN_PAUSED:     { label: 'Campanha pausada', cls: 'bg-gray-100 text-gray-600' },
  };
  const entry = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap', entry.cls)}>
      {entry.label}
    </span>
  );
}

/* ─── Painel lateral de campanha ───────────────────────────────────────────── */

const CTA_OPTIONS = [
  'Saiba mais', 'Comprar agora', 'Cadastrar', 'Entrar em contato',
  'Enviar mensagem', 'Falar agora', 'Ver oferta', 'Quero ser franqueada',
];

function CampaignDetailPanel({
  campaign,
  onClose,
  onActionComplete,
}: {
  campaign: Campaign;
  onClose: () => void;
  onActionComplete: (message: string) => void;
}) {
  const [editMode, setEditMode] = useState<null | 'texto' | 'orcamento' | 'publico' | 'criativo'>(null);
  const [confirm, setConfirm] = useState<null | { action: string; label: string; cls?: string }>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  // Text editor state
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [cta, setCta] = useState(CTA_OPTIONS[0]);

  // Budget editor state
  const orcamentoAtual = campaign.orcamento_diario ? campaign.orcamento_diario / 100 : 0;
  const [novoOrcamento, setNovoOrcamento] = useState(String(orcamentoAtual));
  const maxOrcamento = orcamentoAtual * 1.3;
  const novoOrcamentoNum = parseFloat(novoOrcamento) || 0;
  const overLimit = novoOrcamentoNum > maxOrcamento && orcamentoAtual > 0;

  // Audience editor state
  const [adsets, setAdsets] = useState<Array<{ id: string; name: string; targeting?: Record<string, unknown> }>>([]);
  const [loadingAdsets, setLoadingAdsets] = useState(false);
  const [pubIdadeMin, setPubIdadeMin] = useState('18');
  const [pubIdadeMax, setPubIdadeMax] = useState('65');
  const [pubGenero, setPubGenero] = useState<'0' | '1' | '2'>('0');

  // Campaign ads state
  const [campaignAds, setCampaignAds] = useState<Array<{
    id: string; name: string; status: string;
    adset_name: string;
    creative?: { id: string; name?: string; body?: string; title?: string; thumbnail_url?: string; call_to_action_type?: string };
  }>>([]);
  const [loadingAds, setLoadingAds] = useState(false);
  const [adsLoaded, setAdsLoaded] = useState(false);

  // Swap creative state
  const [swapTitulo, setSwapTitulo] = useState('');
  const [swapTexto, setSwapTexto] = useState('');
  const [swapCta, setSwapCta] = useState('LEARN_MORE');
  const [swapUrl, setSwapUrl] = useState('');
  const [swapImg, setSwapImg] = useState('');

  async function callEditor(body: Record<string, unknown>) {
    setActionLoading(true);
    setPanelError(null);
    try {
      const res = await authFetch('/api/trafego/editor', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const json = await res.json() as { ok?: boolean; error?: string; aplicado?: number; erro?: string };
      if (!res.ok || !json.ok) {
        setPanelError(json.error || json.erro || 'Erro desconhecido');
        return false;
      }
      return json;
    } catch (e) {
      setPanelError(String(e));
      return false;
    } finally {
      setActionLoading(false);
    }
  }

  async function handleConfirmedAction() {
    if (!confirm) return;
    let result;
    if (confirm.action === 'pausar') {
      result = await callEditor({ action: 'alterar_status', campaign_id: campaign.id, status: 'PAUSED' });
      if (result) { onActionComplete('Campanha pausada com sucesso.'); onClose(); }
    } else if (confirm.action === 'ativar') {
      result = await callEditor({ action: 'alterar_status', campaign_id: campaign.id, status: 'ACTIVE' });
      if (result) { onActionComplete('Campanha ativada com sucesso.'); onClose(); }
    } else if (confirm.action === 'duplicar') {
      result = await callEditor({ action: 'duplicar', campaign_id: campaign.id });
      if (result) { onActionComplete('Campanha duplicada — aparecerá em "Pausada" no Meta Ads.'); onClose(); }
    }
    if (result) setConfirm(null);
  }

  async function handleSalvarTexto() {
    const result = await callEditor({
      action: 'editar_texto',
      campaign_id: campaign.id,
      titulo: titulo.trim(),
      texto_principal: texto.trim(),
      cta,
    });
    if (result) {
      onActionComplete('Texto do anúncio atualizado com sucesso.');
      setEditMode(null);
    }
  }

  async function handleSalvarOrcamento() {
    const result = await callEditor({
      action: 'mudar_orcamento',
      campaign_id: campaign.id,
      novo_orcamento_diario: Math.round(novoOrcamentoNum * 100),
    });
    if (result) {
      const json = result as { aplicado?: number };
      const aplicado = json.aplicado ? (json.aplicado / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
      onActionComplete(`Orçamento atualizado para ${aplicado}/dia.`);
      setEditMode(null);
    }
  }

  async function loadCampaignAds() {
    if (adsLoaded) return;
    setLoadingAds(true);
    try {
      const res = await authFetch(`/api/trafego/campaign-ads?campaign_id=${campaign.id}`);
      if (res.ok) {
        const json = await res.json() as { ads: typeof campaignAds };
        setCampaignAds(json.ads || []);
        setAdsLoaded(true);
      }
    } catch { /* silencioso */ }
    finally { setLoadingAds(false); }
  }

  async function openPublico() {
    setEditMode('publico');
    setLoadingAdsets(true);
    try {
      const res = await authFetch(`/api/trafego/audience?campaign_id=${campaign.id}`);
      if (res.ok) {
        const json = await res.json() as { adsets: Array<{ id: string; name: string; targeting?: Record<string, unknown> }> };
        setAdsets(json.adsets || []);
        const first = json.adsets?.[0];
        if (first?.targeting) {
          const t = first.targeting as { age_min?: number; age_max?: number; genders?: number[] };
          if (t.age_min) setPubIdadeMin(String(t.age_min));
          if (t.age_max) setPubIdadeMax(String(t.age_max));
          if (t.genders?.[0]) setPubGenero(String(t.genders[0]) as '1' | '2');
        }
      }
    } catch { /* silencioso */ }
    finally { setLoadingAdsets(false); }
  }

  async function handleSalvarPublico() {
    if (adsets.length === 0) return;
    setActionLoading(true);
    setPanelError(null);
    try {
      const res = await authFetch('/api/trafego/audience', {
        method: 'PATCH',
        body: JSON.stringify({
          adset_id: adsets[0].id,
          targeting: {
            paises: ['BR'],
            idade_min: parseInt(pubIdadeMin) || 18,
            idade_max: parseInt(pubIdadeMax) || 65,
            genero: parseInt(pubGenero),
          },
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) { setPanelError(json.error || 'Erro ao salvar público'); return; }
      onActionComplete('Público atualizado com sucesso.');
      setEditMode(null);
    } catch (e) {
      setPanelError(String(e));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleTrocarCriativo() {
    setActionLoading(true);
    setPanelError(null);
    try {
      const res = await authFetch('/api/trafego/swap-creative', {
        method: 'POST',
        body: JSON.stringify({
          ad_id: campaign.id, // uses campaign id; backend will find the ad
          titulo: swapTitulo.trim(),
          texto: swapTexto.trim(),
          cta: swapCta,
          url_destino: swapUrl.trim(),
          image_url: swapImg.trim() || undefined,
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) { setPanelError(json.error || 'Erro ao trocar criativo'); return; }
      onActionComplete('Criativo trocado com sucesso — o anúncio ficará em revisão por alguns minutos.');
      setEditMode(null);
    } catch (e) {
      setPanelError(String(e));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <>
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900 text-lg leading-tight">{campaign.nome}</h2>
            <div className="flex items-center gap-2 mt-1">
              <HealthBadge health={campaign.health} />
              {campaign.orcamento_diario && (
                <span className="text-xs text-gray-400">{brl(campaign.orcamento_diario / 100)}/dia</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Error banner */}
          {panelError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>{panelError}</span>
            </div>
          )}

          {/* Alertas */}
          {campaign.alerts.length > 0 && (
            <div className="space-y-2">
              {campaign.alerts.map((alert, i) => (
                <div
                  key={i}
                  className={cn(
                    'p-3 rounded-xl text-sm',
                    alert.tipo === 'danger' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'
                  )}
                >
                  <span className={cn('inline-block w-2 h-2 rounded-full mr-1.5 shrink-0', alert.tipo === 'danger' ? 'bg-red-500' : 'bg-amber-400')} />
                {alert.mensagem}
                </div>
              ))}
            </div>
          )}

          {/* Anúncios da campanha */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Anúncios</h3>
              {!adsLoaded && (
                <button
                  onClick={loadCampaignAds}
                  disabled={loadingAds}
                  className="text-xs text-crm-primary hover:underline flex items-center gap-1"
                >
                  {loadingAds ? <Loader2 size={11} className="animate-spin" /> : null}
                  {loadingAds ? 'Carregando...' : 'Ver anúncios'}
                </button>
              )}
              {adsLoaded && (
                <button
                  onClick={() => { setAdsLoaded(false); setCampaignAds([]); }}
                  className="text-xs text-gray-400 hover:underline"
                >
                  Ocultar
                </button>
              )}
            </div>
            {adsLoaded && campaignAds.length === 0 && (
              <p className="text-xs text-gray-400">Nenhum anúncio encontrado nesta campanha.</p>
            )}
            {adsLoaded && campaignAds.length > 0 && (
              <div className="space-y-2">
                {campaignAds.map(ad => (
                  <div key={ad.id} className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-start gap-2">
                      {ad.creative?.thumbnail_url ? (
                        <img src={ad.creative.thumbnail_url} alt={ad.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center shrink-0">
                          <ImageIcon size={16} className="text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-800 truncate">{ad.creative?.title || ad.name}</div>
                        {ad.creative?.body && (
                          <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ad.creative.body}</div>
                        )}
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={cn(
                            'inline-flex items-center gap-1 text-xs font-medium',
                            ad.status === 'ACTIVE' ? 'text-green-600' : 'text-gray-400'
                          )}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', ad.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-300')} />
                            {ad.status === 'ACTIVE' ? 'Ativo' : ad.status === 'PAUSED' ? 'Pausado' : ad.status}
                          </span>
                          <span className="text-xs text-gray-300">·</span>
                          <span className="text-xs text-gray-400">{ad.adset_name}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Métricas */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Números do período</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Gastei', value: brl(campaign.spend) },
                { label: 'Retorno', value: brl(campaign.revenue), sub: `${campaign.roas.toFixed(1)}x ROAS` },
                { label: 'Leads', value: n0(campaign.leads), sub: campaign.leads > 0 ? `${brl2(campaign.cpl)}/lead` : '—' },
                { label: 'Cliques', value: n0(campaign.clicks), sub: `${brl2(campaign.cpc)}/clique` },
                { label: 'Alcance', value: n0(campaign.reach) },
                { label: 'Impressões', value: n0(campaign.impressions) },
                { label: 'Taxa de clique', value: pct(campaign.ctr) },
                { label: 'Frequência', value: campaign.frequency.toFixed(1) + 'x', sub: campaign.frequency > 4 ? '⚠️ saturando' : 'normal' },
              ].map(({ label, value, sub }) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs text-gray-500">{label}</div>
                  <div className="font-bold text-gray-900">{value}</div>
                  {sub && <div className="text-xs text-gray-400">{sub}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Período */}
          {campaign.date_start && (
            <div className="text-xs text-gray-400 text-center">
              {formatDate(campaign.date_start)} — {campaign.date_stop ? formatDate(campaign.date_stop) : 'hoje'}
            </div>
          )}

          {/* ─── Editor de Texto ────────────────────────────────────────── */}
          {editMode === 'texto' ? (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-blue-900 text-sm">Editar texto do anúncio</h3>
                <button onClick={() => setEditMode(null)} className="text-blue-400 hover:text-blue-600">
                  <X size={16} />
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-blue-800 mb-1">
                  Título <span className="font-normal text-blue-500">({titulo.length}/40)</span>
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex: Direto da fábrica pra você revender"
                  className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-blue-800 mb-1">
                  Texto principal <span className="font-normal text-blue-500">({texto.length}/125)</span>
                </label>
                <textarea
                  maxLength={125}
                  rows={3}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Ex: Rasteirinhas de R$25 a R$49,90 — mínimo 5 pares..."
                  className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-blue-800 mb-1">Botão de ação (CTA)</label>
                <div className="relative">
                  <select
                    value={cta}
                    onChange={(e) => setCta(e.target.value)}
                    className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 pr-8"
                  >
                    {CTA_OPTIONS.map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" />
                </div>
              </div>
              <div className="bg-amber-50 rounded-xl px-3 py-2 text-xs text-amber-700">
                ⚠️ O Meta cria um novo criativo — o anúncio pode ficar pausado por alguns minutos durante a revisão.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditMode(null)}
                  className="flex-1 px-3 py-2 rounded-xl border border-blue-200 text-blue-700 text-sm font-medium hover:bg-blue-100"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSalvarTexto}
                  disabled={actionLoading || !titulo.trim() || !texto.trim()}
                  className="flex-1 px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading && <Loader2 size={13} className="animate-spin" />}
                  Salvar texto
                </button>
              </div>
            </div>
          ) : null}

          {/* ─── Editor de Orçamento ────────────────────────────────────── */}
          {editMode === 'orcamento' ? (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-green-900 text-sm">Ajustar orçamento diário</h3>
                <button onClick={() => setEditMode(null)} className="text-green-400 hover:text-green-600">
                  <X size={16} />
                </button>
              </div>
              <div className="flex justify-between text-sm text-green-800">
                <span>Atual: <strong>{brl2(orcamentoAtual)}/dia</strong></span>
                <span>Máx (+30%): <strong>{brl2(maxOrcamento)}/dia</strong></span>
              </div>
              <div>
                <label className="block text-xs font-medium text-green-800 mb-1">Novo orçamento diário (R$)</label>
                <input
                  type="number"
                  min={1}
                  step={0.01}
                  value={novoOrcamento}
                  onChange={(e) => setNovoOrcamento(e.target.value)}
                  className="w-full border border-green-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 bg-white"
                />
              </div>
              {overLimit && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
                  🔴 Limite de 30% por segurança ({brl2(maxOrcamento)}/dia máximo). Reduza o valor.
                </div>
              )}
              {!overLimit && novoOrcamentoNum > orcamentoAtual && orcamentoAtual > 0 && (
                <div className="bg-green-100 rounded-xl px-3 py-2 text-xs text-green-700">
                  ✅ Aumento de {(((novoOrcamentoNum - orcamentoAtual) / orcamentoAtual) * 100).toFixed(0)}%
                  (+{brl2(novoOrcamentoNum - orcamentoAtual)}/dia)
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setEditMode(null)}
                  className="flex-1 px-3 py-2 rounded-xl border border-green-200 text-green-700 text-sm font-medium hover:bg-green-100"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSalvarOrcamento}
                  disabled={actionLoading || novoOrcamentoNum <= 0 || overLimit}
                  className="flex-1 px-3 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading && <Loader2 size={13} className="animate-spin" />}
                  Salvar orçamento
                </button>
              </div>
            </div>
          ) : null}

          {/* ─── Editor de Público ──────────────────────────────────────── */}
          {editMode === 'publico' ? (
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-purple-900 text-sm">Mudar público</h3>
                <button onClick={() => setEditMode(null)} className="text-purple-400 hover:text-purple-600"><X size={16} /></button>
              </div>
              {loadingAdsets ? (
                <div className="flex items-center justify-center py-4 text-purple-600 gap-2 text-sm">
                  <Loader2 size={14} className="animate-spin" /> Carregando conjuntos...
                </div>
              ) : adsets.length === 0 ? (
                <div className="text-sm text-purple-700">Nenhum conjunto encontrado para esta campanha.</div>
              ) : (
                <>
                  <div className="text-xs text-purple-600 bg-purple-100 rounded-lg px-3 py-2">
                    Conjunto: <strong>{adsets[0].name}</strong>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-purple-800 mb-1">Idade mínima</label>
                      <input type="number" min={18} max={64} value={pubIdadeMin} onChange={e => setPubIdadeMin(e.target.value)}
                        className="w-full border border-purple-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-300" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-purple-800 mb-1">Idade máxima</label>
                      <input type="number" min={19} max={65} value={pubIdadeMax} onChange={e => setPubIdadeMax(e.target.value)}
                        className="w-full border border-purple-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-300" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-purple-800 mb-2">Gênero</label>
                    <div className="flex gap-2">
                      {[{ v: '0', l: 'Todos' }, { v: '2', l: 'Mulheres' }, { v: '1', l: 'Homens' }].map(({ v, l }) => (
                        <button key={v} onClick={() => setPubGenero(v as '0' | '1' | '2')}
                          className={cn('flex-1 py-1.5 rounded-xl border text-xs font-medium transition-all',
                            pubGenero === v ? 'bg-purple-600 text-white border-purple-600' : 'border-purple-200 text-purple-700 bg-white hover:bg-purple-50'
                          )}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditMode(null)}
                      className="flex-1 px-3 py-2 rounded-xl border border-purple-200 text-purple-700 text-sm font-medium hover:bg-purple-100">
                      Cancelar
                    </button>
                    <button onClick={handleSalvarPublico} disabled={actionLoading}
                      className="flex-1 px-3 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2">
                      {actionLoading && <Loader2 size={13} className="animate-spin" />}
                      Salvar público
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {/* ─── Trocar Criativo ─────────────────────────────────────────── */}
          {editMode === 'criativo' ? (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-orange-900 text-sm">Trocar criativo do anúncio</h3>
                <button onClick={() => setEditMode(null)} className="text-orange-400 hover:text-orange-600"><X size={16} /></button>
              </div>
              <div>
                <label className="block text-xs font-medium text-orange-800 mb-1">Título <span className="font-normal text-orange-500">({swapTitulo.length}/40)</span></label>
                <input type="text" maxLength={40} value={swapTitulo} onChange={e => setSwapTitulo(e.target.value)}
                  placeholder="Título do anúncio"
                  className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-orange-800 mb-1">Texto <span className="font-normal text-orange-500">({swapTexto.length}/125)</span></label>
                <textarea maxLength={125} rows={3} value={swapTexto} onChange={e => setSwapTexto(e.target.value)}
                  placeholder="Texto principal do anúncio"
                  className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-orange-800 mb-1">CTA</label>
                <div className="relative">
                  <select value={swapCta} onChange={e => setSwapCta(e.target.value)}
                    className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 pr-8">
                    {[
                      { value: 'LEARN_MORE', label: 'Saiba mais' },
                      { value: 'SHOP_NOW', label: 'Comprar agora' },
                      { value: 'SIGN_UP', label: 'Cadastrar' },
                      { value: 'CONTACT_US', label: 'Contato' },
                      { value: 'SEND_MESSAGE', label: 'Enviar mensagem' },
                    ].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-orange-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-orange-800 mb-1">URL de destino *</label>
                <input type="url" value={swapUrl} onChange={e => setSwapUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-orange-800 mb-1">URL da imagem (opcional)</label>
                <input type="url" value={swapImg} onChange={e => setSwapImg(e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditMode(null)}
                  className="flex-1 px-3 py-2 rounded-xl border border-orange-200 text-orange-700 text-sm font-medium hover:bg-orange-100">Cancelar</button>
                <button onClick={handleTrocarCriativo} disabled={actionLoading || !swapTitulo.trim() || !swapTexto.trim() || !swapUrl.trim()}
                  className="flex-1 px-3 py-2 rounded-xl bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {actionLoading && <Loader2 size={13} className="animate-spin" />}
                  Trocar criativo
                </button>
              </div>
            </div>
          ) : null}

          {/* ─── Ações ──────────────────────────────────────────────────── */}
          {editMode === null && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Ações</h3>
              <div className="space-y-2">
                {campaign.status === 'ACTIVE' ? (
                  <button
                    onClick={() => setConfirm({ action: 'pausar', label: 'Pausar campanha', cls: 'bg-red-600 hover:bg-red-700' })}
                    className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 transition-colors font-medium text-sm"
                  >
                    <Pause size={16} />
                    Pausar esta campanha
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirm({ action: 'ativar', label: 'Ativar campanha' })}
                    className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-green-200 text-green-700 hover:bg-green-50 transition-colors font-medium text-sm"
                  >
                    <Play size={16} />
                    Ativar esta campanha
                  </button>
                )}
                <button
                  onClick={() => setConfirm({ action: 'duplicar', label: 'Duplicar campanha' })}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors font-medium text-sm"
                >
                  <Copy size={16} />
                  Duplicar campanha (inicia pausada)
                </button>
                <button
                  onClick={() => {
                    setEditMode('texto');
                    setTitulo('');
                    setTexto('');
                    setCta(CTA_OPTIONS[0]);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors font-medium text-sm"
                >
                  <Edit2 size={16} />
                  Editar texto do anúncio
                </button>
                {campaign.orcamento_diario && campaign.orcamento_diario > 0 ? (
                  <button
                    onClick={() => {
                      setEditMode('orcamento');
                      setNovoOrcamento(String(orcamentoAtual));
                    }}
                    className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-green-200 text-green-700 hover:bg-green-50 transition-colors font-medium text-sm"
                  >
                    <DollarSign size={16} />
                    Ajustar orçamento diário
                  </button>
                ) : null}
                <button
                  onClick={() => openPublico()}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-purple-200 text-purple-700 hover:bg-purple-50 transition-colors font-medium text-sm"
                >
                  <Users size={16} />
                  Mudar público-alvo
                </button>
                <button
                  onClick={() => {
                    setEditMode('criativo');
                    setSwapTitulo(''); setSwapTexto(''); setSwapCta('LEARN_MORE');
                    setSwapUrl(''); setSwapImg('');
                  }}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-orange-200 text-orange-700 hover:bg-orange-50 transition-colors font-medium text-sm"
                >
                  <ImageIcon size={16} />
                  Trocar criativo
                </button>
                <button
                  onClick={() => { onActionComplete('Pedido enviado ao Cláudio — o texto aparecerá na aba "Textos" em breve.'); onClose(); }}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors font-medium text-sm"
                >
                  <FileText size={16} />
                  Cláudio, escreva um texto novo para essa campanha
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ConfirmModal */}
      {confirm && (
        <ConfirmModal
          title={confirm.label}
          message={
            confirm.action === 'pausar'
              ? `Tem certeza que deseja pausar "${campaign.nome}"? Seus anúncios irão parar de veicular imediatamente.`
              : confirm.action === 'ativar'
              ? `Ativar "${campaign.nome}"? Os anúncios começarão a veicular imediatamente e o orçamento será retomado.`
              : `Duplicar "${campaign.nome}"? Uma cópia completa será criada no Meta Ads — iniciará pausada para você revisar.`
          }
          confirmLabel={confirm.label}
          confirmClass={confirm.cls}
          loading={actionLoading}
          onConfirm={handleConfirmedAction}
          onCancel={() => { setConfirm(null); setPanelError(null); }}
        />
      )}
    </>
  );
}

/* ─── Modal Nova Campanha ──────────────────────────────────────────────────── */

const OBJETIVOS = [
  { value: 'OUTCOME_LEADS',       label: 'Leads — capturar cadastros' },
  { value: 'OUTCOME_TRAFFIC',     label: 'Tráfego — cliques no site' },
  { value: 'OUTCOME_SALES',       label: 'Vendas — conversões' },
  { value: 'OUTCOME_AWARENESS',   label: 'Reconhecimento de marca' },
  { value: 'OUTCOME_ENGAGEMENT',  label: 'Engajamento — curtidas e comentários' },
];

const CTA_META_OPTIONS = [
  { value: 'LEARN_MORE',        label: 'Saiba mais' },
  { value: 'SHOP_NOW',          label: 'Comprar agora' },
  { value: 'SIGN_UP',           label: 'Cadastrar' },
  { value: 'CONTACT_US',        label: 'Entrar em contato' },
  { value: 'SEND_MESSAGE',      label: 'Enviar mensagem' },
  { value: 'CALL_NOW',          label: 'Ligar agora' },
  { value: 'GET_OFFER',         label: 'Ver oferta' },
  { value: 'GET_QUOTE',         label: 'Pedir orçamento' },
];

function NovaCampanhaModal({ onClose, onCreated }: { onClose: () => void; onCreated: (msg: string) => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Step 1 — Basic
  const [nome, setNome] = useState('');
  const [objetivo, setObjetivo] = useState('OUTCOME_LEADS');
  const [orcamento, setOrcamento] = useState('50');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  // Step 2 — Audience
  const [idadeMin, setIdadeMin] = useState('18');
  const [idadeMax, setIdadeMax] = useState('65');
  const [genero, setGenero] = useState<'0' | '1' | '2'>('0');

  // Step 3 — Creative
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [cta, setCta] = useState('LEARN_MORE');
  const [urlDestino, setUrlDestino] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  async function handleCreate() {
    setLoading(true);
    setErr(null);
    try {
      const res = await authFetch('/api/trafego/campaign-create', {
        method: 'POST',
        body: JSON.stringify({
          nome,
          objetivo,
          orcamento_diario: parseFloat(orcamento) || 50,
          data_inicio: dataInicio || new Date().toISOString(),
          data_fim: dataFim || undefined,
          publico: {
            paises: ['BR'],
            idade_min: parseInt(idadeMin) || 18,
            idade_max: parseInt(idadeMax) || 65,
            genero: parseInt(genero),
          },
          criativo: {
            titulo: titulo.trim(),
            texto: texto.trim(),
            cta,
            url_destino: urlDestino.trim(),
            image_url: imageUrl.trim() || undefined,
          },
        }),
      });
      const json = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !json.ok) {
        setErr(json.error || 'Erro ao criar campanha');
        return;
      }
      onCreated(json.message || 'Campanha criada com sucesso!');
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  const canGoStep2 = nome.trim().length > 2 && parseFloat(orcamento) >= 5;
  const canGoStep3 = true; // audience always valid
  const canCreate = titulo.trim().length > 0 && texto.trim().length > 0 && urlDestino.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <Wand2 size={18} className="text-crm-primary" />
            <h2 className="font-bold text-gray-900">Nova Campanha no Meta</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X size={18} /></button>
        </div>

        {/* Steps indicator */}
        <div className="flex px-6 pt-4 gap-2">
          {(['Básico', 'Público', 'Criativo'] as const).map((label, i) => (
            <div key={label} className="flex-1 text-center">
              <div className={cn(
                'h-1.5 rounded-full mb-1 transition-colors',
                step > i + 1 ? 'bg-crm-primary' : step === i + 1 ? 'bg-crm-primary' : 'bg-gray-200'
              )} />
              <span className={cn('text-xs font-medium', step === i + 1 ? 'text-crm-primary' : 'text-gray-400')}>{label}</span>
            </div>
          ))}
        </div>

        <div className="p-6 space-y-4">
          {err && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {err}
            </div>
          )}

          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da campanha *</label>
                <input
                  type="text"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Ex: Rasteirinhas Atacado — Verão 2025"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Objetivo *</label>
                <div className="relative">
                  <select
                    value={objetivo}
                    onChange={e => setObjetivo(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-crm-primary/30 pr-8"
                  >
                    {OBJETIVOS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Orçamento diário (R$) *</label>
                <input
                  type="number"
                  min={5}
                  step={1}
                  value={orcamento}
                  onChange={e => setOrcamento(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data início *</label>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={e => setDataInicio(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data fim (opcional)</label>
                  <input
                    type="date"
                    value={dataFim}
                    onChange={e => setDataFim(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
                  />
                </div>
              </div>
              <div className="bg-blue-50 rounded-xl px-3 py-2.5 text-xs text-blue-800">
                A campanha será criada <strong>pausada</strong> para revisão antes de ativar.
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2.5">
                <Globe size={15} className="text-gray-400" /> Brasil (BR) — país padrão
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Idade mínima</label>
                  <input type="number" min={18} max={64} value={idadeMin} onChange={e => setIdadeMin(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Idade máxima</label>
                  <input type="number" min={19} max={65} value={idadeMax} onChange={e => setIdadeMax(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gênero</label>
                <div className="flex gap-2">
                  {[{ v: '0', l: 'Todos' }, { v: '2', l: 'Mulheres' }, { v: '1', l: 'Homens' }].map(({ v, l }) => (
                    <button key={v} onClick={() => setGenero(v as '0' | '1' | '2')}
                      className={cn('flex-1 py-2 rounded-xl border text-sm font-medium transition-all',
                        genero === v ? 'bg-crm-primary text-white border-crm-primary' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      )}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-amber-50 rounded-xl px-3 py-2.5 text-xs text-amber-800">
                Segmentação por interesses pode ser adicionada depois no Meta Ads Manager para refinamento avançado.
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Título do anúncio * <span className="font-normal text-gray-400">({titulo.length}/40)</span>
                </label>
                <input
                  type="text" maxLength={40} value={titulo} onChange={e => setTitulo(e.target.value)}
                  placeholder="Ex: Direto da fábrica pra você revender"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Texto principal * <span className="font-normal text-gray-400">({texto.length}/125)</span>
                </label>
                <textarea
                  maxLength={125} rows={3} value={texto} onChange={e => setTexto(e.target.value)}
                  placeholder="Ex: Rasteirinhas de R$25 a R$49,90 — mínimo 5 pares. Sortido à sua escolha."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Botão de ação (CTA) *</label>
                <div className="relative">
                  <select value={cta} onChange={e => setCta(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-crm-primary/30 pr-8">
                    {CTA_META_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">URL de destino *</label>
                <input type="url" value={urlDestino} onChange={e => setUrlDestino(e.target.value)}
                  placeholder="https://cjrasteirinhas.com.br/atacado"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">URL da imagem (opcional)</label>
                <input type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 pb-6 sticky bottom-0 bg-white pt-2 border-t border-gray-100">
          {step > 1 && (
            <button onClick={() => setStep(s => (s - 1) as 1 | 2 | 3)}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50">
              Voltar
            </button>
          )}
          <div className="flex-1" />
          {step < 3 ? (
            <button
              onClick={() => setStep(s => (s + 1) as 2 | 3)}
              disabled={step === 1 ? !canGoStep2 : !canGoStep3}
              className="px-5 py-2.5 rounded-xl bg-crm-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
            >
              Próximo <ChevronRight size={15} />
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={loading || !canCreate}
              className="px-5 py-2.5 rounded-xl bg-crm-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              <Wand2 size={14} />
              Criar campanha
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Abas de conteúdo ─────────────────────────────────────────────────────── */

/* ─── Tipos para públicos IA ───────────────────────────────────────────────── */

interface IAPublico {
  id: string;
  nome: string;
  descricao?: string;
  tipo: string;
  status: string;
  estimativa_alcance_min?: number;
  estimativa_alcance_max?: number;
  criado_por_ia: boolean;
  jose_justificativa?: string;
  claudio_copy?: { headline: string; texto: string; cta: string };
  created_at: string;
  tamanho_estimado?: string;
  copy_sugerido?: { headline: string; texto: string; cta: string };
  estrategia?: string;
  erro?: string;
}

// Públicos pré-configurados CJ Rasteirinhas
const PUBLICOS_CJ = [
  {
    nome: '👩 Revendedoras — Brasil',
    descricao: 'Mulheres 25-50 anos | Atacado, moda, revenda',
    tamanho: '~450.000 pessoas',
    interesses: 'Atacado de moda, revenda, renda extra, empreendedorismo feminino, sacoleira, calçados femininos',
    campanhas: 'Atacado Verão',
  },
  {
    nome: '🏪 Candidatas C4 Franquias',
    descricao: 'Mulheres 22-45 anos | Franquia, negócio próprio',
    tamanho: '~200.000 pessoas',
    interesses: 'Franquia, negócio próprio, trabalhar em casa, venda online, loja virtual',
    campanhas: 'C4 Franquias',
  },
  {
    nome: '🏷️ Marca Própria / Private Label',
    descricao: 'Homens e mulheres 25-50 | Lojistas',
    tamanho: '~80.000 pessoas',
    interesses: 'Marca própria, private label, lojista, boutique, atacado de calçados',
    campanhas: '—',
  },
  {
    nome: '🔄 Remarketing 30 dias',
    descricao: 'Quem interagiu com CJ Rasteirinhas nos últimos 30 dias',
    tamanho: 'Varia',
    interesses: 'Visitantes do site + seguidores Instagram + engajamento nos posts',
    campanhas: 'Remarketing',
  },
];

// Copies padrão CJ Rasteirinhas
const COPIES_PADRAO = [
  {
    campanha: 'Atacado',
    titulo: 'Direto da fábrica pra você revender',
    texto: 'Rasteirinhas de R$25 a R$49,90 — mínimo 5 pares\nSortido à sua escolha | Parcele em 12x | Entrega Brasil',
    cta: 'Quero comprar no atacado',
  },
  {
    campanha: 'C4 Franquias',
    titulo: 'Seu site de moda pronto hoje',
    texto: 'Com a C4 você tem site + produtos + suporte.\nSem estoque. Sem complicação.',
    cta: 'Quero ser franqueada',
  },
  {
    campanha: 'Remarketing',
    titulo: 'Ainda pensando? A fábrica tá esperando 👡',
    texto: 'Mais de 500 revendedoras já compram com a CJ.\nRasteirinhas que vendem — a partir de 5 pares.',
    cta: 'Falar com a equipe',
  },
];

/* ─── Modal de Confirmação ─────────────────────────────────────────────────── */

function ConfirmModal({
  title,
  message,
  confirmLabel,
  confirmClass,
  loading,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  confirmClass?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <div className="flex items-center gap-3 mb-3">
          <AlertOctagon size={22} className="text-amber-500 shrink-0" />
          <h3 className="font-bold text-gray-900 text-lg">{title}</h3>
        </div>
        <p className="text-sm text-gray-600 mb-5">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              'flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50',
              confirmClass || 'bg-crm-primary hover:opacity-90'
            )}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Aba de Criativos ─────────────────────────────────────────────────────── */

function CriativosTab() {
  const [criativos, setCriativos] = useState<Criativo[]>([]);
  const [loadingCriativos, setLoadingCriativos] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadCriativos = async () => {
    setLoadingCriativos(true);
    try {
      const res = await authFetch('/api/trafego/sync?tipo=criativos');
      if (res.ok) {
        const json = await res.json() as { criativos: Criativo[] };
        setCriativos(json.criativos || []);
      }
    } catch { /* silencioso */ }
    finally { setLoadingCriativos(false); }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await authFetch('/api/trafego/sync', { method: 'POST' });
      await loadCriativos();
    } catch { /* silencioso */ }
    finally { setSyncing(false); }
  };

  useEffect(() => { loadCriativos(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900">Meus Criativos</h2>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-crm-primary text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <CloudDownload size={14} />}
          {syncing ? 'Sincronizando...' : 'Sincronizar com Meta'}
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>Dicas da Judite para CJ Rasteirinhas:</strong>
        <ul className="mt-2 space-y-1 list-disc list-inside">
          <li>Vídeo do produto em uso converte mais que foto estática</li>
          <li>Mostrar o preço visível ("R$25 o par") aumenta cliques</li>
          <li>Stories 9:16 costuma sair mais barato que feed quadrado</li>
          <li>Depoimento de revendedora real gera mais confiança</li>
        </ul>
      </div>

      {loadingCriativos ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-100 rounded-xl aspect-video animate-pulse" />
          ))}
        </div>
      ) : criativos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <ImageIcon size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Nenhum criativo encontrado</p>
          <p className="text-gray-400 text-xs mt-1">Clique em "Sincronizar com Meta" para importar criativos das suas campanhas</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {criativos.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {c.thumbnail_url ? (
                <img src={c.thumbnail_url} alt={c.nome || 'Criativo'} className="w-full aspect-video object-cover" />
              ) : (
                <div className="w-full aspect-video bg-gray-100 flex items-center justify-center">
                  {c.tipo === 'VIDEO' ? (
                    <Play size={28} className="text-gray-300" />
                  ) : (
                    <ImageIcon size={28} className="text-gray-300" />
                  )}
                </div>
              )}
              <div className="p-3">
                <div className="text-xs font-medium text-gray-700 truncate">{c.nome || `Criativo ${c.id.substring(0, 8)}`}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{c.tipo || 'IMG'}</span>
                  {c.formato && <span className="text-xs text-gray-400">{c.formato}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface SavedAudience {
  id: string;
  name: string;
  description?: string;
  approximate_count_lower_bound?: number;
  approximate_count_upper_bound?: number;
  targeting_criteria?: unknown;
  subtype?: string;
  data_source?: { type?: string };
}

function formatAudienceSize(lower?: number, upper?: number): string {
  if (!lower && !upper) return 'Tamanho desconhecido';
  const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
  if (lower && upper) return `~${fmt(lower)} – ${fmt(upper)} pessoas`;
  return `~${fmt(lower || upper || 0)} pessoas`;
}

type IALoadingStep = 'jose' | 'claudio' | 'meta' | 'remarketing' | null;

const IA_STEP_LABELS: Record<string, string> = {
  jose: '🔍 José analisando seus clientes...',
  claudio: '🎯 Cláudio configurando os públicos...',
  meta: '📡 Criando no Meta Ads...',
  remarketing: '🔄 Criando público de remarketing...',
};

function formatTamanhoEstimado(min?: number, max?: number, texto?: string): string {
  if (texto && texto !== 'Estimativa indisponível' && texto !== 'Calculando...') return texto;
  if (!min && !max) return 'Calculando...';
  const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
  if (min && max) return `~${fmt(min)} – ${fmt(max)} pessoas`;
  return `~${fmt(min || max || 0)} pessoas`;
}

function PublicosTab() {
  const [savedAudiences, setSavedAudiences] = useState<SavedAudience[]>([]);
  const [customAudiences, setCustomAudiences] = useState<SavedAudience[]>([]);
  const [loading, setLoading] = useState(true);
  const [metaConnected, setMetaConnected] = useState(false);

  // Públicos IA (do banco local)
  const [iaPublicos, setIaPublicos] = useState<IAPublico[]>([]);
  const [criandoComIA, setCriandoComIA] = useState(false);
  const [iaStep, setIaStep] = useState<IALoadingStep>(null);
  const [iaAnaliseResumo, setIaAnaliseResumo] = useState<string | null>(null);

  const carregarDados = useCallback(() => {
    setLoading(true);
    Promise.all([
      authFetch('/api/trafego/saved-audiences').then(r => r.json()),
      authFetch('/api/ai-team/create-audiences').then(r => r.json()),
    ])
      .then(([metaData, iaData]: [
        { connected?: boolean; savedAudiences?: SavedAudience[]; customAudiences?: SavedAudience[] },
        { publicos?: IAPublico[] }
      ]) => {
        setMetaConnected(metaData.connected || false);
        setSavedAudiences(metaData.savedAudiences || []);
        setCustomAudiences(metaData.customAudiences || []);
        setIaPublicos(iaData.publicos || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  const handleCriarComIA = useCallback(async () => {
    if (criandoComIA) return;
    setCriandoComIA(true);
    setIaStep('jose');
    setIaAnaliseResumo(null);

    try {
      const res = await authFetch('/api/ai-team/create-audiences', { method: 'POST' });
      const data = await res.json() as {
        ok?: boolean;
        publicos?: IAPublico[];
        analise_resumo?: string;
        criados?: number;
        erros?: number;
        error?: string;
      };

      if (!res.ok || data.error) throw new Error(data.error || 'Erro ao criar públicos');

      setIaPublicos(prev => {
        const novosIds = new Set((data.publicos || []).map(p => p.id));
        return [...(data.publicos || []), ...prev.filter(p => !novosIds.has(p.id))];
      });
      if (data.analise_resumo) setIaAnaliseResumo(data.analise_resumo);
    } catch (err) {
      console.error('[PublicosTab] Erro ao criar com IA:', err);
    } finally {
      setCriandoComIA(false);
      setIaStep(null);
    }
  }, [criandoComIA]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900">Públicos</h2>
        <button
          onClick={carregarDados}
          disabled={loading || criandoComIA}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 disabled:opacity-40"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {/* Card IA — Criar públicos com IA */}
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl border border-purple-100 p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl shrink-0">🤖</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 text-sm">Criar públicos com IA</div>
            <div className="text-xs text-gray-500 mt-0.5">
              José analisa seus clientes + Cláudio configura os públicos certos para cada objetivo
            </div>
            {criandoComIA && iaStep && (
              <div className="mt-2 flex items-center gap-2 text-xs text-purple-700 font-medium">
                <Loader2 size={12} className="animate-spin shrink-0" />
                {IA_STEP_LABELS[iaStep]}
              </div>
            )}
            {iaAnaliseResumo && !criandoComIA && (
              <div className="mt-2 text-xs text-gray-600 bg-white/70 rounded-lg p-2 border border-purple-100/50">
                💡 {iaAnaliseResumo}
              </div>
            )}
          </div>
          <button
            onClick={handleCriarComIA}
            disabled={criandoComIA}
            className={cn(
              'shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all',
              criandoComIA
                ? 'bg-purple-100 text-purple-400 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm'
            )}
          >
            {criandoComIA
              ? <><Loader2 size={13} className="animate-spin" /> Criando...</>
              : <><Wand2 size={13} /> Criar com IA</>
            }
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center py-8 text-gray-400 text-sm flex items-center justify-center gap-2">
          <Loader2 size={15} className="animate-spin" /> Carregando públicos...
        </div>
      )}

      {!loading && !metaConnected && iaPublicos.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          Meta Ads não conectado — configure o token em <a href="/time-ia" className="underline font-medium">Time de IAs</a>.
        </div>
      )}

      {/* Públicos criados pela IA */}
      {!loading && iaPublicos.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Criados pela IA ({iaPublicos.length})
          </h3>
          {iaPublicos.map(p => {
            const copy = p.claudio_copy || p.copy_sugerido;
            const tamanho = formatTamanhoEstimado(p.estimativa_alcance_min, p.estimativa_alcance_max, p.tamanho_estimado);
            const tipoLabel = p.tipo === 'remarketing' ? '🔄 Remarketing' : p.tipo === 'lookalike' ? '👥 Lookalike' : '🎯 Interesse';
            return (
              <div key={p.id} className={cn(
                'bg-white rounded-2xl border p-4',
                p.erro ? 'border-red-100 bg-red-50/30' : 'border-gray-100'
              )}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{p.nome}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">{tipoLabel}</span>
                      {p.criado_por_ia && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">IA</span>
                      )}
                    </div>
                    {p.descricao && <div className="text-xs text-gray-500 mt-0.5">{p.descricao}</div>}
                    <div className="text-xs text-gray-400 mt-1 font-medium">{tamanho}</div>
                    {p.jose_justificativa && (
                      <div className="text-xs text-gray-400 mt-0.5 italic">💡 {p.jose_justificativa}</div>
                    )}
                    {copy && (
                      <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-100 text-xs space-y-0.5">
                        <div><span className="font-medium text-gray-700">Headline:</span> {copy.headline}</div>
                        <div><span className="font-medium text-gray-700">Texto:</span> {copy.texto}</div>
                        <div><span className="font-medium text-gray-700">CTA:</span> {copy.cta}</div>
                      </div>
                    )}
                    {p.erro && (
                      <div className="text-xs text-red-500 mt-1">⚠ {p.erro}</div>
                    )}
                  </div>
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full font-medium shrink-0',
                    p.status === 'pronto' ? 'bg-green-50 text-green-700' :
                    p.status === 'falhou' ? 'bg-red-50 text-red-600' :
                    'bg-gray-100 text-gray-500'
                  )}>
                    {p.status === 'pronto' ? 'Pronto' : p.status === 'falhou' ? 'Falhou' : p.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Públicos Salvos no Meta */}
      {!loading && savedAudiences.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Públicos Salvos no Meta ({savedAudiences.length})</h3>
          {savedAudiences.map(a => (
            <div key={a.id} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{a.name}</div>
                  {a.description && <div className="text-sm text-gray-500 mt-0.5">{a.description}</div>}
                  <div className="text-xs text-gray-400 mt-1">
                    {formatAudienceSize(a.approximate_count_lower_bound, a.approximate_count_upper_bound)}
                  </div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium shrink-0">Salvo</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Públicos Personalizados no Meta */}
      {!loading && customAudiences.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Públicos Personalizados ({customAudiences.length})</h3>
          {customAudiences.map(a => (
            <div key={a.id} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{a.name}</div>
                  {a.description && <div className="text-sm text-gray-500 mt-0.5">{a.description}</div>}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-gray-400">
                      {formatAudienceSize(a.approximate_count_lower_bound, a.approximate_count_upper_bound)}
                    </span>
                    {a.subtype && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-mono">{a.subtype}</span>
                    )}
                  </div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium shrink-0">Personalizado</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && metaConnected && savedAudiences.length === 0 && customAudiences.length === 0 && iaPublicos.length === 0 && (
        <div className="text-center py-8">
          <Users size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Nenhum público ainda</p>
          <p className="text-gray-400 text-xs mt-1">Clique em &quot;Criar com IA&quot; para gerar públicos segmentados automaticamente.</p>
        </div>
      )}

      {/* Sugestões estáticas CJ como referência (só se não houver públicos IA) */}
      {!loading && iaPublicos.length === 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Sugestões para CJ Rasteirinhas</h3>
          {PUBLICOS_CJ.map((p) => (
            <div key={p.nome} className="bg-gray-50 rounded-2xl border border-gray-100 p-4">
              <div className="flex-1">
                <div className="font-semibold text-gray-700">{p.nome}</div>
                <div className="text-sm text-gray-500 mt-0.5">{p.descricao}</div>
                <div className="text-xs text-gray-400 mt-1">Tamanho estimado: {p.tamanho}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  <span className="font-medium">Interesses:</span> {p.interesses}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TextosTab({ copies }: { copies: Array<{ headline: string; texto_principal: string; cta: string; justificativa?: string; id: string }> }) {
  const [copied, setCopied] = useState<string | null>(null);

  function copyText(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900">Textos para Anúncios</h2>
        <a href="/time-ia" className="text-sm text-crm-primary hover:underline">
          Pedir novo ao Cláudio →
        </a>
      </div>

      {/* Copies gerados pelo Cláudio */}
      {copies.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Do Cláudio (aguardando uso)</h3>
          {copies.map((copy) => (
            <div key={copy.id} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="font-semibold text-gray-900">{copy.headline}</div>
              <div className="text-sm text-gray-600 mt-1 whitespace-pre-line">{copy.texto_principal}</div>
              <div className="text-xs text-gray-400 mt-1">Botão: {copy.cta}</div>
              {copy.justificativa && (
                <div className="mt-2 text-xs text-crm-primary bg-blue-50 rounded-lg px-3 py-2">
                  💡 {copy.justificativa}
                </div>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => copyText(copy.id, `${copy.headline}\n\n${copy.texto_principal}\n\n${copy.cta}`)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  <Copy size={12} />
                  {copied === copy.id ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Copies padrão da CJ */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Textos padrão CJ Rasteirinhas</h3>
        {COPIES_PADRAO.map((copy) => (
          <div key={copy.campanha} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                {copy.campanha}
              </span>
            </div>
            <div className="font-semibold text-gray-900">{copy.titulo}</div>
            <div className="text-sm text-gray-600 mt-1 whitespace-pre-line">{copy.texto}</div>
            <div className="text-xs text-gray-400 mt-1">Botão: {copy.cta}</div>
            <button
              onClick={() => copyText(`padrao-${copy.campanha}`, `${copy.titulo}\n\n${copy.texto}\n\n${copy.cta}`)}
              className="flex items-center gap-1.5 text-xs mt-3 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              <Copy size={12} />
              {copied === `padrao-${copy.campanha}` ? 'Copiado!' : 'Copiar texto'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Sazonalidade (Pedro) ─────────────────────────────────────────────────── */

function getSazonalidade(): { status: string; recomendacao: string; proximaData: string; dica: string } {
  const mes = new Date().getMonth() + 1; // 1-12
  if (mes >= 10 || mes <= 3) {
    return {
      status: '🔥 ALTA — Temporada de verão para rasteirinhas',
      recomendacao: 'Aumentar verba 20-30% nas campanhas de atacado',
      proximaData: mes >= 11 ? 'Black Friday (novembro) — começar campanha agora' :
                   mes === 12 ? 'Natal (25 dez) — últimas peças do ano' :
                   mes <= 2   ? 'Carnaval (fevereiro) — produto em alta' :
                   'Dia das Mães (maio) — começar em 2 semanas',
      dica: 'Rasteirinhas coloridas e de tiras finas têm alta busca no verão',
    };
  }
  return {
    status: '❄️ BAIXA — Inverno, foco em branding',
    recomendacao: 'Reduzir verba em campanhas de volume, manter remarketing',
    proximaData: mes <= 5 ? 'Dia das Mães (maio) — oportunidade premium' :
                 'Dia dos Pais (agosto) — campanha de marca própria',
    dica: 'Período ideal para captar franqueadas C4 — elas planejam para o verão',
  };
}

/* ─── Página Principal ─────────────────────────────────────────────────────── */

export default function TrafegoPage() {
  const [period, setPeriod] = useState<Period>('7d');
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('campanhas');
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [copies, setCopies] = useState<Array<{ id: string; headline: string; texto_principal: string; cta: string; justificativa?: string }>>([]);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [novaCampanhaOpen, setNovaCampanhaOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'ACTIVE' | 'PAUSED' | 'WITH_ISSUES' | 'PENDING_REVIEW'>('all');

  const loadMetrics = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/trafego/metrics?period=${p}`);
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const json = await res.json() as MetricsData;
      setData(json);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCopies = useCallback(async () => {
    try {
      const res = await authFetch('/api/ai-team/copies?status=draft');
      if (!res.ok) return;
      const json = await res.json() as { data: typeof copies };
      setCopies(json.data || []);
    } catch {
      // silencioso
    }
  }, []);

  const loadLastSync = useCallback(async () => {
    try {
      const res = await authFetch('/api/trafego/sync');
      if (res.ok) {
        const json = await res.json() as { lastSync: string | null };
        setLastSync(json.lastSync || null);
      }
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    loadMetrics(period);
    loadCopies();
    loadLastSync();
  }, [loadMetrics, loadCopies, loadLastSync, period]);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await authFetch('/api/trafego/sync', { method: 'POST' });
      if (res.ok) {
        const json = await res.json() as { ok: boolean; campanhas?: number; ads?: number; criativos?: number };
        const parts = [];
        if (json.campanhas) parts.push(`${json.campanhas} campanhas`);
        if (json.ads) parts.push(`${json.ads} anúncios`);
        if (json.criativos) parts.push(`${json.criativos} criativos`);
        setActionFeedback(`Sincronizado com Meta: ${parts.join(', ') || 'sem novidades'}.`);
        setLastSync(new Date().toISOString());
        setTimeout(() => setActionFeedback(null), 5000);
      }
    } catch { /* silencioso */ }
    finally { setSyncing(false); }
  }

  function handleActionComplete(message: string) {
    setActionFeedback(message);
    setTimeout(() => setActionFeedback(null), 5000);
    setSelectedCampaign(null);
    loadMetrics(period);
  }

  const sazon = getSazonalidade();
  const allAlerts = (data?.campaigns || []).flatMap((c) =>
    c.alerts.map((a) => ({ ...a, campaign: c }))
  ).sort((a, b) => (a.tipo === 'danger' ? -1 : 1) - (b.tipo === 'danger' ? -1 : 1));

  const periodLabel = { '1d': 'Hoje', '7d': '7 dias', '15d': '15 dias', '30d': '30 dias' }[period];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* ─── Cabeçalho ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 size={22} className="text-crm-primary" />
                Tráfego Pago — CJ Rasteirinhas
              </h1>
              {data?.connected && data.accountName && (
                <p className="text-sm text-gray-500 mt-0.5">
                  Conta vinculada: <span className="font-medium text-gray-700">{data.accountName}</span>
                </p>
              )}
              <div className="flex gap-4 mt-1 text-xs text-gray-400 flex-wrap">
                {data?.lastAnalysis && (
                  <>
                    <span>👨 José analisou: {formatDateTime(data.lastAnalysis)}</span>
                    <span>🧠 Cláudio sugeriu: {formatDateTime(data.lastAnalysis)}</span>
                  </>
                )}
                {lastSync && (
                  <span>🔄 Última sync: {formatDateTime(lastSync)}</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                {(['1d', '7d', '15d', '30d'] as Period[]).map((p) => (
                  <PeriodBtn
                    key={p}
                    label={{ '1d': 'Hoje', '7d': '7 dias', '15d': '15 dias', '30d': '30 dias' }[p]}
                    active={period === p}
                    onClick={() => setPeriod(p)}
                  />
                ))}
              </div>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors disabled:opacity-50 text-sm font-medium"
                title="Sincronizar dados do Meta"
              >
                {syncing ? <Loader2 size={14} className="animate-spin" /> : <CloudDownload size={14} />}
                {syncing ? 'Sincronizando...' : 'Sincronizar'}
              </button>
              <button
                onClick={() => loadMetrics(period)}
                disabled={loading}
                className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
                title="Atualizar métricas"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>

        {/* ─── Feedback de ação ────────────────────────────────────────────── */}
        {actionFeedback && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 flex items-center gap-2">
            <CheckCircle size={16} />
            {actionFeedback}
          </div>
        )}

        {/* ─── Aviso de cache ──────────────────────────────────────────────── */}
        {!loading && data?.fromCache && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 flex items-center gap-2">
            <Clock size={15} className="shrink-0" />
            <span>{data.cacheWarning || 'Exibindo dados do último sync.'}</span>
            {data.lastSync && (
              <span className="text-blue-500 ml-auto text-xs whitespace-nowrap">
                Sync: {formatDateTime(data.lastSync)}
              </span>
            )}
          </div>
        )}

        {/* ─── Meta não conectado ──────────────────────────────────────────── */}
        {!loading && data && !data.connected && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-amber-900">Conta Meta não conectada</div>
                <div className="text-sm text-amber-700 mt-0.5">
                  {data.error || 'Configure a conta do Meta para ver suas campanhas'}
                </div>
              </div>
            </div>
            <a
              href="/time-ia"
              className="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 transition-colors whitespace-nowrap"
            >
              Conectar agora →
            </a>
          </div>
        )}

        {/* ─── Loading ─────────────────────────────────────────────────────── */}
        {loading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 animate-pulse">
                <div className="h-4 w-12 bg-gray-200 rounded mb-4" />
                <div className="h-8 w-20 bg-gray-200 rounded mb-2" />
                <div className="h-3 w-16 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* ─── Cards de métricas ───────────────────────────────────────────── */}
        {!loading && data?.connected && data.summary && (() => {
          const s = data.summary;
          const roasBadge = s.totalRoas >= 3 ? { label: `${s.totalRoas.toFixed(1)}x Excelente`, color: 'green' as const } :
                            s.totalRoas >= 1.5 ? { label: `${s.totalRoas.toFixed(1)}x Atenção`, color: 'yellow' as const } :
                            s.totalRoas > 0 ? { label: `${s.totalRoas.toFixed(1)}x Prejuízo`, color: 'red' as const } :
                            { label: 'Sem retorno', color: 'gray' as const };
          return (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                icon={<DollarSign size={20} className="text-crm-primary" />}
                label={`Gastei (${periodLabel})`}
                value={brl(s.totalSpend)}
              />
              <MetricCard
                icon={<TrendingUp size={20} className="text-green-500" />}
                label="Retorno gerado"
                value={brl(s.totalRevenue)}
                badge={roasBadge.label}
                badgeColor={roasBadge.color}
              />
              <MetricCard
                icon={<Target size={20} className="text-blue-500" />}
                label="Cliques"
                value={n0(s.totalClicks)}
                sub={s.totalCpc > 0 ? `${brl2(s.totalCpc)}/clique` : undefined}
              />
              <MetricCard
                icon={<Users size={20} className="text-purple-500" />}
                label="Leads"
                value={n0(s.totalLeads)}
                sub={s.totalCpl > 0 ? `${brl2(s.totalCpl)}/lead` : undefined}
                badge={s.totalLeads > 0 ? (s.totalCpl <= 20 ? 'Bom' : s.totalCpl <= 30 ? 'Atenção' : 'Caro') : undefined}
                badgeColor={s.totalLeads > 0 ? (s.totalCpl <= 20 ? 'green' : s.totalCpl <= 30 ? 'yellow' : 'red') : 'gray'}
              />
            </div>
          );
        })()}

        {/* ─── Alertas inteligentes ────────────────────────────────────────── */}
        {!loading && allAlerts.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={18} className="text-amber-500" />
              <h2 className="font-bold text-gray-900">
                José identificou {allAlerts.length} situaç{allAlerts.length === 1 ? 'ão' : 'ões'} para atenção:
              </h2>
            </div>
            <div className="space-y-3">
              {allAlerts.slice(0, 5).map((alert, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-xl p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3',
                    alert.tipo === 'danger' ? 'bg-red-50' : 'bg-amber-50'
                  )}
                >
                  <div>
                    <div className={cn('font-semibold text-sm flex items-center gap-2', alert.tipo === 'danger' ? 'text-red-900' : 'text-amber-900')}>
                      <span className={cn('w-2 h-2 rounded-full shrink-0', alert.tipo === 'danger' ? 'bg-red-500' : 'bg-amber-400')} />
                      {alert.campaign.nome}
                    </div>
                    <div className={cn('text-sm mt-0.5', alert.tipo === 'danger' ? 'text-red-700' : 'text-amber-700')}>
                      {alert.mensagem}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => { setSelectedCampaign(alert.campaign); setTab('campanhas'); }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                    >
                      Ver campanha
                    </button>
                    {(alert.acao === 'pausar' || alert.tipo === 'danger') && (
                      <button
                        onClick={() => { setSelectedCampaign(alert.campaign); }}
                        className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 whitespace-nowrap"
                      >
                        Pausar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Abas ────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          {/* Tab headers */}
          <div className="flex border-b border-gray-100 overflow-x-auto">
            {(
              [
                { key: 'campanhas', label: 'Campanhas', icon: <BarChart3 size={14} /> },
                { key: 'criativos', label: 'Criativos',  icon: <ImageIcon size={14} /> },
                { key: 'publicos',  label: 'Públicos',   icon: <Users size={14} /> },
                { key: 'textos',    label: 'Textos',     icon: <FileText size={14} /> },
              ] as { key: Tab; label: string; icon: React.ReactNode }[]
            ).map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  'flex items-center gap-1.5 px-5 py-4 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors',
                  tab === key
                    ? 'border-crm-primary text-crm-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {/* ── CAMPANHAS ── */}
            {tab === 'campanhas' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-gray-900">Suas Campanhas</h2>
                  <button
                    onClick={() => setNovaCampanhaOpen(true)}
                    className="flex items-center gap-1.5 text-sm px-4 py-2 bg-crm-primary text-white rounded-xl font-medium hover:opacity-90"
                  >
                    <Plus size={14} /> Nova Campanha
                  </button>
                </div>

                {/* Filtros de status */}
                {!loading && (data?.campaigns || []).length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {([
                      { value: 'all',           label: 'Todas' },
                      { value: 'ACTIVE',        label: 'Rodando' },
                      { value: 'PAUSED',        label: 'Pausadas' },
                      { value: 'WITH_ISSUES',   label: 'Com problema' },
                      { value: 'PENDING_REVIEW',label: 'Em revisão' },
                    ] as const).map(f => (
                      <button
                        key={f.value}
                        onClick={() => setStatusFilter(f.value)}
                        className={cn(
                          'px-3 py-1 rounded-lg text-xs font-medium transition-all border',
                          statusFilter === f.value
                            ? 'bg-crm-primary text-white border-crm-primary'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                        )}
                      >
                        {f.label}
                        {f.value !== 'all' && (
                          <span className="ml-1 opacity-70">
                            ({(data?.campaigns || []).filter(c => c.effective_status === f.value).length})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {loading && (
                  <div className="text-center py-12 text-gray-400 text-sm">Carregando campanhas...</div>
                )}

                {!loading && (!data?.campaigns || data.campaigns.length === 0) && (
                  <div className="text-center py-12">
                    <Target size={40} className="text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">Nenhuma campanha encontrada no período</p>
                    <p className="text-gray-400 text-xs mt-1">
                      {data?.connected ? 'Sem campanhas ativas ou pausadas' : 'Conecte o Meta Ads para ver campanhas'}
                    </p>
                  </div>
                )}

                {!loading && (data?.campaigns || []).length > 0 && (() => {
                  const filtered = (data?.campaigns || []).filter(c =>
                    statusFilter === 'all' || c.effective_status === statusFilter
                  );
                  if (filtered.length === 0) return (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      Nenhuma campanha com este status no período
                    </div>
                  );
                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Campanha</th>
                            <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Status Meta</th>
                            <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Saúde</th>
                            <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Gastei</th>
                            <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Retorno</th>
                            <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Leads</th>
                            <th className="text-right pb-3" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {filtered.map((c) => (
                            <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                              <td className="py-3 pr-4">
                                <div className="font-medium text-gray-900 text-sm">{c.nome}</div>
                                {c.alerts.length > 0 && (
                                  <div className="text-xs text-red-600 mt-0.5">
                                    {c.alerts[0].mensagem.substring(0, 50)}…
                                  </div>
                                )}
                              </td>
                              <td className="py-3 pr-4">
                                <EffectiveStatusBadge status={c.effective_status} />
                              </td>
                              <td className="py-3 pr-4">
                                <HealthBadge health={c.health} />
                              </td>
                              <td className="py-3 pr-4 text-right text-sm font-medium text-gray-900">
                                {brl(c.spend)}
                              </td>
                              <td className="py-3 pr-4 text-right">
                                <div className="text-sm font-medium text-gray-900">
                                  {c.roas > 0 ? `${c.roas.toFixed(1)}x` : '—'}
                                </div>
                              </td>
                              <td className="py-3 pr-4 text-right text-sm text-gray-600">
                                {c.leads > 0 ? c.leads : '—'}
                              </td>
                              <td className="py-3">
                                <button
                                  onClick={() => setSelectedCampaign(c)}
                                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center gap-1 whitespace-nowrap"
                                >
                                  Gerir <ChevronRight size={12} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── CRIATIVOS ── */}
            {tab === 'criativos' && <CriativosTab />}

            {/* ── PÚBLICOS ── */}
            {tab === 'publicos' && <PublicosTab />}

            {/* ── TEXTOS ── */}
            {tab === 'textos' && <TextosTab copies={copies} />}
          </div>
        </div>

        {/* ─── Pedro — Sazonalidade ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">📅</span>
            <h2 className="font-bold text-gray-900">Pedro monitorando oportunidades</h2>
          </div>
          <div className="space-y-3">
            <div className="bg-orange-50 rounded-xl px-4 py-3 text-sm text-orange-900">
              <strong>{sazon.status}</strong>
              <div className="mt-1 text-orange-700">Recomendação: {sazon.recomendacao}</div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 bg-blue-50 rounded-xl px-4 py-3 text-sm text-blue-900">
                <strong>📌 {sazon.proximaData}</strong>
              </div>
              <div className="flex-1 bg-purple-50 rounded-xl px-4 py-3 text-sm text-purple-900">
                <strong>💡 Pedro encontrou:</strong> {sazon.dica}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ─── Modal Nova Campanha ─────────────────────────────────────────── */}
      {novaCampanhaOpen && (
        <NovaCampanhaModal
          onClose={() => setNovaCampanhaOpen(false)}
          onCreated={(msg) => { handleActionComplete(msg); setNovaCampanhaOpen(false); }}
        />
      )}

      {/* ─── Painel lateral de campanha ──────────────────────────────────── */}
      {selectedCampaign && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setSelectedCampaign(null)}
          />
          <CampaignDetailPanel
            campaign={selectedCampaign}
            onClose={() => setSelectedCampaign(null)}
            onActionComplete={handleActionComplete}
          />
        </>
      )}
    </div>
  );
}
