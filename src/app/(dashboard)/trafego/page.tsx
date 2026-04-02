'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/store/auth';
import { useMetaAccounts } from '@/hooks/useMetaAccounts';
import { AccountTabs } from '@/components/trafego/AccountTabs';
import { AddAccountModal } from '@/components/trafego/AddAccountModal';
import { MetaTokenConfig } from '@/components/meta/MetaTokenConfig';
import { GaleriaCriativos } from '@/components/meta/GaleriaCriativos';
import { CriadorCampanha } from '@/components/meta/CriadorCampanha';
import { AgenteTrafegoPanel } from '@/components/meta/AgenteTrafegoPanel';

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

type Period = '1d' | '7d' | '15d' | '30d';
type Tab = 'campanhas' | 'criativos' | 'publicos' | 'textos' | 'analise' | 'relatorio' | 'config' | 'agente';

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
        active ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-900'
      )}
    >
      {label}
    </button>
  );
}

function MetricCard({
  label, value, sub, badge, badgeColor,
}: {
  label: string;
  value: string;
  sub?: string;
  badge?: string;
  badgeColor?: 'green' | 'yellow' | 'red' | 'gray';
  icon?: React.ReactNode;
}) {
  const badgeStyles = {
    green:  'bg-green-500/20 text-green-400 border border-green-500/30',
    yellow: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    red:    'bg-red-500/20 text-red-400 border border-red-500/30',
    gray:   'bg-gray-100 text-gray-600 border border-gray-200',
  };
  const valueColor =
    badgeColor === 'red' ? 'text-red-500' :
    badgeColor === 'yellow' ? 'text-amber-500' :
    badgeColor === 'green' ? 'text-emerald-600' :
    'text-gray-900';
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100">
      <div className="flex items-start justify-between mb-3">
        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</div>
        {badge && (
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-md', badgeStyles[badgeColor || 'gray'])}>
            {badge}
          </span>
        )}
      </div>
      <div className={cn('text-3xl font-bold', valueColor)}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1.5">{sub}</div>}
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
  const [verificandoDup, setVerificandoDup] = useState(false);
  const [avisosDup, setAvisosDup] = useState<Array<{ id: string; nome: string }>>([]);

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

          {avisosDup.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 space-y-2">
              <div className="flex items-start gap-2 font-medium">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                Já existe{avisosDup.length > 1 ? 'm' : ''} {avisosDup.length} campanha{avisosDup.length > 1 ? 's' : ''} com nome similar nos últimos 7 dias:
              </div>
              <ul className="list-disc list-inside text-xs space-y-0.5 pl-1">
                {avisosDup.map(d => <li key={d.id}>{d.nome}</li>)}
              </ul>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setAvisosDup([]); setStep(2); }}
                  className="text-xs font-medium text-amber-900 underline hover:no-underline"
                >
                  Criar mesmo assim
                </button>
                <span className="text-amber-400">·</span>
                <button
                  onClick={() => setAvisosDup([])}
                  className="text-xs text-amber-700 hover:text-amber-900"
                >
                  Alterar nome
                </button>
              </div>
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
              onClick={async () => {
                if (step === 1) {
                  // Verificar duplicatas antes de avançar
                  setVerificandoDup(true);
                  setAvisosDup([]);
                  try {
                    const seteAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    const res = await authFetch(
                      `/api/trafego/metrics?campaign_name_filter=${encodeURIComponent(nome.trim())}&since=${seteAtras}`
                    );
                    if (res.ok) {
                      const dados = await res.json() as { campaigns?: Array<{ id: string; nome: string }> };
                      const iguais = (dados.campaigns ?? []).filter(
                        c => c.nome.toLowerCase().includes(nome.trim().toLowerCase())
                      );
                      if (iguais.length > 0) {
                        setAvisosDup(iguais);
                        return; // não avança — mostra aviso
                      }
                    }
                  } catch { /* silencia: se falhar a checagem, avança normalmente */ }
                  finally { setVerificandoDup(false); }
                }
                setStep(s => (s + 1) as 2 | 3);
              }}
              disabled={(step === 1 ? !canGoStep2 : !canGoStep3) || verificandoDup}
              className="px-5 py-2.5 rounded-xl bg-crm-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
            >
              {verificandoDup ? <Loader2 size={14} className="animate-spin" /> : null}
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

/* ─── Aba de Públicos ──────────────────────────────────────────────────────── */

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

  // Criação manual de público
  const [formManual, setFormManual] = useState(false);
  const [formNome, setFormNome] = useState('');
  const [formSegmento, setFormSegmento] = useState<'revendedoras' | 'franqueadas' | 'marca_propria' | 'personalizado'>('revendedoras');
  const [formIdadeMin, setFormIdadeMin] = useState('25');
  const [formIdadeMax, setFormIdadeMax] = useState('50');
  const [formGenero, setFormGenero] = useState<'feminino' | 'masculino' | 'todos'>('feminino');
  const [criandoManual, setCriandoManual] = useState(false);
  const [formFeedback, setFormFeedback] = useState<string | null>(null);

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

  const handleCriarManual = async () => {
    if (!formNome.trim()) { setFormFeedback('Informe o nome do público'); return; }
    setCriandoManual(true);
    setFormFeedback(null);
    try {
      const res = await authFetch('/api/trafego/publicos/criar', {
        method: 'POST',
        body: JSON.stringify({
          nome: formNome.trim(),
          segmento: formSegmento,
          idade_min: parseInt(formIdadeMin) || 25,
          idade_max: parseInt(formIdadeMax) || 50,
          genero: formGenero,
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string; estimativa_alcance?: string; interesses_encontrados?: string[] };
      if (json.ok) {
        setFormFeedback(`✅ Público criado! Alcance: ${json.estimativa_alcance || 'calculando...'}`);
        setFormNome('');
        setFormManual(false);
        carregarDados();
      } else {
        setFormFeedback(json.error || 'Erro ao criar público');
      }
    } catch (e) {
      setFormFeedback(String(e));
    } finally {
      setCriandoManual(false);
    }
  };

  return (
    <div className="space-y-6">
      {formFeedback && (
        <div className={cn(
          'rounded-xl px-4 py-3 text-sm border',
          formFeedback.startsWith('✅')
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        )}>
          {formFeedback}
          <button onClick={() => setFormFeedback(null)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900">Públicos</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setFormManual(f => !f)}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl border border-purple-200 text-purple-700 hover:bg-purple-50"
          >
            <Plus size={13} /> Criar manual
          </button>
          <button
            onClick={carregarDados}
            disabled={loading || criandoComIA}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
      </div>

      {/* Formulário de criação manual */}
      {formManual && (
        <div className="bg-white rounded-2xl border border-purple-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900 text-sm">Criar público manualmente</h3>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Quem você quer atingir?</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { v: 'revendedoras',  l: 'Revendedoras e lojistas' },
                { v: 'franqueadas',   l: 'Candidatas a franqueadas C4' },
                { v: 'marca_propria', l: 'Compradores marca própria' },
                { v: 'personalizado', l: 'Personalizado' },
              ] as const).map(({ v, l }) => (
                <button
                  key={v}
                  onClick={() => setFormSegmento(v)}
                  className={cn(
                    'py-2 px-3 rounded-xl border text-xs font-medium text-left transition-all',
                    formSegmento === v
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nome do público *</label>
            <input
              type="text"
              value={formNome}
              onChange={e => setFormNome(e.target.value)}
              placeholder="Ex: Revendedoras SP/RJ"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Idade mínima</label>
              <input type="number" min={18} max={64} value={formIdadeMin} onChange={e => setFormIdadeMin(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Idade máxima</label>
              <input type="number" min={19} max={65} value={formIdadeMax} onChange={e => setFormIdadeMax(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Gênero</label>
            <div className="flex gap-2">
              {([{ v: 'feminino', l: 'Mulheres' }, { v: 'masculino', l: 'Homens' }, { v: 'todos', l: 'Todos' }] as const).map(({ v, l }) => (
                <button key={v} onClick={() => setFormGenero(v)}
                  className={cn('flex-1 py-2 rounded-xl border text-xs font-medium transition-all',
                    formGenero === v ? 'bg-crm-primary text-white border-crm-primary' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  )}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={() => setFormManual(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm hover:bg-gray-50">
              Cancelar
            </button>
            <button
              onClick={handleCriarManual}
              disabled={criandoManual || !formNome.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              {criandoManual ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              {criandoManual ? 'Criando...' : 'Criar público'}
            </button>
          </div>
        </div>
      )}

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
          <Users size={36} className="text-gray-300 mx-auto mb-3" />
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

/* ─── Aba Análise (José + fila de aprovação) ───────────────────────────────── */

interface AcaoPendente {
  id: string;
  agent: string;
  action_type: string;
  alvo_nome?: string;
  motivo: string;
  urgencia: string;
  status: string;
  created_at: string;
}

function AnaliseTab() {
  const [loading, setLoading]           = useState(true);
  const [analisando, setAnalisando]     = useState(false);
  const [acoes, setAcoes]               = useState<AcaoPendente[]>([]);
  const [analise, setAnalise]           = useState<{
    resumo_executivo?: string;
    situacao_geral?: string;
    metricas_consolidadas?: {
      gasto_total: number; retorno_total: number; roas_medio: number;
      leads_total: number; cpl_medio: number; campanhas_ativas: number; campanhas_problemas: number;
    };
  } | null>(null);
  const [aprovando, setAprovando]       = useState<string | null>(null);
  const [feedback, setFeedback]         = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/ai-team/analise-performance');
      if (res.ok) {
        const json = await res.json() as {
          ultima_analise?: { analyst_output?: typeof analise };
          acoes_pendentes?: AcaoPendente[];
        };
        setAcoes(json.acoes_pendentes || []);
        setAnalise(json.ultima_analise?.analyst_output || null);
      }
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function handleAnalisar() {
    setAnalisando(true);
    try {
      const res = await authFetch('/api/ai-team/analise-performance', { method: 'POST' });
      const json = await res.json() as { ok?: boolean; analise?: typeof analise; error?: string };
      if (json.ok && json.analise) {
        setAnalise(json.analise);
        await carregar();
        setFeedback('Análise concluída! Ações adicionadas à fila de aprovação.');
        setTimeout(() => setFeedback(null), 5000);
      } else {
        setFeedback(json.error || 'Erro ao analisar campanhas');
        setTimeout(() => setFeedback(null), 5000);
      }
    } catch (e) {
      setFeedback(String(e));
    } finally {
      setAnalisando(false);
    }
  }

  async function handleAprovar(id: string, aprovar: boolean) {
    setAprovando(id);
    try {
      const token = useAuthStore.getState().accessToken;
      const res = await fetch(`/api/ai-team/actions/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: aprovar ? 'approved' : 'rejected' }),
      });
      if (res.ok) {
        setAcoes(prev => prev.filter(a => a.id !== id));
        setFeedback(aprovar ? 'Ação aprovada!' : 'Ação rejeitada.');
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch { /* silencioso */ }
    finally { setAprovando(null); }
  }

  const situacaoColor = {
    otima:   'text-green-700 bg-green-50 border-green-200',
    boa:     'text-blue-700 bg-blue-50 border-blue-200',
    atencao: 'text-amber-700 bg-amber-50 border-amber-200',
    critica: 'text-red-700 bg-red-50 border-red-200',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900">Análise de Performance</h2>
          <p className="text-xs text-gray-400 mt-0.5">José analisa suas campanhas e identifica oportunidades</p>
        </div>
        <button
          onClick={handleAnalisar}
          disabled={analisando}
          className="flex items-center gap-2 px-4 py-2 bg-crm-primary text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          {analisando ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          {analisando ? 'Analisando...' : 'Analisar agora'}
        </button>
      </div>

      {feedback && (
        <div className={cn(
          'rounded-xl px-4 py-3 text-sm flex items-center gap-2',
          feedback.includes('Erro') || feedback.includes('erro')
            ? 'bg-red-50 border border-red-200 text-red-800'
            : 'bg-green-50 border border-green-200 text-green-800'
        )}>
          {feedback}
        </div>
      )}

      {loading && (
        <div className="text-center py-12 text-gray-400 text-sm">
          <Loader2 size={24} className="animate-spin mx-auto mb-2" />
          Carregando análise...
        </div>
      )}

      {/* Resumo do José */}
      {!loading && analise && (
        <div className={cn(
          'rounded-2xl border p-5',
          situacaoColor[(analise.situacao_geral as keyof typeof situacaoColor) || 'boa']
        )}>
          <div className="flex items-start gap-3">
            <span className="text-2xl">👨</span>
            <div>
              <div className="font-semibold text-sm mb-1">José analisou suas campanhas:</div>
              <p className="text-sm leading-relaxed">{analise.resumo_executivo || 'Sem análise disponível ainda.'}</p>
            </div>
          </div>
          {analise.metricas_consolidadas && (
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-current/20">
              <div className="text-center">
                <div className="font-bold text-lg">{brl(analise.metricas_consolidadas.gasto_total)}</div>
                <div className="text-xs opacity-70">Investido</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-lg">{analise.metricas_consolidadas.roas_medio.toFixed(1)}x</div>
                <div className="text-xs opacity-70">ROAS médio</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-lg">{analise.metricas_consolidadas.campanhas_problemas}</div>
                <div className="text-xs opacity-70">Com problema</div>
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && !analise && (
        <div className="text-center py-8 bg-gray-50 rounded-2xl border border-gray-100">
          <Zap size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Nenhuma análise realizada ainda</p>
          <p className="text-gray-400 text-xs mt-1">Clique em "Analisar agora" para o José verificar suas campanhas</p>
        </div>
      )}

      {/* Fila de aprovação */}
      {!loading && acoes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Ações aguardando aprovação ({acoes.length})
          </h3>
          <div className="space-y-3">
            {acoes.map((acao) => (
              <div
                key={acao.id}
                className={cn(
                  'rounded-2xl border p-4',
                  acao.urgencia === 'imediata' ? 'bg-red-50 border-red-200' :
                  'bg-amber-50 border-amber-200'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900">
                        {acao.alvo_nome || 'Campanha'}
                      </span>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium',
                        acao.urgencia === 'imediata' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      )}>
                        {acao.urgencia === 'imediata' ? '🔴 Urgente' :
                         acao.urgencia === 'proximas_24h' ? '🟡 Hoje' : '🟢 Esta semana'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{acao.motivo}</p>
                    <p className="text-xs text-gray-400 mt-1">Sugerido por: {acao.agent}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleAprovar(acao.id, false)}
                      disabled={aprovando === acao.id}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-100 disabled:opacity-50"
                    >
                      Rejeitar
                    </button>
                    <button
                      onClick={() => handleAprovar(acao.id, true)}
                      disabled={aprovando === acao.id}
                      className="px-3 py-1.5 rounded-lg bg-crm-primary text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
                    >
                      {aprovando === acao.id ? <Loader2 size={11} className="animate-spin" /> : null}
                      Aprovar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && acoes.length === 0 && analise && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 flex items-center gap-2">
          <CheckCircle size={16} />
          Nenhuma ação pendente — tudo em ordem!
        </div>
      )}
    </div>
  );
}

/* ─── Aba Relatório ────────────────────────────────────────────────────────── */

function RelatorioTab() {
  const [loading, setLoading]     = useState(false);
  const [relatorio, setRelatorio] = useState<{
    periodo?: string;
    gerado_em?: string;
    resumo?: { gasto_total: number; retorno_total: number; roas_medio: number; leads_total: number; cpl_medio: number };
    campanhas?: Array<{ nome: string; status: string; health: string; spend: number; leads: number; cpl: number; roas: number }>;
    texto_relatorio?: string;
  } | null>(null);
  const [periodo, setPeriodo] = useState<'last_7d' | 'last_14d' | 'last_30d'>('last_7d');
  const [copiado, setCopiado] = useState(false);

  const gerarRelatorio = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/ai-team/relatorio?periodo=${p}`);
      if (res.ok) {
        const json = await res.json();
        setRelatorio(json);
      }
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { gerarRelatorio(periodo); }, [gerarRelatorio, periodo]);

  function copiarTexto() {
    if (!relatorio?.texto_relatorio) return;
    navigator.clipboard.writeText(relatorio.texto_relatorio);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  const healthColors: Record<string, string> = {
    great: 'text-green-700',
    ok:    'text-amber-700',
    bad:   'text-red-700',
    paused:'text-gray-500',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bold text-gray-900">Relatório de Performance</h2>
          <p className="text-xs text-gray-400 mt-0.5">Gerado pelo Cláudio em português simples</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {([
              { value: 'last_7d',  label: '7 dias' },
              { value: 'last_14d', label: '15 dias' },
              { value: 'last_30d', label: '30 dias' },
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setPeriodo(value)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  periodo === value ? 'bg-crm-primary text-white shadow-sm' : 'bg-transparent text-gray-600 hover:bg-gray-200'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => gerarRelatorio(periodo)}
            disabled={loading}
            className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center py-12 text-gray-400 text-sm">
          <Loader2 size={24} className="animate-spin mx-auto mb-2" />
          Cláudio está gerando seu relatório...
        </div>
      )}

      {!loading && relatorio && (
        <div className="space-y-5">
          {/* Cards de resumo */}
          {relatorio.resumo && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="text-xs text-gray-500 mb-1">Investido</div>
                <div className="font-bold text-gray-900">{brl(relatorio.resumo.gasto_total)}</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="text-xs text-gray-500 mb-1">Retorno</div>
                <div className="font-bold text-gray-900">{brl(relatorio.resumo.retorno_total)}</div>
              </div>
              <div className={cn(
                'rounded-xl p-4 border',
                relatorio.resumo.roas_medio >= 3 ? 'bg-green-50 border-green-200' :
                relatorio.resumo.roas_medio >= 1.5 ? 'bg-amber-50 border-amber-200' :
                'bg-red-50 border-red-200'
              )}>
                <div className="text-xs text-gray-500 mb-1">ROAS médio</div>
                <div className="font-bold text-gray-900">{relatorio.resumo.roas_medio.toFixed(1)}x</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="text-xs text-gray-500 mb-1">Leads</div>
                <div className="font-bold text-gray-900">{relatorio.resumo.leads_total}</div>
                {relatorio.resumo.cpl_medio > 0 && (
                  <div className="text-xs text-gray-400">{brl(relatorio.resumo.cpl_medio)}/lead</div>
                )}
              </div>
            </div>
          )}

          {/* Campanhas resumidas */}
          {relatorio.campanhas && relatorio.campanhas.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Campanhas</h3>
              <div className="space-y-2">
                {relatorio.campanhas.map((c, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 px-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm font-medium', healthColors[c.health] || 'text-gray-700')}>
                        {c.health === 'great' ? '✅' : c.health === 'bad' ? '⚠️' : c.health === 'paused' ? '⏸️' : '🟡'}
                        {' '}{c.nome}
                      </span>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      <span className="font-medium text-gray-700">{brl(c.spend)}</span>
                      {c.leads > 0 && <span className="ml-2">{c.leads} leads · {brl(c.cpl)}/lead</span>}
                      <span className="ml-2">ROAS {c.roas.toFixed(1)}x</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Texto do relatório (Cláudio) */}
          {relatorio.texto_relatorio && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🧠</span>
                  <span className="font-semibold text-gray-900 text-sm">Relatório do Cláudio</span>
                </div>
                <button
                  onClick={copiarTexto}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  <Copy size={12} />
                  {copiado ? 'Copiado!' : 'Copiar para WhatsApp'}
                </button>
              </div>
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                {relatorio.texto_relatorio}
              </pre>
            </div>
          )}

          {relatorio.gerado_em && (
            <p className="text-xs text-gray-400 text-center">
              Gerado em {formatDateTime(relatorio.gerado_em)}
            </p>
          )}
        </div>
      )}

      {!loading && !relatorio && (
        <div className="text-center py-8 bg-gray-50 rounded-2xl border border-gray-100">
          <BarChart3 size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Clique em atualizar para gerar o relatório</p>
        </div>
      )}
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
  const [showAddAccount, setShowAddAccount] = useState(false);

  const { accounts, activeAccount, setActiveAccount, addAccount, loading: accountsLoading } = useMetaAccounts();

  const loadMetrics = useCallback(async (p: Period, accountId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period: p });
      if (accountId) params.set('account_id', accountId);
      const res = await authFetch(`/api/trafego/metrics?${params.toString()}`);
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
    loadMetrics(period, activeAccount?.ad_account_id);
    loadCopies();
    loadLastSync();
  }, [loadMetrics, loadCopies, loadLastSync, period, activeAccount?.ad_account_id]);

  async function handleSync() {
    setSyncing(true);
    try {
      const body = activeAccount?.ad_account_id
        ? JSON.stringify({ account_id: activeAccount.ad_account_id })
        : undefined;
      const res = await authFetch('/api/trafego/sync', { method: 'POST', body });
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
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">

        {/* ─── Cabeçalho ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">

        <AddAccountModal
          open={showAddAccount}
          onClose={() => setShowAddAccount(false)}
          onAdd={async (nome, adAccountId, cor) => { await addAccount(nome, adAccountId, cor); }}
        />

        <div className="px-5 py-4">
          {/* Linha 1: título + conta + período + sync */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-4 min-w-0">
              <div className="shrink-0">
                <h1 className="text-base font-bold text-gray-900">Tráfego Pago</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  {activeAccount?.nome || data?.accountName || 'CJ Rasteirinhas'}
                </p>
              </div>

              {/* Conta(s) inline */}
              {(accounts.length > 0 || accountsLoading) && (
                <div className="flex items-center gap-1 overflow-x-auto shrink-0">
                  {accountsLoading ? (
                    <div className="h-6 w-24 rounded-full bg-gray-200 animate-pulse" />
                  ) : accounts.map(acc => (
                    <button
                      key={acc.id}
                      onClick={() => setActiveAccount(acc)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all border',
                        activeAccount?.id === acc.id
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-200'
                      )}
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: acc.cor }} />
                      {acc.nome}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowAddAccount(true)}
                    className="text-gray-400 hover:text-gray-700 px-1.5 transition-colors"
                    title="Nova conta"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <div className="flex gap-1">
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm font-medium"
              >
                {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {syncing ? 'Sincronizando...' : 'Sincronizar'}
              </button>
            </div>
          </div>

          {/* Linha 2: analistas IA + última sync */}
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 flex-wrap">
            {data?.lastAnalysis ? (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  José analisou às {new Date(data.lastAnalysis).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  Cláudio sugeriu às {new Date(data.lastAnalysis).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </>
            ) : (
              <span className="text-gray-600">Nenhuma análise ainda</span>
            )}
            {lastSync && (
              <span className="ml-auto">última sync · {new Date(lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </div>
        </div>
        </div>{/* /header card */}

        {/* ─── Feedback de ação ────────────────────────────────────────────── */}
        {actionFeedback && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-sm text-emerald-400 flex items-center gap-2">
            <CheckCircle size={16} />
            {actionFeedback}
          </div>
        )}

        {/* ─── Aviso de cache ──────────────────────────────────────────────── */}
        {!loading && data?.fromCache && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-600 flex items-center gap-2">
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
              <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-amber-700">Conta Meta não conectada</div>
                <div className="text-sm text-amber-500 mt-0.5">
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
              <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 animate-pulse">
                <div className="h-3 w-16 bg-gray-200 rounded mb-4" />
                <div className="h-8 w-20 bg-gray-200 rounded mb-2" />
                <div className="h-2.5 w-24 bg-gray-100 rounded" />
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
                label="INVESTIDO"
                value={brl(s.totalSpend)}
                sub={`últimos ${periodLabel.toLowerCase()}`}
              />
              <MetricCard
                label="RETORNO GERADO"
                value={brl(s.totalRevenue)}
                badge={roasBadge.label}
                badgeColor={roasBadge.color}
                sub={`ROAS ${s.totalRoas.toFixed(2)}× — ideal mín. 3×`}
              />
              <MetricCard
                label="CLIQUES"
                value={n0(s.totalClicks)}
                sub={s.totalCpc > 0 ? `${brl2(s.totalCpc)} / clique` : undefined}
              />
              <MetricCard
                label="LEADS GERADOS"
                value={n0(s.totalLeads)}
                sub={s.totalCpl > 0 ? `${brl2(s.totalCpl)} / lead · ideal R$20` : undefined}
                badge={s.totalLeads > 0 ? (s.totalCpl <= 20 ? 'Bom' : s.totalCpl <= 30 ? 'Atenção' : 'Caro') : undefined}
                badgeColor={s.totalLeads > 0 ? (s.totalCpl <= 20 ? 'green' : s.totalCpl <= 30 ? 'yellow' : 'red') : 'gray'}
              />
            </div>
          );
        })()}

        {/* ─── Alertas inteligentes ────────────────────────────────────────── */}
        {!loading && allAlerts.length > 0 && (
          <div className="bg-white rounded-2xl border border-red-200 p-5">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={16} className="text-red-500 shrink-0" />
              <h2 className="font-bold text-gray-900 text-sm">
                José identificou {allAlerts.length} situaç{allAlerts.length === 1 ? 'ão' : 'ões'} crítica{allAlerts.length !== 1 ? 's' : ''}
              </h2>
            </div>
            <p className="text-xs text-gray-500 mb-4 ml-6">
              {allAlerts[0].mensagem} — ação recomendada: {allAlerts[0].acao === 'pausar' ? 'pausar agora' : allAlerts[0].acao || 'revisar'}
            </p>
            <div className="space-y-3">
              {allAlerts.slice(0, 5).map((alert, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border',
                    alert.tipo === 'danger'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-amber-50 border-amber-200'
                  )}
                >
                  <div className="min-w-0">
                    <div className={cn('font-semibold text-xs flex items-center gap-2 flex-wrap', alert.tipo === 'danger' ? 'text-red-600' : 'text-amber-600')}>
                      {alert.campaign.nome.split('·').map((part, pi) => (
                        <span key={pi}>{part.trim()}{pi < alert.campaign.nome.split('·').length - 1 ? ' ·' : ''}</span>
                      ))}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {alert.mensagem}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => { setSelectedCampaign(alert.campaign); setTab('campanhas'); }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 border border-gray-200 text-gray-600 hover:bg-gray-200 whitespace-nowrap"
                    >
                      Ver campanha
                    </button>
                    {(alert.acao === 'pausar' || alert.tipo === 'danger') && (
                      <button
                        onClick={() => { setSelectedCampaign(alert.campaign); }}
                        className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 whitespace-nowrap flex items-center gap-1"
                      >
                        <Pause size={11} /> Pausar agora
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Abas ────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100">
          {/* Tab headers */}
          <div className="flex items-center border-b border-gray-100 overflow-x-auto">
            <div className="flex flex-1">
              {(
                [
                  { key: 'campanhas', label: 'Campanhas' },
                  { key: 'criativos', label: 'Criativos' },
                  { key: 'publicos',  label: 'Públicos' },
                  { key: 'textos',    label: 'Textos' },
                  { key: 'analise',   label: 'Análise' },
                  { key: 'relatorio', label: 'Relatório' },
                  { key: 'config',   label: 'Configurações' },
                  { key: 'agente',   label: '⚡ Agente' },
                ] as { key: Tab; label: string }[]
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={cn(
                    'px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                    tab === key
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === 'publicos' && (
              <button className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 px-4 py-3.5 transition-colors whitespace-nowrap">
                <Plus size={12} /> Criar público
              </button>
            )}
            {tab === 'campanhas' && (
              <button
                onClick={() => setNovaCampanhaOpen(true)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 px-4 py-3.5 transition-colors whitespace-nowrap"
              >
                <Plus size={12} /> Nova campanha
              </button>
            )}
          </div>

          <div className="p-5">
            {/* ── CAMPANHAS ── */}
            {tab === 'campanhas' && (
              <div className="space-y-4">
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
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
                        )}
                      >
                        {f.label}
                        {f.value !== 'all' && (
                          <span className="ml-1 opacity-60">
                            ({(data?.campaigns || []).filter(c => c.effective_status === f.value).length})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {loading && (
                  <div className="text-center py-12 text-gray-600 text-sm">Carregando campanhas...</div>
                )}

                {!loading && (!data?.campaigns || data.campaigns.length === 0) && (
                  <div className="text-center py-12">
                    <Target size={40} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">Nenhuma campanha encontrada no período</p>
                    <p className="text-gray-600 text-xs mt-1">
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
                            <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-widest pb-3">Campanha</th>
                            <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-widest pb-3">Status</th>
                            <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-widest pb-3">Saúde</th>
                            <th className="text-right text-[10px] font-semibold text-gray-600 uppercase tracking-widest pb-3">Gasto</th>
                            <th className="text-right text-[10px] font-semibold text-gray-600 uppercase tracking-widest pb-3">ROAS</th>
                            <th className="text-right text-[10px] font-semibold text-gray-600 uppercase tracking-widest pb-3">Leads</th>
                            <th className="text-right pb-3" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filtered.map((c) => (
                            <tr key={c.id} className="hover:bg-gray-50 transition-colors group">
                              <td className="py-3 pr-4">
                                <div className="font-medium text-gray-800 text-sm">{c.nome}</div>
                                {c.alerts.length > 0 && (
                                  <div className="text-xs text-red-400 mt-0.5">
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
                              <td className="py-3 pr-4 text-right text-sm font-medium text-gray-700">
                                {brl(c.spend)}
                              </td>
                              <td className="py-3 pr-4 text-right">
                                <div className={cn('text-sm font-medium', c.roas >= 3 ? 'text-emerald-400' : c.roas >= 1.5 ? 'text-amber-400' : 'text-red-400')}>
                                  {c.roas > 0 ? `${c.roas.toFixed(1)}×` : '—'}
                                </div>
                              </td>
                              <td className="py-3 pr-4 text-right text-sm text-gray-400">
                                {c.leads > 0 ? c.leads : '—'}
                              </td>
                              <td className="py-3">
                                <button
                                  onClick={() => setSelectedCampaign(c)}
                                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 flex items-center gap-1 whitespace-nowrap transition-colors"
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

            {/* ── CRIADOR DE CAMPANHA ── */}
            {tab === 'campanhas' && (
              <div className="mt-6 pt-6 border-t border-gray-100">
                <CriadorCampanha pageId="110009834520002" whatsappNumber="5562993044255" />
              </div>
            )}

            {/* ── CRIATIVOS ── */}
            {tab === 'criativos' && <GaleriaCriativos />}

            {/* ── PÚBLICOS ── */}
            {tab === 'publicos' && (
              <>
                {/* Performance + Sugestões das IAs */}
                {data?.summary && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
                    {/* Coluna esquerda: barras de performance */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-4">Performance da semana</h3>
                      <div className="space-y-4">
                        {[
                          { label: 'CPC', value: data.summary.totalCpc > 0 ? brl2(data.summary.totalCpc) : '—', color: 'bg-green-500', pct: data.summary.totalCpc > 0 ? Math.min(100, (data.summary.totalCpc / 2) * 100) : 0 },
                          { label: 'CTR', value: (data.campaigns || []).length > 0 ? pct((data.campaigns || []).reduce((s, c) => s + c.ctr, 0) / (data.campaigns || []).length) : '—', color: 'bg-blue-500', pct: 35 },
                          { label: 'CPM', value: (data.campaigns || []).length > 0 ? brl2((data.campaigns || []).reduce((s, c) => s + c.cpm, 0) / (data.campaigns || []).length) : '—', color: 'bg-orange-500', pct: 45 },
                          { label: 'CPL', value: data.summary.totalCpl > 0 ? brl2(data.summary.totalCpl) : '—', color: 'bg-red-500', pct: data.summary.totalCpl > 0 ? Math.min(100, (data.summary.totalCpl / 150) * 100) : 0 },
                          { label: 'Alcance', value: n0((data.campaigns || []).reduce((s, c) => s + c.reach, 0)), color: 'bg-gray-500', pct: 20 },
                        ].map(({ label, value, color, pct: barPct }) => (
                          <div key={label} className="flex items-center gap-3">
                            <span className="text-xs text-gray-500 w-12 shrink-0">{label}</span>
                            <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                              <div className={cn('h-1.5 rounded-full transition-all', color)} style={{ width: `${barPct}%` }} />
                            </div>
                            <span className="text-xs font-mono text-gray-400 w-16 text-right shrink-0">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Coluna direita: sugestões das IAs */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-gray-700">Sugestões das IAs</h3>
                        {allAlerts.length > 0 && (
                          <span className="text-xs bg-gray-100 text-gray-500 rounded-md px-2 py-0.5">
                            {Math.min(allAlerts.length, 2)}
                          </span>
                        )}
                      </div>
                      <div className="space-y-3">
                        {allAlerts.length > 0 ? (
                          <>
                            <div className="flex gap-3">
                              <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-bold shrink-0">J</div>
                              <p className="text-xs text-gray-400 leading-relaxed">
                                <span className="text-gray-800 font-medium">José:</span>{' '}
                                {allAlerts[0].tipo === 'danger'
                                  ? `Pausar ${allAlerts[0].campaign.nome} imediatamente. ${allAlerts[0].mensagem}.`
                                  : allAlerts[0].mensagem}
                              </p>
                            </div>
                            <div className="flex gap-3">
                              <div className="w-7 h-7 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">C</div>
                              <p className="text-xs text-gray-400 leading-relaxed">
                                <span className="text-gray-800 font-medium">Cláudio:</span>{' '}
                                {allAlerts.length > 1
                                  ? allAlerts[1].mensagem
                                  : 'Criar público lookalike dos clientes com maior LTV. Testar R$30/dia por 3 dias antes de escalar orçamento.'}
                              </p>
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-gray-600">Nenhum alerta ativo no período.</p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-5">
                        <div>
                          <div className="text-[10px] text-gray-600 uppercase tracking-wider">ROAS ATUAL</div>
                          <div className="text-xl font-bold text-gray-900 mt-0.5">
                            {data.summary.totalRoas > 0 ? `${data.summary.totalRoas.toFixed(2)}×` : '—'}
                          </div>
                          <div className="text-[10px] text-gray-600 mt-0.5">meta: 3× mínimo</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-600 uppercase tracking-wider">EFICIÊNCIA</div>
                          <div className="text-xl font-bold text-amber-400 mt-0.5">
                            {data.summary.totalRoas > 0
                              ? `${Math.min(100, Math.round((data.summary.totalRoas / 3) * 100))}%`
                              : '—'}
                          </div>
                          <div className="text-[10px] text-gray-600 mt-0.5">do potencial da conta</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <PublicosTab />
              </>
            )}

            {/* ── TEXTOS ── */}
            {tab === 'textos' && <TextosTab copies={copies} />}

            {/* ── ANÁLISE ── */}
            {tab === 'analise' && <AnaliseTab />}

            {/* ── RELATÓRIO ── */}
            {tab === 'relatorio' && <RelatorioTab />}

            {/* ── AGENTE ── */}
            {tab === 'agente' && (
              <AgenteTrafegoPanel />
            )}

            {/* ── CONFIG ── */}
            {tab === 'config' && (
              <div className="max-w-lg">
                <h2 className="font-bold text-gray-900 mb-1">Conexão com o Meta Ads</h2>
                <p className="text-xs text-gray-500 mb-5">
                  Configure um System User Token para integração permanente sem expiração.
                </p>
                <MetaTokenConfig />
              </div>
            )}
          </div>
        </div>

        {/* ─── Pedro — Sazonalidade ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm">📅</span>
            <h2 className="font-semibold text-gray-700 text-sm">Pedro monitorando oportunidades</h2>
          </div>
          <div className="space-y-3">
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-700">
              <strong>{sazon.status}</strong>
              <div className="mt-1 text-orange-600 text-xs">Recomendação: {sazon.recomendacao}</div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
                <strong>📌 {sazon.proximaData}</strong>
              </div>
              <div className="flex-1 bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-sm text-purple-700">
                <strong>💡</strong> {sazon.dica}
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
