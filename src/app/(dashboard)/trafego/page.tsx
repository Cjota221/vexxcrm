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
import { FilaAprovacao } from '@/components/meta/FilaAprovacao';
import { InicializadorPublicos } from '@/components/meta/InicializadorPublicos';
import { BibliotecaInteresses } from '@/components/meta/BibliotecaInteresses';

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
  Plus, Globe, Wand2, Settings, Bot, Link,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─── Tipos ────────────────────────────────────────────────────────────────── */

interface CampaignAlert {
  tipo: 'danger' | 'warning';
  mensagem: string;
  acao?: string;
}

interface VideoMetrics {
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  p100: number;
  thruplay: number;
  avg_watch: number;
  cost_per_thruplay: number;
}

interface DailyMetric {
  date: string;
  spend: number;
  revenue: number;
  leads: number;
  clicks: number;
  impressions: number;
  reach: number;
  cpc: number;
  cpm: number;
  ctr: number;
  frequency: number;
  roas: number;
  cpl: number;
}

interface BreakdownRow {
  segment: string;
  spend: number;
  revenue: number;
  leads: number;
  clicks: number;
  impressions: number;
  reach: number;
  cpc: number;
  cpm: number;
  ctr: number;
  frequency: number;
  roas: number;
  cpl: number;
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
  landing_page_views?: number;
  video?: VideoMetrics;
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

interface MetaAdset {
  id: string;
  name: string;
  status: string;
  effective_status?: string;
  daily_budget?: string;
  optimization_goal?: string;
}

interface MetaAd {
  id: string;
  name: string;
  status: string;
  effective_status?: string;
  adset_id?: string;
  creative?: {
    id: string;
    thumbnail_url?: string;
    title?: string;
    body?: string;
  };
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
type Tab = 'campanhas' | 'criativos' | 'publicos' | 'textos' | 'analise' | 'relatorio' | 'config' | 'agente' | 'aprovacoes' | 'leads' | 'regras' | 'consolidado' | 'abtest' | 'catalogo' | 'biblioteca';

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

  // Ad Sets state
  interface AdsetItem {
    id: string; nome: string; status: string; effective_status: string;
    status_legivel: string; tipo_orcamento: string; orcamento_diario: number | null;
    objetivo_otimizacao?: string;
    targeting_traduzido: { sexo: string; idade: string; localizacao: string; interesses: string[]; tamanho_estimado: string };
    metricas: { spend: number; revenue: number; leads: number; clicks: number; reach: number; roas: number; cpl: number; cpc: number; cpm: number; ctr: number; frequency: number };
  }
  const [adsetItems, setAdsetItems]       = useState<AdsetItem[]>([]);
  const [adsetsLoading, setAdsetsLoading] = useState(false);
  const [adsetsLoaded, setAdsetsLoaded]   = useState(false);
  const [adsetAction, setAdsetAction]     = useState<{ id: string; loading: boolean } | null>(null);
  const [adsetBudgetEdit, setAdsetBudgetEdit] = useState<{ id: string; value: string } | null>(null);

  async function loadAdsets() {
    if (adsetsLoaded) return;
    setAdsetsLoading(true);
    try {
      const res = await authFetch(`/api/trafego/adsets?campaign_id=${campaign.id}`);
      if (res.ok) {
        const json = await res.json() as { adsets: AdsetItem[] };
        setAdsetItems(json.adsets || []);
        setAdsetsLoaded(true);
      }
    } catch { /* silencioso */ }
    finally { setAdsetsLoading(false); }
  }

  async function toggleAdsetStatus(adset: AdsetItem) {
    const novoStatus = adset.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setAdsetAction({ id: adset.id, loading: true });
    try {
      const res = await authFetch('/api/trafego/adsets', {
        method: 'PUT',
        body: JSON.stringify({ adset_id: adset.id, novo_status: novoStatus }),
      });
      if (res.ok) {
        setAdsetItems(prev => prev.map(a => a.id === adset.id ? { ...a, status: novoStatus, effective_status: novoStatus } : a));
        onActionComplete(`Conjunto "${adset.nome}" ${novoStatus === 'PAUSED' ? 'pausado' : 'ativado'}.`);
      } else {
        const err = await res.json() as { error?: string };
        setPanelError(err.error || 'Erro ao alterar conjunto');
      }
    } catch (e) { setPanelError(String(e)); }
    finally { setAdsetAction(null); }
  }

  async function saveAdsetBudget(adset: AdsetItem) {
    if (!adsetBudgetEdit) return;
    const valor = parseFloat(adsetBudgetEdit.value);
    if (!valor || valor <= 0) return;
    setAdsetAction({ id: adset.id, loading: true });
    try {
      const res = await authFetch('/api/trafego/adsets', {
        method: 'PUT',
        body: JSON.stringify({ adset_id: adset.id, novo_orcamento_diario: valor }),
      });
      if (res.ok) {
        setAdsetItems(prev => prev.map(a => a.id === adset.id ? { ...a, orcamento_diario: valor } : a));
        setAdsetBudgetEdit(null);
        onActionComplete(`Orçamento do conjunto "${adset.nome}" atualizado.`);
      } else {
        const err = await res.json() as { error?: string };
        setPanelError(err.error || 'Erro ao atualizar orçamento');
      }
    } catch (e) { setPanelError(String(e)); }
    finally { setAdsetAction(null); }
  }

  // Daily history state
  const [dailyData, setDailyData] = useState<DailyMetric[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyLoaded, setDailyLoaded] = useState(false);
  const [dailyMetric, setDailyMetric] = useState<'spend' | 'roas' | 'leads' | 'cpl'>('spend');

  // Breakdown state
  const [breakdownData, setBreakdownData] = useState<BreakdownRow[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownLoaded, setBreakdownLoaded] = useState(false);
  const [breakdownBy, setBreakdownBy] = useState<'publisher_platform' | 'age' | 'gender' | 'impression_device'>('publisher_platform');

  async function loadDaily() {
    if (dailyLoaded) return;
    setDailyLoading(true);
    try {
      const res = await authFetch(`/api/trafego/metrics/daily?campaign_id=${campaign.id}`);
      if (res.ok) {
        const json = await res.json() as { days: DailyMetric[] };
        setDailyData(json.days || []);
        setDailyLoaded(true);
      }
    } catch { /* silencioso */ }
    finally { setDailyLoading(false); }
  }

  async function loadBreakdown(by: typeof breakdownBy) {
    setBreakdownBy(by);
    setBreakdownLoading(true);
    setBreakdownLoaded(false);
    try {
      const res = await authFetch(`/api/trafego/metrics/breakdown?campaign_id=${campaign.id}&by=${by}`);
      if (res.ok) {
        const json = await res.json() as { rows: BreakdownRow[] };
        setBreakdownData(json.rows || []);
        setBreakdownLoaded(true);
      }
    } catch { /* silencioso */ }
    finally { setBreakdownLoading(false); }
  }

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

          {/* ─── Conjuntos de Anúncios (Ad Sets) ───────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Conjuntos de anúncios</h3>
              {!adsetsLoaded && (
                <button onClick={loadAdsets} disabled={adsetsLoading}
                  className="text-xs text-crm-primary hover:underline flex items-center gap-1">
                  {adsetsLoading ? <Loader2 size={11} className="animate-spin" /> : null}
                  {adsetsLoading ? 'Carregando...' : 'Ver conjuntos'}
                </button>
              )}
              {adsetsLoaded && (
                <button onClick={() => { setAdsetsLoaded(false); setAdsetItems([]); }}
                  className="text-xs text-gray-400 hover:underline">Ocultar</button>
              )}
            </div>
            {adsetsLoaded && adsetItems.length === 0 && (
              <p className="text-xs text-gray-400">Nenhum conjunto encontrado.</p>
            )}
            {adsetsLoaded && adsetItems.length > 0 && (
              <div className="space-y-3">
                {adsetItems.map(adset => {
                  const isActive = adset.status === 'ACTIVE';
                  const actLoading = adsetAction?.id === adset.id && adsetAction.loading;
                  const editingBudget = adsetBudgetEdit?.id === adset.id;
                  return (
                    <div key={adset.id} className="bg-gray-50 rounded-2xl p-3 space-y-2">
                      {/* Nome + status + toggle */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-gray-800 leading-tight truncate">{adset.nome}</div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={cn('inline-flex items-center gap-1 text-xs font-medium',
                              isActive ? 'text-green-600' : 'text-gray-400')}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', isActive ? 'bg-green-500' : 'bg-gray-300')} />
                              {isActive ? 'Ativo' : 'Pausado'}
                            </span>
                            {adset.orcamento_diario && (
                              <span className="text-xs text-gray-400">· {brl2(adset.orcamento_diario)}/dia</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => toggleAdsetStatus(adset)}
                          disabled={actLoading}
                          className={cn(
                            'shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all flex items-center gap-1',
                            isActive
                              ? 'border-red-200 text-red-600 hover:bg-red-50'
                              : 'border-green-200 text-green-600 hover:bg-green-50'
                          )}
                        >
                          {actLoading && !editingBudget ? <Loader2 size={10} className="animate-spin" /> : null}
                          {isActive ? 'Pausar' : 'Ativar'}
                        </button>
                      </div>

                      {/* Métricas rápidas do conjunto */}
                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          { l: 'Gasto',  v: brl(adset.metricas.spend) },
                          { l: 'ROAS',   v: adset.metricas.roas > 0 ? adset.metricas.roas.toFixed(1) + 'x' : '—' },
                          { l: 'Leads',  v: adset.metricas.leads > 0 ? n0(adset.metricas.leads) : '—' },
                          { l: 'CPL',    v: adset.metricas.cpl > 0 ? brl2(adset.metricas.cpl) : '—' },
                        ].map(({ l, v }) => (
                          <div key={l} className="bg-white rounded-lg p-1.5 text-center">
                            <div className="text-[10px] text-gray-400">{l}</div>
                            <div className="text-xs font-bold text-gray-800">{v}</div>
                          </div>
                        ))}
                      </div>

                      {/* Público resumido */}
                      <div className="text-xs text-gray-500 leading-relaxed">
                        {adset.targeting_traduzido.sexo} · {adset.targeting_traduzido.idade} · {adset.targeting_traduzido.localizacao}
                        {adset.targeting_traduzido.interesses.length > 0 && (
                          <span className="text-gray-400"> · {adset.targeting_traduzido.interesses.slice(0, 2).join(', ')}{adset.targeting_traduzido.interesses.length > 2 ? ` +${adset.targeting_traduzido.interesses.length - 2}` : ''}</span>
                        )}
                      </div>

                      {/* Edição de orçamento do conjunto */}
                      {editingBudget ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number" min={1} step={0.01}
                            value={adsetBudgetEdit!.value}
                            onChange={e => setAdsetBudgetEdit({ id: adset.id, value: e.target.value })}
                            className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
                            placeholder="R$/dia"
                          />
                          <button onClick={() => saveAdsetBudget(adset)} disabled={actLoading}
                            className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                            {actLoading ? <Loader2 size={10} className="animate-spin" /> : null}
                            Salvar
                          </button>
                          <button onClick={() => setAdsetBudgetEdit(null)}
                            className="px-2 py-1 rounded-lg border border-gray-200 text-gray-500 text-xs hover:bg-gray-100">
                            <X size={12} />
                          </button>
                        </div>
                      ) : adset.orcamento_diario ? (
                        <button
                          onClick={() => setAdsetBudgetEdit({ id: adset.id, value: String(adset.orcamento_diario) })}
                          className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                          <Edit2 size={10} /> Editar orçamento deste conjunto
                        </button>
                      ) : null}
                    </div>
                  );
                })}
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

          {/* ─── Métricas de Vídeo ──────────────────────────────────────── */}
          {campaign.video && campaign.video.p25 > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Retenção de vídeo</h3>
              <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                {/* Barra de retenção */}
                {([
                  { label: '25%', value: campaign.video.p25, color: 'bg-blue-400' },
                  { label: '50%', value: campaign.video.p50, color: 'bg-blue-500' },
                  { label: '75%', value: campaign.video.p75, color: 'bg-violet-500' },
                  { label: '95%', value: campaign.video.p95, color: 'bg-violet-600' },
                  { label: '100%', value: campaign.video.p100, color: 'bg-green-500' },
                ] as const).map(({ label, value, color }) => {
                  const pct = campaign.video!.p25 > 0 ? Math.round((value / campaign.video!.p25) * 100) : 0;
                  return (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-8 text-right">{label}</span>
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-medium text-gray-700 w-12 text-right">{n0(value)}</span>
                    </div>
                  );
                })}
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-gray-200 mt-1">
                  <div className="text-center">
                    <div className="text-xs text-gray-500">ThruPlay</div>
                    <div className="font-bold text-gray-900 text-sm">{n0(campaign.video.thruplay)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500">Tempo médio</div>
                    <div className="font-bold text-gray-900 text-sm">{campaign.video.avg_watch.toFixed(1)}s</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500">Custo/ThruPlay</div>
                    <div className="font-bold text-gray-900 text-sm">
                      {campaign.video.cost_per_thruplay > 0 ? brl2(campaign.video.cost_per_thruplay) : '—'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Histórico Diário ────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Histórico dia a dia</h3>
              {!dailyLoaded && (
                <button onClick={loadDaily} disabled={dailyLoading}
                  className="text-xs text-crm-primary hover:underline flex items-center gap-1">
                  {dailyLoading ? <Loader2 size={11} className="animate-spin" /> : null}
                  {dailyLoading ? 'Carregando...' : 'Ver gráfico'}
                </button>
              )}
              {dailyLoaded && (
                <button onClick={() => { setDailyLoaded(false); setDailyData([]); }}
                  className="text-xs text-gray-400 hover:underline">Ocultar</button>
              )}
            </div>
            {dailyLoaded && dailyData.length > 0 && (
              <div className="bg-gray-50 rounded-2xl p-4">
                {/* Seletor de métrica */}
                <div className="flex gap-1 mb-3">
                  {([
                    { key: 'spend', label: 'Gasto' },
                    { key: 'roas',  label: 'ROAS' },
                    { key: 'leads', label: 'Leads' },
                    { key: 'cpl',   label: 'CPL' },
                  ] as const).map(({ key, label }) => (
                    <button key={key} onClick={() => setDailyMetric(key)}
                      className={cn('px-2 py-1 rounded-lg text-xs font-medium transition-all',
                        dailyMetric === key ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-800')}>
                      {label}
                    </button>
                  ))}
                </div>
                {/* Sparkline SVG */}
                {(() => {
                  const vals = dailyData.map(d => d[dailyMetric]);
                  const max = Math.max(...vals, 0.01);
                  const W = 340; const H = 60; const pad = 4;
                  const points = vals.map((v, i) => {
                    const x = pad + (i / Math.max(vals.length - 1, 1)) * (W - pad * 2);
                    const y = H - pad - ((v / max) * (H - pad * 2));
                    return `${x},${y}`;
                  }).join(' ');
                  const totalSpend = dailyData.reduce((s, d) => s + d.spend, 0);
                  const totalLeads = dailyData.reduce((s, d) => s + d.leads, 0);
                  const avgRoas = totalSpend > 0
                    ? dailyData.reduce((s, d) => s + d.revenue, 0) / totalSpend
                    : 0;
                  return (
                    <>
                      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none">
                        <polyline fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" points={points} />
                        {vals.map((v, i) => {
                          const x = pad + (i / Math.max(vals.length - 1, 1)) * (W - pad * 2);
                          const y = H - pad - ((v / max) * (H - pad * 2));
                          return <circle key={i} cx={x} cy={y} r="3" fill="#3b82f6" />;
                        })}
                      </svg>
                      <div className="flex justify-between text-xs text-gray-400 mt-1">
                        <span>{dailyData[0]?.date ? formatDate(dailyData[0].date) : ''}</span>
                        <span>{dailyData[dailyData.length - 1]?.date ? formatDate(dailyData[dailyData.length - 1].date) : ''}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3 pt-2 border-t border-gray-200">
                        <div className="text-center">
                          <div className="text-xs text-gray-500">Gasto total</div>
                          <div className="font-bold text-sm text-gray-900">{brl(totalSpend)}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-gray-500">Leads total</div>
                          <div className="font-bold text-sm text-gray-900">{n0(totalLeads)}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-gray-500">ROAS médio</div>
                          <div className="font-bold text-sm text-gray-900">{avgRoas.toFixed(1)}x</div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* ─── Breakdown por Posicionamento / Público ─────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Breakdown</h3>
              {!breakdownLoaded && !breakdownLoading && (
                <button onClick={() => loadBreakdown('publisher_platform')}
                  className="text-xs text-crm-primary hover:underline">Ver por plataforma</button>
              )}
              {breakdownLoaded && (
                <button onClick={() => { setBreakdownLoaded(false); setBreakdownData([]); }}
                  className="text-xs text-gray-400 hover:underline">Ocultar</button>
              )}
            </div>
            {(breakdownLoaded || breakdownLoading) && (
              <div className="bg-gray-50 rounded-2xl p-4">
                {/* Seletor de tipo de breakdown */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {([
                    { key: 'publisher_platform', label: 'Plataforma' },
                    { key: 'age',                label: 'Idade' },
                    { key: 'gender',             label: 'Gênero' },
                    { key: 'impression_device',  label: 'Dispositivo' },
                  ] as const).map(({ key, label }) => (
                    <button key={key} onClick={() => loadBreakdown(key)}
                      className={cn('px-2 py-1 rounded-lg text-xs font-medium transition-all',
                        breakdownBy === key ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-800')}>
                      {label}
                    </button>
                  ))}
                </div>
                {breakdownLoading ? (
                  <div className="flex items-center justify-center py-4 text-gray-400 gap-2 text-sm">
                    <Loader2 size={14} className="animate-spin" /> Carregando...
                  </div>
                ) : breakdownData.length === 0 ? (
                  <p className="text-xs text-gray-400">Nenhum dado de segmentação encontrado.</p>
                ) : (
                  <div className="space-y-2">
                    {breakdownData.map((row) => {
                      const totalSpendBd = breakdownData.reduce((s, r) => s + r.spend, 0);
                      const pctSpend = totalSpendBd > 0 ? (row.spend / totalSpendBd) * 100 : 0;
                      const segLabel: Record<string, string> = {
                        facebook: 'Facebook', instagram: 'Instagram',
                        messenger: 'Messenger', audience_network: 'Audience Network',
                        male: 'Homens', female: 'Mulheres', unknown: 'Desconhecido',
                        mobile_feed: 'Mobile Feed', desktop_feed: 'Desktop Feed',
                        iphone: 'iPhone', android: 'Android', ipad: 'iPad',
                      };
                      const label = segLabel[row.segment] || row.segment;
                      return (
                        <div key={row.segment} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-gray-800">{label}</span>
                            <span className="text-gray-500">{brl(row.spend)} · {pctSpend.toFixed(0)}%</span>
                          </div>
                          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pctSpend}%` }} />
                          </div>
                          <div className="flex gap-3 text-xs text-gray-400">
                            <span>CTR {pct(row.ctr)}</span>
                            <span>CPM {brl2(row.cpm)}</span>
                            {row.leads > 0 && <span>CPL {brl2(row.cpl)}</span>}
                            {row.roas > 0 && <span>ROAS {row.roas.toFixed(1)}x</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

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
                    const res = await authFetch(`/api/trafego/metrics?period=7d`);
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
  meta_audience_id?: string | null;
  targeting?: {
    age_min?: number;
    age_max?: number;
    genders?: number[];
    geo_locations?: {
      countries?: string[];
      regions?: { name: string; key?: string }[];
    };
    interests?: { id?: string; name: string }[];
    custom_audiences?: { id: string; name?: string }[];
  };
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
  jose: '⚡ Jarvis analisando seus clientes...',
  claudio: '⚡ Jarvis configurando os públicos...',
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

interface PublicoAprovadoItem {
  id: string;
  nome: string;
  tipo: string;
  status: string;
  meta_audience_id: string | null;
  estimativa_alcance: number | null;
  criado_por_ia: boolean;
  created_at: string;
}

function PublicosTab() {
  const [subTab, setSubTab] = useState<'criar' | 'lookalike' | 'biblioteca' | 'importar'>('criar');
  const [gerandoTipo, setGerandoTipo] = useState<string | null>(null);
  const [feedbackPublico, setFeedbackPublico] = useState<string | null>(null);
  const [publicosAprovados, setPublicosAprovados] = useState<PublicoAprovadoItem[]>([]);
  const [carregandoPublicos, setCarregandoPublicos] = useState(false);

  // Estado para seletor de vídeos no Lookalike
  interface CriativoVideo { id: string; nome: string; meta_video_id: string; url_preview: string | null }
  const [videos, setVideos]               = useState<CriativoVideo[]>([]);
  const [videosSelecionados, setVideosSel] = useState<string[]>([]);
  const [carregandoVideos, setCarregandoVideos] = useState(false);
  const [audienceIdInput, setAudienceIdInput] = useState('');
  const [criandoLookalikeManual, setCriandoLookalikeManual] = useState(false);

  const carregarVideos = useCallback(async () => {
    setCarregandoVideos(true);
    try {
      const res  = await authFetch('/api/meta/criativos?limit=30&tipo=video');
      if (!res.ok) return;
      const data = await res.json() as { criativos?: CriativoVideo[] };
      setVideos((data.criativos ?? []).filter(c => c.meta_video_id));
    } catch { /* silencioso */ }
    finally { setCarregandoVideos(false); }
  }, []);

  const carregarPublicosAprovados = useCallback(async () => {
    setCarregandoPublicos(true);
    try {
      const res = await authFetch('/api/trafego/publicos-aprovados?limit=50');
      if (!res.ok) return;
      const data = await res.json() as { data?: PublicoAprovadoItem[] };
      setPublicosAprovados(data.data ?? []);
    } catch { /* silencioso */ }
    finally { setCarregandoPublicos(false); }
  }, []);

  useEffect(() => { carregarPublicosAprovados(); }, [carregarPublicosAprovados]);

  // ── Estado e funções para sub-tab "Importar do Meta" ──────────────────────
  interface MetaCustomAudience {
    id: string;
    name: string;
    subtype?: string;
    approximate_count_lower_bound?: number;
    approximate_count_upper_bound?: number;
    importing?: boolean;
  }
  const [metaAudiences, setMetaAudiences] = useState<MetaCustomAudience[]>([]);
  const [carregandoMeta, setCarregandoMeta] = useState(false);
  const [importadosIds, setImportadosIds] = useState<Set<string>>(new Set());

  const carregarAudienciasMeta = useCallback(async () => {
    setCarregandoMeta(true);
    try {
      const res = await authFetch('/api/trafego/saved-audiences');
      if (!res.ok) return;
      const data = await res.json() as {
        connected?: boolean;
        customAudiences?: MetaCustomAudience[];
      };
      if (data.connected) {
        setMetaAudiences(data.customAudiences ?? []);
      }
    } catch { /* silencioso */ }
    finally { setCarregandoMeta(false); }
  }, []);

  useEffect(() => {
    if (subTab === 'importar' && metaAudiences.length === 0 && !carregandoMeta) {
      carregarAudienciasMeta();
    }
  }, [subTab, metaAudiences.length, carregandoMeta, carregarAudienciasMeta]);

  async function importarPublicoMeta(audience: MetaCustomAudience) {
    const subtype = audience.subtype ?? 'CUSTOM';
    const tipoMap: Record<string, string> = {
      LOOKALIKE:  'lookalike',
      ENGAGEMENT: 'quente',
      CUSTOM:     'retargeting',
      WEBSITE:    'retargeting',
    };
    const tipo = tipoMap[subtype] ?? 'retargeting';

    setMetaAudiences(prev =>
      prev.map(a => a.id === audience.id ? { ...a, importing: true } : a)
    );
    try {
      const res = await authFetch('/api/trafego/publicos-aprovados', {
        method: 'POST',
        body: JSON.stringify({
          nome:             audience.name,
          tipo,
          meta_audience_id: audience.id,
          targeting:        { custom_audiences: [{ id: audience.id }] },
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (json.ok) {
        setImportadosIds(prev => new Set([...prev, audience.id]));
        carregarPublicosAprovados();
      } else {
        setFeedbackPublico(`❌ ${json.error ?? 'Erro ao importar público'}`);
      }
    } catch {
      setFeedbackPublico('❌ Erro de conexão ao importar');
    } finally {
      setMetaAudiences(prev =>
        prev.map(a => a.id === audience.id ? { ...a, importing: false } : a)
      );
    }
  }

  function subtypeBadge(subtype?: string) {
    const map: Record<string, { label: string; cls: string }> = {
      LOOKALIKE:  { label: 'LOOKALIKE',  cls: 'bg-purple-900/40 text-purple-300 border border-purple-700/50' },
      ENGAGEMENT: { label: 'ENGAGEMENT', cls: 'bg-orange-900/40 text-orange-300 border border-orange-700/50' },
      CUSTOM:     { label: 'CUSTOM',     cls: 'bg-blue-900/40 text-blue-300 border border-blue-700/50' },
      WEBSITE:    { label: 'WEBSITE',    cls: 'bg-green-900/40 text-green-300 border border-green-700/50' },
    };
    const s = subtype ?? 'CUSTOM';
    const { label, cls } = map[s] ?? { label: s, cls: 'bg-[#1c2333] text-[#94a3b8] border border-[#2a3550]' };
    return (
      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide', cls)}>
        {label}
      </span>
    );
  }
  // ── fim "Importar do Meta" ─────────────────────────────────────────────────

  async function gerarPublicoAutomatico(tipo: 'frio' | 'quente' | 'lookalike') {
    setGerandoTipo(tipo);
    setFeedbackPublico(null);
    try {
      const body: Record<string, unknown> = { tipo };
      if (tipo === 'lookalike' && videosSelecionados.length > 0) {
        body.video_ids = videosSelecionados;
      }
      const res = await authFetch('/api/trafego/publicos/gerar-automatico', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const json = await res.json() as {
        ok?: boolean;
        nome?: string;
        tipo?: string;
        meta_audience_id?: string;
        interesses_usados?: string[];
        videos_usados?: number;
        contatos_enviados?: number;
        nota?: string;
        error?: string;
      };
      if (json.ok) {
        // Frio não tem meta_audience_id por design — vai direto no adset
        let msg: string;
        if (json.tipo === 'frio') {
          const qtd = json.interesses_usados?.length ?? 0;
          msg = `✅ Targeting configurado: "${json.nome}" com ${qtd} interesse${qtd !== 1 ? 's' : ''}`;
        } else if (json.meta_audience_id) {
          const detalhe = json.videos_usados != null
            ? ` (${json.videos_usados} vídeo${json.videos_usados !== 1 ? 's' : ''})`
            : json.contatos_enviados != null
            ? ` (${json.contatos_enviados} clientes)`
            : '';
          msg = `✅ Público "${json.nome}" criado no Meta${detalhe}`;
        } else {
          msg = `✅ Público "${json.nome}" configurado`;
        }
        if (json.nota) msg += ` — ${json.nota}`;
        setFeedbackPublico(msg);
        carregarPublicosAprovados();
      } else {
        setFeedbackPublico(`❌ ${json.error || 'Erro ao gerar público'}`);
      }
    } catch (e) {
      setFeedbackPublico(`❌ ${String(e)}`);
    } finally {
      setGerandoTipo(null);
    }
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      rascunho:  'bg-gray-100 text-gray-600',
      publicado: 'bg-green-50 text-green-700',
      erro:      'bg-red-50 text-red-700',
      arquivado: 'bg-yellow-50 text-yellow-700',
    };
    return (
      <span className={cn('text-xs rounded-full px-2 py-0.5 font-medium capitalize', map[status] ?? 'bg-gray-100 text-gray-600')}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Pills navigation */}
      <div className="flex flex-wrap gap-2">
        {([
          { key: 'criar',      label: 'Criar com IA' },
          { key: 'lookalike',  label: 'Lookalike' },
          { key: 'importar',   label: 'Importar do Meta' },
          { key: 'biblioteca', label: 'Biblioteca' },
        ] as { key: 'criar' | 'lookalike' | 'importar' | 'biblioteca'; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
              subTab === key
                ? 'bg-[#1e3a5f] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Feedback */}
      {feedbackPublico && (
        <div className={cn(
          'rounded-xl px-4 py-3 text-sm border flex items-start justify-between gap-3',
          feedbackPublico.startsWith('✅')
            ? 'bg-green-50 border-green-200 text-green-800'
            : feedbackPublico.startsWith('⚠️')
            ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-red-50 border-red-200 text-red-800'
        )}>
          <span>{feedbackPublico}</span>
          <button onClick={() => setFeedbackPublico(null)} className="opacity-60 hover:opacity-100 shrink-0">✕</button>
        </div>
      )}

      {/* ── Sub-seção: Criar com IA ── */}
      {subTab === 'criar' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Card Frio */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <Users size={18} className="text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Público Frio</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Jarvis seleciona interesses de revendedoras, franqueadas e lojistas no Meta e cria o público automaticamente.
                  </p>
                </div>
              </div>
              <button
                onClick={() => gerarPublicoAutomatico('frio')}
                disabled={gerandoTipo === 'frio'}
                className="w-full mt-4 py-2.5 bg-[#1e3a5f] text-white text-sm font-medium rounded-xl hover:bg-[#16304f] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {gerandoTipo === 'frio'
                  ? <><Loader2 size={14} className="animate-spin" /> Jarvis trabalhando...</>
                  : <><Wand2 size={14} /> Gerar público frio</>
                }
              </button>
            </div>

            {/* Card Quente */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                  <TrendingUp size={18} className="text-orange-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Público Quente</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Pessoas que já interagiram com a CJ nos últimos 30 dias — visitantes, seguidores, engajamento.
                  </p>
                </div>
              </div>
              <button
                onClick={() => gerarPublicoAutomatico('quente')}
                disabled={gerandoTipo === 'quente'}
                className="w-full mt-4 py-2.5 bg-orange-600 text-white text-sm font-medium rounded-xl hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {gerandoTipo === 'quente'
                  ? <><Loader2 size={14} className="animate-spin" /> Jarvis trabalhando...</>
                  : <><Wand2 size={14} /> Gerar público quente</>
                }
              </button>
            </div>

            {/* Card Lookalike */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                  <Target size={18} className="text-purple-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Lookalike</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Meta encontra pessoas parecidas com seus melhores clientes. Baseado na sua lista de compradores.
                  </p>
                </div>
              </div>
              <button
                onClick={() => gerarPublicoAutomatico('lookalike')}
                disabled={gerandoTipo === 'lookalike'}
                className="w-full mt-4 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {gerandoTipo === 'lookalike'
                  ? <><Loader2 size={14} className="animate-spin" /> Jarvis trabalhando...</>
                  : <><Wand2 size={14} /> Gerar lookalike</>
                }
              </button>
            </div>
          </div>

          {/* Lista de públicos criados */}
          {(carregandoPublicos || publicosAprovados.length > 0) && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-800 text-sm mb-3 flex items-center gap-2">
                <Users size={15} className="text-indigo-500" />
                Públicos criados ({publicosAprovados.length})
              </h3>
              {carregandoPublicos ? (
                <div className="flex items-center justify-center py-4 text-gray-400">
                  <Loader2 size={18} className="animate-spin" />
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {publicosAprovados.map(p => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{p.nome}</p>
                        <p className="text-xs text-gray-400 capitalize">{p.tipo}{p.meta_audience_id ? ` · ID ${p.meta_audience_id}` : ''}</p>
                      </div>
                      {statusBadge(p.status)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Sub-seção: Lookalike ── */}
      {subTab === 'lookalike' && (
        <div className="space-y-5">

          {/* Card principal */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                <Target size={18} className="text-purple-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Lookalike 1% Brasil</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  O Jarvis usa a lista de clientes do CRM (com hash SHA-256) para criar uma audiência-semente
                  e gerar um Lookalike 1% no Meta — pessoas com perfil semelhante aos seus compradores reais.
                </p>
              </div>
            </div>

            <div className="bg-purple-50 rounded-xl px-3 py-2 mb-4 text-xs text-purple-700">
              Mínimo de 100 clientes com telefone ou e-mail cadastrado no CRM.
            </div>

            <button
              onClick={() => gerarPublicoAutomatico('lookalike')}
              disabled={gerandoTipo === 'lookalike'}
              className="w-full py-2.5 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {gerandoTipo === 'lookalike'
                ? <><Loader2 size={14} className="animate-spin" /> Criando no Meta...</>
                : <><Wand2 size={14} /> Gerar Lookalike com clientes do CRM</>
              }
            </button>
          </div>

          {/* Card: Registrar Lookalike existente */}
          <div className="bg-white rounded-2xl border border-amber-200 p-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <Link size={18} className="text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Registrar Lookalike do Meta Ads Manager</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Crie o Lookalike manualmente no Meta Ads Manager, copie o ID e registre aqui. Nenhuma permissão especial necessária.
                </p>
              </div>
            </div>

            <div className="bg-amber-50 rounded-xl px-3 py-2 mb-3 text-xs text-amber-700 leading-relaxed">
              <strong>Passo a passo:</strong> Meta Ads Manager → Públicos → Criar público → Público semelhante → configure → salve → copie o ID numérico da coluna "ID do público".
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={audienceIdInput}
                onChange={e => setAudienceIdInput(e.target.value.trim())}
                placeholder="Ex: 120212345678901234"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
              <button
                disabled={!audienceIdInput || criandoLookalikeManual}
                onClick={async () => {
                  setCriandoLookalikeManual(true);
                  setFeedbackPublico(null);
                  try {
                    const res = await authFetch('/api/trafego/publicos-aprovados', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        nome:             `CJ | LOOKALIKE 1% BR (manual)`,
                        tipo:             'lookalike',
                        targeting:        { custom_audiences: [{ id: audienceIdInput }] },
                        meta_audience_id: audienceIdInput,
                        publicar_meta:    false,
                      }),
                    });
                    const json = await res.json() as { ok?: boolean; publico?: { id: string }; error?: string };
                    if (json.ok) {
                      setFeedbackPublico(`✅ Lookalike registrado! ID Meta: ${audienceIdInput}`);
                      setAudienceIdInput('');
                      carregarPublicosAprovados();
                    } else {
                      setFeedbackPublico(`❌ ${json.error || 'Erro ao registrar'}`);
                    }
                  } catch {
                    setFeedbackPublico('❌ Erro de conexão');
                  } finally {
                    setCriandoLookalikeManual(false);
                  }
                }}
                className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-xl hover:bg-amber-700 disabled:opacity-40 flex items-center gap-1.5 shrink-0"
              >
                {criandoLookalikeManual
                  ? <><Loader2 size={13} className="animate-spin" /> Salvando...</>
                  : <><CheckCircle size={13} /> Registrar</>}
              </button>
            </div>
          </div>

          {/* Lookalikes já criados */}
          {publicosAprovados.filter(p => p.tipo === 'lookalike').length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-800 text-sm mb-3">Lookalikes criados</h3>
              <div className="space-y-2">
                {publicosAprovados.filter(p => p.tipo === 'lookalike').map(p => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-100">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{p.nome}</p>
                      {p.meta_audience_id
                        ? <p className="text-xs text-gray-400">ID Meta: {p.meta_audience_id}</p>
                        : <p className="text-xs text-amber-500">Salvo localmente — criar manualmente no Meta</p>
                      }
                    </div>
                    {statusBadge(p.status)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Sub-seção: Biblioteca ── */}
      {subTab === 'biblioteca' && (
        <BibliotecaInteresses />
      )}

      {/* ── Sub-seção: Importar do Meta ── */}
      {subTab === 'importar' && (
        <div className="space-y-4">
          {/* Header */}
          <div className="bg-[#161b24] rounded-2xl border border-[#2a3550] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-[#e2e8f0] flex items-center gap-2">
                  <CloudDownload size={16} className="text-[#93c5fd]" />
                  Públicos do Meta Ads Manager
                </h3>
                <p className="text-xs text-[#94a3b8] mt-1">
                  Custom Audiences já criados na sua conta Meta. Clique em "Importar" para registrá-los no VEXX CRM e usar em campanhas.
                </p>
              </div>
              <button
                onClick={carregarAudienciasMeta}
                disabled={carregandoMeta}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1e3a5f] text-[#93c5fd] hover:bg-[#1e3a5f]/80 disabled:opacity-50 transition-colors"
              >
                {carregandoMeta
                  ? <><Loader2 size={12} className="animate-spin" /> Carregando...</>
                  : <><RefreshCw size={12} /> Atualizar</>
                }
              </button>
            </div>
          </div>

          {/* Lista de Custom Audiences */}
          {carregandoMeta ? (
            <div className="flex items-center justify-center py-12 text-[#64748b]">
              <Loader2 size={20} className="animate-spin mr-2" />
              <span className="text-sm">Buscando públicos no Meta...</span>
            </div>
          ) : metaAudiences.length === 0 ? (
            <div className="bg-[#161b24] rounded-2xl border border-[#2a3550] p-8 text-center">
              <Users size={28} className="text-[#64748b] mx-auto mb-2" />
              <p className="text-sm text-[#94a3b8]">Nenhuma Custom Audience encontrada.</p>
              <p className="text-xs text-[#64748b] mt-1">Verifique se o token Meta está configurado e há públicos criados na conta.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {metaAudiences.map(audience => {
                const alreadyImported = importadosIds.has(audience.id)
                  || publicosAprovados.some(p => p.meta_audience_id === audience.id);
                const lower = audience.approximate_count_lower_bound;
                const upper = audience.approximate_count_upper_bound;
                const tamanho = formatAudienceSize(lower, upper);

                return (
                  <div
                    key={audience.id}
                    className="bg-[#161b24] rounded-xl border border-[#2a3550] px-4 py-3 flex items-center justify-between gap-3 hover:border-[#1e3a5f] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-[#e2e8f0] truncate">{audience.name}</p>
                        {subtypeBadge(audience.subtype)}
                      </div>
                      <p className="text-xs text-[#64748b] mt-0.5">
                        {tamanho}
                        {audience.id && <span className="ml-2 opacity-60">· ID {audience.id}</span>}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {alreadyImported ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-[#059669] bg-green-900/20 border border-green-700/30 px-3 py-1.5 rounded-lg">
                          <CheckCircle size={13} />
                          Importado
                        </span>
                      ) : (
                        <button
                          onClick={() => importarPublicoMeta(audience)}
                          disabled={audience.importing}
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-[#1e3a5f] text-[#93c5fd] hover:bg-[#1e4a7f] disabled:opacity-50 transition-colors"
                        >
                          {audience.importing
                            ? <><Loader2 size={12} className="animate-spin" /> Importando...</>
                            : <><CloudDownload size={12} /> Importar</>
                          }
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Legenda dos tipos */}
          <div className="bg-[#161b24] rounded-xl border border-[#2a3550] p-4">
            <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wide mb-2">Tipos de público</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {[
                { subtype: 'LOOKALIKE',  desc: 'Similar a uma base semente' },
                { subtype: 'ENGAGEMENT', desc: 'Engajamento com conteúdo' },
                { subtype: 'CUSTOM',     desc: 'Lista de clientes' },
                { subtype: 'WEBSITE',    desc: 'Visitantes via Pixel' },
              ].map(({ subtype, desc }) => (
                <div key={subtype} className="flex items-start gap-2">
                  {subtypeBadge(subtype)}
                  <span className="text-[#94a3b8] leading-tight">{desc}</span>
                </div>
              ))}
            </div>
          </div>
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
          Pedir novo ao Jarvis →
        </a>
      </div>

      {/* Copies gerados pelo Cláudio */}
      {copies.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Do Jarvis (aguardando uso)</h3>
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
          <a
            href={`/api/trafego/export?format=csv&period=${periodo === 'last_7d' ? '7d' : periodo === 'last_14d' ? '15d' : '30d'}`}
            download
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
          >
            <CloudDownload size={13} /> Exportar CSV
          </a>
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

/* ─── Aba Multi-conta Consolidado ─────────────────────────────────────────── */

interface ConsolidadoContaSummary {
  spend: number; revenue: number; leads: number; clicks: number; roas: number; cpl: number; ativas: number; pausadas: number;
}
interface ConsolidadoConta {
  accountId: string; accountName: string; currency: string;
  campaigns: Array<{ id: string; nome: string; status: string; spend: number; revenue: number; leads: number; roas: number; cpl: number }>;
  summary: ConsolidadoContaSummary | null;
  error?: string;
}

function ConsolidadoTab() {
  const [accountIds, setAccountIds] = useState('');
  const [period, setPeriod]         = useState<'7d' | '15d' | '30d'>('7d');
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<{ contas: ConsolidadoConta[]; grand: ConsolidadoContaSummary & { roas: number; cpl: number } } | null>(null);
  const [error, setError]           = useState<string | null>(null);

  async function buscar() {
    const ids = accountIds.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    if (!ids.length) { setError('Informe ao menos uma conta (act_XXXXXXXX)'); return; }
    setLoading(true); setError(null);
    try {
      const res = await authFetch('/api/trafego/consolidado', {
        method: 'POST',
        body: JSON.stringify({ account_ids: ids, period }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Erro desconhecido'); return; }
      setResult(json);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-bold text-gray-900">Dashboard Multi-conta</h2>
        <p className="text-xs text-gray-400 mt-0.5">Compare métricas de várias contas Meta lado a lado</p>
      </div>

      {/* Inputs */}
      <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-3">
        <div>
          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">IDs das contas (act_XXXX)</label>
          <textarea
            value={accountIds}
            onChange={e => setAccountIds(e.target.value)}
            placeholder={'act_123456789\nact_987654321'}
            rows={3}
            className="mt-1 w-full text-sm border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white border border-gray-200 rounded-xl p-1 gap-1">
            {(['7d', '15d', '30d'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={cn('px-3 py-1 rounded-lg text-xs font-medium transition-all', period === p ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100')}>
                {p}
              </button>
            ))}
          </div>
          <button onClick={buscar} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
            {loading ? 'Buscando...' : 'Consolidar'}
          </button>
        </div>
        {error && <div className="text-red-600 text-xs">{error}</div>}
      </div>

      {/* Grand total */}
      {result && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Gasto total',   value: brl(result.grand.spend) },
              { label: 'Retorno',       value: brl(result.grand.revenue) },
              { label: 'ROAS',          value: result.grand.roas.toFixed(2) + 'x' },
              { label: 'Leads',         value: n0(result.grand.leads) },
            ].map(m => (
              <div key={m.label} className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{m.label}</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{m.value}</div>
              </div>
            ))}
          </div>

          {/* Per-account cards */}
          <div className="space-y-3">
            {result.contas.map(conta => (
              <div key={conta.accountId} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">{conta.accountName}</div>
                    <div className="text-[11px] text-gray-400">{conta.accountId}</div>
                  </div>
                  {conta.error ? (
                    <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-lg">{conta.error}</span>
                  ) : (
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span>{conta.summary?.ativas || 0} ativas</span>
                      <span>{conta.summary?.pausadas || 0} pausadas</span>
                    </div>
                  )}
                </div>
                {conta.summary && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {[
                      { l: 'Gasto',   v: brl(conta.summary.spend) },
                      { l: 'Retorno', v: brl(conta.summary.revenue) },
                      { l: 'ROAS',    v: conta.summary.roas.toFixed(2) + 'x' },
                      { l: 'Leads',   v: n0(conta.summary.leads) },
                      { l: 'Cliques', v: n0(conta.summary.clicks) },
                      { l: 'CPL',     v: brl(conta.summary.cpl) },
                    ].map(m => (
                      <div key={m.l} className="text-center bg-gray-50 rounded-xl py-2">
                        <div className="text-[10px] text-gray-500 uppercase">{m.l}</div>
                        <div className="text-sm font-bold text-gray-900 mt-0.5">{m.v}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {!result && !loading && (
        <div className="text-center py-12 text-gray-300">
          <Globe size={40} className="mx-auto mb-3" />
          <p className="text-sm text-gray-500">Informe os IDs das contas e clique em Consolidar</p>
        </div>
      )}
    </div>
  );
}

/* ─── Aba A/B Test ─────────────────────────────────────────────────────────── */

interface ABMetric { vencedor: 'a' | 'b' | 'tie'; diff_pct?: number }
interface ABResult {
  a: Record<string, unknown> & { nome: string; spend: number; roas: number; cpl: number; ctr: number; cpm: number; leads: number; thruplay: number };
  b: Record<string, unknown> & { nome: string; spend: number; roas: number; cpl: number; ctr: number; cpm: number; leads: number; thruplay: number };
  comparativo: { roas: ABMetric; cpl: ABMetric; ctr: ABMetric; cpm: ABMetric; thruplay: ABMetric; leads: ABMetric } | null;
  vencedor_geral: 'a' | 'b' | 'empate';
  score: { a: number; b: number };
  period: string;
}

function ABTestTab() {
  const [campaignA, setCampaignA] = useState('');
  const [campaignB, setCampaignB] = useState('');
  const [period, setPeriod]       = useState<'7d' | '15d' | '30d'>('7d');
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<ABResult | null>(null);
  const [error, setError]         = useState<string | null>(null);

  async function comparar() {
    if (!campaignA.trim() || !campaignB.trim()) { setError('Informe os IDs das duas campanhas'); return; }
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`/api/trafego/abtest?campaign_a=${encodeURIComponent(campaignA.trim())}&campaign_b=${encodeURIComponent(campaignB.trim())}&period=${period}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Erro desconhecido'); return; }
      setResult(json);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  const METRICAS = [
    { key: 'roas',     label: 'ROAS',   fmt: (v: number) => v.toFixed(2) + 'x', lowerIsBetter: false },
    { key: 'cpl',      label: 'CPL',    fmt: brl2,                               lowerIsBetter: true  },
    { key: 'ctr',      label: 'CTR',    fmt: (v: number) => pct(v),              lowerIsBetter: false },
    { key: 'cpm',      label: 'CPM',    fmt: brl2,                               lowerIsBetter: true  },
    { key: 'leads',    label: 'Leads',  fmt: n0,                                 lowerIsBetter: false },
    { key: 'thruplay', label: 'ThruPlay', fmt: n0,                               lowerIsBetter: false },
  ] as const;

  function winnerColor(w: 'a' | 'b' | 'tie', side: 'a' | 'b') {
    if (w === 'tie') return '';
    return w === side ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-100 text-red-700';
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-bold text-gray-900">Comparador A/B</h2>
        <p className="text-xs text-gray-400 mt-0.5">Compare métricas de duas campanhas lado a lado</p>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Campanha A — ID</label>
          <input value={campaignA} onChange={e => setCampaignA(e.target.value)} placeholder="123456789"
            className="mt-1 w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Campanha B — ID</label>
          <input value={campaignB} onChange={e => setCampaignB(e.target.value)} placeholder="987654321"
            className="mt-1 w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {(['7d', '15d', '30d'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all', period === p ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100')}>
              {p}
            </button>
          ))}
        </div>
        <button onClick={comparar} disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          {loading ? 'Comparando...' : 'Comparar'}
        </button>
        {error && <span className="text-red-600 text-xs">{error}</span>}
      </div>

      {result && (
        <div className="space-y-4">
          {/* Vencedor */}
          <div className={cn('rounded-2xl border p-4 text-center',
            result.vencedor_geral === 'a' ? 'bg-green-50 border-green-200' :
            result.vencedor_geral === 'b' ? 'bg-blue-50 border-blue-200' :
            'bg-gray-50 border-gray-200')}>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Vencedor geral</div>
            <div className="text-2xl font-bold text-gray-900">
              {result.vencedor_geral === 'empate' ? 'Empate' :
               result.vencedor_geral === 'a' ? `Campanha A — ${result.a.nome}` : `Campanha B — ${result.b.nome}`}
            </div>
            <div className="text-sm text-gray-500 mt-1">Score: A {result.score.a} × B {result.score.b}</div>
          </div>

          {/* Tabela de métricas */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase w-24">Métrica</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-blue-600 uppercase">A — {result.a.nome.slice(0, 20)}</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-purple-600 uppercase">B — {result.b.nome.slice(0, 20)}</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase">Δ%</th>
                </tr>
              </thead>
              <tbody>
                {METRICAS.map(m => {
                  const comp = result.comparativo?.[m.key];
                  const valA = result.a[m.key] as number;
                  const valB = result.b[m.key] as number;
                  const winner = comp?.vencedor || 'tie';
                  return (
                    <tr key={m.key} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-3 font-medium text-gray-700 text-xs uppercase tracking-wide">{m.label}</td>
                      <td className={cn('px-4 py-3 text-center rounded-none font-semibold border', winnerColor(winner, 'a'))}>
                        {m.fmt(valA)}
                        {winner === 'a' && <span className="ml-1 text-[10px]">✓</span>}
                      </td>
                      <td className={cn('px-4 py-3 text-center font-semibold border', winnerColor(winner, 'b'))}>
                        {m.fmt(valB)}
                        {winner === 'b' && <span className="ml-1 text-[10px]">✓</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-500">
                        {comp?.diff_pct !== undefined ? (comp.diff_pct > 0 ? '+' : '') + comp.diff_pct.toFixed(1) + '%' : '—'}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-700 text-xs uppercase tracking-wide">Gasto</td>
                  <td className="px-4 py-3 text-center font-semibold text-gray-800">{brl2(result.a.spend)}</td>
                  <td className="px-4 py-3 text-center font-semibold text-gray-800">{brl2(result.b.spend)}</td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!result && !loading && (
        <div className="text-center py-12 text-gray-300">
          <Zap size={40} className="mx-auto mb-3" />
          <p className="text-sm text-gray-500">Informe os IDs das campanhas para comparar</p>
        </div>
      )}
    </div>
  );
}

/* ─── Aba Catálogo / DPA ───────────────────────────────────────────────────── */

interface CatalogItem {
  id: string; nome: string; total_produtos: number; total_feeds: number; vertical: string;
}
interface ProductItem {
  id: string; nome: string; descricao: string; preco: number; preco_oferta: number | null;
  disponivel: boolean; url: string; imagem: string; marca: string; categoria: string;
}

function CatalogoTab() {
  const [catalogs, setCatalogs]           = useState<CatalogItem[]>([]);
  const [catalogsLoading, setCatalogsLoading] = useState(false);
  const [catalogsLoaded, setCatalogsLoaded]   = useState(false);
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogItem | null>(null);
  const [products, setProducts]           = useState<ProductItem[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [dpaForm, setDpaForm]             = useState(false);
  const [dpaName, setDpaName]             = useState('');
  const [dpaBudget, setDpaBudget]         = useState('50');
  const [dpaLoading, setDpaLoading]       = useState(false);
  const [dpaResult, setDpaResult]         = useState<string | null>(null);
  const [error, setError]                 = useState<string | null>(null);

  async function loadCatalogs() {
    setCatalogsLoading(true); setError(null);
    try {
      const res = await authFetch('/api/meta/catalog');
      const json = await res.json() as { catalogs?: CatalogItem[]; error?: string };
      if (!res.ok) { setError(json.error || 'Erro ao carregar catálogos'); return; }
      setCatalogs(json.catalogs || []);
      setCatalogsLoaded(true);
    } catch (e) { setError(String(e)); }
    finally { setCatalogsLoading(false); }
  }

  async function loadProducts(catalog: CatalogItem) {
    setSelectedCatalog(catalog); setProducts([]); setProductsLoading(true);
    try {
      const res = await authFetch(`/api/meta/catalog?catalog_id=${catalog.id}`);
      const json = await res.json() as { products?: ProductItem[] };
      setProducts(json.products || []);
    } catch { /* silencioso */ }
    finally { setProductsLoading(false); }
  }

  async function criarDPA() {
    if (!selectedCatalog) return;
    setDpaLoading(true); setDpaResult(null); setError(null);
    try {
      const res = await authFetch('/api/meta/catalog', {
        method: 'POST',
        body: JSON.stringify({
          catalog_id:  selectedCatalog.id,
          adset_name:  dpaName || 'Conjunto DPA',
          ad_name:     dpaName || 'Anúncio dinâmico',
          daily_budget: parseFloat(dpaBudget) || 50,
        }),
      });
      const json = await res.json() as { ok?: boolean; campaign_id?: string; aviso?: string; error?: string };
      if (!res.ok || !json.ok) { setError(json.error || 'Erro ao criar DPA'); return; }
      setDpaResult(`Campanha DPA criada! ID: ${json.campaign_id}. ${json.aviso || ''}`);
      setDpaForm(false);
    } catch (e) { setError(String(e)); }
    finally { setDpaLoading(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900">Catálogos de Produtos</h2>
          <p className="text-xs text-gray-400 mt-0.5">Gerencie catálogos e crie anúncios dinâmicos (DPA)</p>
        </div>
        <button onClick={loadCatalogs} disabled={catalogsLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
          {catalogsLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {catalogsLoaded ? 'Atualizar' : 'Carregar catálogos'}
        </button>
      </div>

      {error && <div className="text-red-600 text-xs bg-red-50 px-4 py-3 rounded-xl border border-red-200">{error}</div>}
      {dpaResult && <div className="text-green-800 text-xs bg-green-50 px-4 py-3 rounded-xl border border-green-200">{dpaResult}</div>}

      {!catalogsLoaded && !catalogsLoading && (
        <div className="text-center py-12 text-gray-300">
          <ImageIcon size={40} className="mx-auto mb-3" />
          <p className="text-sm text-gray-500">Clique em "Carregar catálogos" para ver seus catálogos do Meta</p>
        </div>
      )}

      {catalogsLoaded && catalogs.length === 0 && (
        <div className="text-center py-12 text-gray-300">
          <ImageIcon size={40} className="mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum catálogo encontrado nesta conta.</p>
        </div>
      )}

      {catalogs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {catalogs.map(cat => (
            <div key={cat.id}
              onClick={() => loadProducts(cat)}
              className={cn('cursor-pointer rounded-2xl border p-4 transition-all hover:shadow-md',
                selectedCatalog?.id === cat.id ? 'border-blue-400 bg-blue-50' : 'border-gray-100 bg-white')}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-gray-900 text-sm">{cat.nome}</div>
                  <div className="text-xs text-gray-400 mt-0.5 capitalize">{cat.vertical}</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-gray-900">{n0(cat.total_produtos)}</div>
                  <div className="text-[10px] text-gray-400">produtos</div>
                </div>
              </div>
              {selectedCatalog?.id === cat.id && (
                <button
                  onClick={e => { e.stopPropagation(); setDpaForm(true); }}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                >
                  <Wand2 size={12} /> Criar anúncio dinâmico (DPA)
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* DPA form */}
      {dpaForm && selectedCatalog && (
        <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4 space-y-3">
          <div className="font-semibold text-gray-900 text-sm">Criar campanha DPA — {selectedCatalog.nome}</div>
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Nome do conjunto / anúncio</label>
            <input value={dpaName} onChange={e => setDpaName(e.target.value)} placeholder="Ex: Rasteirinhas Verão"
              className="mt-1 w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Orçamento diário (R$)</label>
            <input value={dpaBudget} onChange={e => setDpaBudget(e.target.value)} type="number" min="5" placeholder="50"
              className="mt-1 w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            A campanha será criada com status <strong>PAUSADA</strong>. Revise e ative no Gerenciador de Anúncios.
          </div>
          <div className="flex gap-2">
            <button onClick={criarDPA} disabled={dpaLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
              {dpaLoading ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
              {dpaLoading ? 'Criando...' : 'Criar DPA'}
            </button>
            <button onClick={() => setDpaForm(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
          </div>
        </div>
      )}

      {/* Products grid */}
      {selectedCatalog && productsLoading && (
        <div className="text-center py-6 text-gray-400"><Loader2 size={24} className="animate-spin mx-auto mb-2" /><p className="text-sm">Carregando produtos...</p></div>
      )}
      {selectedCatalog && !productsLoading && products.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">
            {products.length} produtos — {selectedCatalog.nome}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {products.slice(0, 24).map(p => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {p.imagem && (
                  <img src={p.imagem} alt={p.nome} className="w-full h-28 object-cover bg-gray-100" />
                )}
                {!p.imagem && (
                  <div className="w-full h-28 bg-gray-100 flex items-center justify-center">
                    <ImageIcon size={24} className="text-gray-300" />
                  </div>
                )}
                <div className="p-2">
                  <div className="text-xs font-semibold text-gray-800 truncate">{p.nome}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {p.preco_oferta ? (
                      <><span className="line-through text-gray-300">{brl2(p.preco)}</span> <span className="text-green-700 font-semibold">{brl2(p.preco_oferta)}</span></>
                    ) : brl2(p.preco)}
                  </div>
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded mt-1 inline-block font-medium',
                    p.disponivel ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>
                    {p.disponivel ? 'Disponível' : 'Indisponível'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {products.length > 24 && (
            <p className="text-xs text-gray-400 text-center mt-3">Exibindo 24 de {products.length} produtos</p>
          )}
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

/* ─── Painel de Regras Automáticas ────────────────────────────────────────── */

interface AutoRule {
  id: string; nome: string; ativa: boolean;
  condicao: { metrica: string; operador: string; valor: number; janela_dias: number };
  acao: { tipo: string; incremento_pct?: number };
  vezes_executada: number; ultima_execucao?: string;
}

const METRICA_LABELS: Record<string, string> = {
  cpl: 'CPL (custo por lead)', roas: 'ROAS', ctr: 'CTR (%)',
  cpm: 'CPM', frequencia: 'Frequência', gasto: 'Gasto diário (R$)',
};
const ACAO_LABELS: Record<string, string> = {
  pausar_campanha:  'Pausar campanha',
  escalar_orcamento: 'Escalar orçamento',
  notificar:        'Notificar (sem ação)',
};

function RulesPanel() {
  const [rules, setRules]       = useState<AutoRule[]>([]);
  const [loading, setLoading]   = useState(false);
  const [loaded, setLoaded]     = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Form state
  const [nome, setNome]           = useState('');
  const [metrica, setMetrica]     = useState<string>('cpl');
  const [operador, setOperador]   = useState<string>('maior_que');
  const [valor, setValor]         = useState('');
  const [janela, setJanela]       = useState('2');
  const [acao, setAcao]           = useState<string>('pausar_campanha');
  const [incremento, setIncremento] = useState('20');

  async function loadRules() {
    setLoading(true);
    try {
      const res = await authFetch('/api/trafego/rules');
      if (res.ok) { const j = await res.json() as { rules: AutoRule[] }; setRules(j.rules || []); setLoaded(true); }
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }

  async function toggleRule(rule: AutoRule) {
    const res = await authFetch('/api/trafego/rules', {
      method: 'PATCH',
      body: JSON.stringify({ id: rule.id, ativa: !rule.ativa }),
    });
    if (res.ok) setRules(prev => prev.map(r => r.id === rule.id ? { ...r, ativa: !r.ativa } : r));
  }

  async function deleteRule(id: string) {
    const res = await authFetch(`/api/trafego/rules?id=${id}`, { method: 'DELETE' });
    if (res.ok) setRules(prev => prev.filter(r => r.id !== id));
  }

  async function saveRule() {
    if (!nome.trim() || !valor) { setFeedback('Preencha todos os campos'); return; }
    setSaving(true); setFeedback(null);
    try {
      const res = await authFetch('/api/trafego/rules', {
        method: 'POST',
        body: JSON.stringify({
          nome: nome.trim(), ativa: true,
          condicao: { metrica, operador, valor: parseFloat(valor), janela_dias: parseInt(janela) || 1 },
          acao: { tipo: acao, ...(acao === 'escalar_orcamento' ? { incremento_pct: parseFloat(incremento) / 100 } : {}) },
        }),
      });
      const j = await res.json() as { ok?: boolean; rule?: AutoRule; error?: string };
      if (j.ok && j.rule) {
        setRules(prev => [j.rule!, ...prev]);
        setFeedback('✅ Regra criada!');
        setShowForm(false); setNome(''); setValor('');
      } else { setFeedback(j.error || 'Erro ao salvar'); }
    } catch (e) { setFeedback(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900">Regras automáticas</h2>
          <p className="text-xs text-gray-500 mt-0.5">Pausar, escalar ou notificar quando métricas atingirem limites</p>
        </div>
        <div className="flex gap-2">
          {!loaded && (
            <button onClick={loadRules} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 disabled:opacity-50">
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {loading ? 'Carregando...' : 'Carregar regras'}
            </button>
          )}
          {loaded && (
            <button onClick={() => setShowForm(f => !f)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">
              <Plus size={12} /> Nova regra
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className={cn('px-4 py-3 rounded-xl text-sm border',
          feedback.startsWith('✅') ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800')}>
          {feedback}
          <button onClick={() => setFeedback(null)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Formulário nova regra */}
      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-blue-900 text-sm">Nova regra</h3>
            <button onClick={() => setShowForm(false)} className="text-blue-400 hover:text-blue-600"><X size={16} /></button>
          </div>
          <div>
            <label className="block text-xs font-medium text-blue-800 mb-1">Nome da regra</label>
            <input type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Pausar CPL alto"
              className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-blue-800 mb-1">Métrica</label>
              <select value={metrica} onChange={e => setMetrica(e.target.value)}
                className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none appearance-none">
                {Object.entries(METRICA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-blue-800 mb-1">Condição</label>
              <select value={operador} onChange={e => setOperador(e.target.value)}
                className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none appearance-none">
                <option value="maior_que">maior que</option>
                <option value="menor_que">menor que</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-blue-800 mb-1">Valor</label>
              <input type="number" value={valor} onChange={e => setValor(e.target.value)} placeholder="Ex: 30"
                className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <div>
              <label className="block text-xs font-medium text-blue-800 mb-1">Por quantos dias</label>
              <select value={janela} onChange={e => setJanela(e.target.value)}
                className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none appearance-none">
                {[1,2,3,7].map(d => <option key={d} value={d}>{d} {d === 1 ? 'dia' : 'dias'}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-blue-800 mb-1">Ação</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(ACAO_LABELS).map(([k, v]) => (
                <button key={k} onClick={() => setAcao(k)}
                  className={cn('px-3 py-1.5 rounded-xl border text-xs font-medium transition-all',
                    acao === k ? 'bg-blue-600 text-white border-blue-600' : 'border-blue-200 text-blue-700 bg-white hover:bg-blue-100')}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          {acao === 'escalar_orcamento' && (
            <div>
              <label className="block text-xs font-medium text-blue-800 mb-1">Incremento (%)</label>
              <div className="flex gap-2">
                {[10, 20, 25, 30].map(p => (
                  <button key={p} onClick={() => setIncremento(String(p))}
                    className={cn('px-3 py-1.5 rounded-xl border text-xs font-medium',
                      incremento === String(p) ? 'bg-green-600 text-white border-green-600' : 'border-blue-200 text-blue-700 bg-white')}>
                    +{p}%
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)}
              className="flex-1 px-3 py-2 rounded-xl border border-blue-200 text-blue-700 text-sm hover:bg-blue-100">Cancelar</button>
            <button onClick={saveRule} disabled={saving}
              className="flex-1 px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 size={13} className="animate-spin" />} Salvar regra
            </button>
          </div>
        </div>
      )}

      {!loaded && !loading && (
        <div className="text-center py-10 text-gray-400">
          <Zap size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Clique em "Carregar regras" para ver e gerenciar suas automações</p>
        </div>
      )}

      {loaded && rules.length === 0 && !showForm && (
        <div className="text-center py-10 text-gray-400">
          <Zap size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma regra criada ainda</p>
          <p className="text-xs mt-1">Crie regras para pausar campanhas ou escalar orçamento automaticamente</p>
        </div>
      )}

      {rules.length > 0 && (
        <div className="space-y-3">
          {rules.map(rule => (
            <div key={rule.id} className={cn('bg-white rounded-2xl border p-4 space-y-2',
              rule.ativa ? 'border-gray-100' : 'border-gray-100 opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="font-semibold text-gray-900 text-sm">{rule.nome}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Se <strong>{METRICA_LABELS[rule.condicao.metrica] || rule.condicao.metrica}</strong>{' '}
                    {rule.condicao.operador === 'maior_que' ? '>' : '<'}{' '}
                    <strong>{rule.condicao.valor}</strong> por{' '}
                    <strong>{rule.condicao.janela_dias}</strong> {rule.condicao.janela_dias === 1 ? 'dia' : 'dias'}{' '}
                    → <strong>{ACAO_LABELS[rule.acao.tipo] || rule.acao.tipo}</strong>
                    {rule.acao.tipo === 'escalar_orcamento' && rule.acao.incremento_pct
                      ? ` (+${Math.round(rule.acao.incremento_pct * 100)}%)`
                      : ''}
                  </div>
                  {rule.ultima_execucao && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      Última execução: {formatDateTime(rule.ultima_execucao)} · {rule.vezes_executada}x executada
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggleRule(rule)}
                    className={cn('px-2.5 py-1 rounded-lg text-xs font-medium border transition-all',
                      rule.ativa ? 'border-green-200 text-green-600 bg-green-50' : 'border-gray-200 text-gray-500 bg-gray-50')}>
                    {rule.ativa ? 'Ativa' : 'Pausada'}
                  </button>
                  <button onClick={() => deleteRule(rule.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <X size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Painel de Leads ──────────────────────────────────────────────────────── */

function LeadsPanel() {
  const [forms, setForms]             = useState<Array<{ id: string; nome: string; status: string; leads_count: number; created_time: string; campos: string[] }>>([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [formsLoaded, setFormsLoaded]   = useState(false);
  const [syncing, setSyncing]           = useState<string | null>(null);
  const [syncResult, setSyncResult]     = useState<{ formId: string; salvos: number; total: number } | null>(null);

  async function loadForms() {
    setFormsLoading(true);
    try {
      const res = await authFetch('/api/meta/leads/forms');
      if (res.ok) {
        const json = await res.json() as { forms: typeof forms };
        setForms(json.forms || []);
        setFormsLoaded(true);
      }
    } catch { /* silencioso */ }
    finally { setFormsLoading(false); }
  }

  async function syncLeads(formId: string) {
    setSyncing(formId);
    setSyncResult(null);
    try {
      const res = await authFetch(`/api/meta/leads/sync?form_id=${formId}&limit=100`);
      if (res.ok) {
        const json = await res.json() as { salvos: number; leads: unknown[] };
        setSyncResult({ formId, salvos: json.salvos, total: json.leads.length });
        // atualizar contagem local
        setForms(prev => prev.map(f => f.id === formId ? { ...f, leads_count: Math.max(f.leads_count, json.leads.length) } : f));
      }
    } catch { /* silencioso */ }
    finally { setSyncing(null); }
  }

  async function syncAll() {
    if (!forms.length) return;
    setSyncing('all');
    setSyncResult(null);
    try {
      const res = await authFetch('/api/meta/leads/sync', {
        method: 'POST',
        body: JSON.stringify({ form_ids: forms.map(f => f.id) }),
      });
      if (res.ok) {
        const json = await res.json() as { total_salvos: number };
        setSyncResult({ formId: 'all', salvos: json.total_salvos, total: json.total_salvos });
      }
    } catch { /* silencioso */ }
    finally { setSyncing(null); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900">Leads dos formulários</h2>
          <p className="text-xs text-gray-500 mt-0.5">Puxe leads de qualquer Instant Form direto para o CRM</p>
        </div>
        <div className="flex gap-2">
          {formsLoaded && forms.length > 0 && (
            <button onClick={syncAll} disabled={syncing === 'all'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
              {syncing === 'all' ? <Loader2 size={12} className="animate-spin" /> : <CloudDownload size={12} />}
              Sincronizar todos
            </button>
          )}
          {!formsLoaded && (
            <button onClick={loadForms} disabled={formsLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
              {formsLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {formsLoading ? 'Carregando...' : 'Carregar formulários'}
            </button>
          )}
        </div>
      </div>

      {syncResult && (
        <div className={cn('flex items-center gap-2 px-4 py-3 rounded-xl text-sm',
          syncResult.salvos > 0 ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-gray-50 text-gray-600 border border-gray-200')}>
          <CheckCircle size={15} />
          {syncResult.formId === 'all'
            ? `${syncResult.salvos} leads novos importados de todos os formulários`
            : `${syncResult.salvos} leads novos · ${syncResult.total} leads no formulário`}
        </div>
      )}

      {!formsLoaded && !formsLoading && (
        <div className="text-center py-12 text-gray-400">
          <FileText size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Clique em "Carregar formulários" para ver seus Instant Forms</p>
        </div>
      )}

      {formsLoaded && forms.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <FileText size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum formulário de lead encontrado nesta página.</p>
          <p className="text-xs mt-1">Verifique se o Page ID está configurado corretamente.</p>
        </div>
      )}

      {forms.length > 0 && (
        <div className="space-y-3">
          {forms.map(form => (
            <div key={form.id} className="bg-white border border-gray-100 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">{form.nome}</h3>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                      form.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                      {form.status === 'ACTIVE' ? 'Ativo' : form.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span><strong className="text-gray-800">{n0(form.leads_count)}</strong> leads coletados</span>
                    <span>Criado {formatDate(form.created_time)}</span>
                  </div>
                  {form.campos.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {form.campos.map(c => (
                        <span key={c} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md">{c}</span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => syncLeads(form.id)}
                  disabled={syncing === form.id}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 text-blue-600 text-xs font-medium hover:bg-blue-50 disabled:opacity-50 transition-colors"
                >
                  {syncing === form.id ? <Loader2 size={12} className="animate-spin" /> : <CloudDownload size={12} />}
                  {syncing === form.id ? 'Importando...' : 'Importar leads'}
                </button>
              </div>
              {syncResult?.formId === form.id && (
                <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-green-700 flex items-center gap-1.5">
                  <CheckCircle size={12} />
                  {syncResult.salvos} leads novos importados · {syncResult.total} total no formulário
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Página Principal ─────────────────────────────────────────────────────── */

export default function TrafegoPage() {
  const [period, setPeriod] = useState<Period>('7d');
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('campanhas');
  const [pendentes, setPendentes] = useState(0);

  useEffect(() => {
    authFetch('/api/meta/campanhas/fila')
      .then(r => r.json())
      .then((data: unknown) => setPendentes(Array.isArray(data) ? data.length : 0))
      .catch(() => {});
  }, []);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [drillAdsets, setDrillAdsets] = useState<MetaAdset[]>([]);
  const [drillAds, setDrillAds] = useState<MetaAd[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [expandedAdsetId, setExpandedAdsetId] = useState<string | null>(null);
  const [copies, setCopies] = useState<Array<{ id: string; headline: string; texto_principal: string; cta: string; justificativa?: string }>>([]);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [novaCampanhaOpen, setNovaCampanhaOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'ACTIVE' | 'PAUSED' | 'WITH_ISSUES' | 'PENDING_REVIEW'>('all');
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [metaPageId, setMetaPageId] = useState('');
  useEffect(() => {
    authFetch('/api/trafego/config/page-id')
      .then(r => r.json())
      .then((d: { page_id?: string }) => { if (d.page_id) setMetaPageId(d.page_id); })
      .catch(() => {});
  }, []);

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

  function renderSecao() {
    switch (tab) {
      case 'campanhas':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-sm">Campanhas</h2>
              <button
                onClick={() => setNovaCampanhaOpen(true)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors"
              >
                <Plus size={12} /> Nova campanha
              </button>
            </div>
            {/* Filtros de status */}
            {!loading && (data?.campaigns || []).length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {([
                  { value: 'all',            label: 'Todas' },
                  { value: 'ACTIVE',         label: 'Rodando' },
                  { value: 'PAUSED',         label: 'Pausadas' },
                  { value: 'WITH_ISSUES',    label: 'Com problema' },
                  { value: 'PENDING_REVIEW', label: 'Em revisão' },
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
            {loading && <div className="text-center py-12 text-gray-600 text-sm">Carregando campanhas...</div>}
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
                <div className="text-center py-8 text-gray-400 text-sm">Nenhuma campanha com este status</div>
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
                      {filtered.map((c) => {
                        const isExpanded = expandedCampaignId === c.id;
                        return (
                          <React.Fragment key={c.id}>
                            <tr className="hover:bg-gray-50 transition-colors group">
                              <td className="py-3 pr-4">
                                <div className="font-medium text-gray-800 text-sm">{c.nome}</div>
                                {c.alerts.length > 0 && (
                                  <div className="text-xs text-red-400 mt-0.5">{c.alerts[0].mensagem.substring(0, 50)}…</div>
                                )}
                              </td>
                              <td className="py-3 pr-4"><EffectiveStatusBadge status={c.effective_status} /></td>
                              <td className="py-3 pr-4"><HealthBadge health={c.health} /></td>
                              <td className="py-3 pr-4 text-right text-sm font-medium text-gray-700">{brl(c.spend)}</td>
                              <td className="py-3 pr-4 text-right">
                                <div className={cn('text-sm font-medium', c.roas >= 3 ? 'text-emerald-400' : c.roas >= 1.5 ? 'text-amber-400' : 'text-red-400')}>
                                  {c.roas > 0 ? `${c.roas.toFixed(1)}×` : '—'}
                                </div>
                              </td>
                              <td className="py-3 pr-4 text-right text-sm text-gray-400">{c.leads > 0 ? c.leads : '—'}</td>
                              <td className="py-3">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => setSelectedCampaign(c)}
                                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 flex items-center gap-1 whitespace-nowrap transition-colors"
                                  >
                                    Gerir <ChevronRight size={12} />
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (isExpanded) { setExpandedCampaignId(null); setExpandedAdsetId(null); return; }
                                      setExpandedCampaignId(c.id);
                                      setExpandedAdsetId(null);
                                      setDrillAdsets([]);
                                      setDrillAds([]);
                                      setDrillLoading(true);
                                      try {
                                        const [adsetsRes, adsRes] = await Promise.all([
                                          authFetch(`/api/meta/campanhas/${c.id}/adsets`),
                                          authFetch(`/api/meta/campanhas/${c.id}/ads`),
                                        ]);
                                        const [adsets, ads] = await Promise.all([
                                          adsetsRes.json() as Promise<MetaAdset[]>,
                                          adsRes.json() as Promise<MetaAd[]>,
                                        ]);
                                        setDrillAdsets(Array.isArray(adsets) ? adsets : []);
                                        setDrillAds(Array.isArray(ads) ? ads : []);
                                      } catch { /* silencioso */ }
                                      setDrillLoading(false);
                                    }}
                                    className={cn(
                                      'p-1.5 rounded-lg border transition-colors',
                                      isExpanded ? 'bg-[#1e3a5f]/10 border-[#1e3a5f]/30 text-[#1e3a5f]' : 'border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                                    )}
                                  >
                                    <ChevronDown size={12} className={cn('transition-transform', isExpanded && 'rotate-180')} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${c.id}-drill`}>
                                <td colSpan={7} className="p-0">
                                  <div className="bg-[#161b24] border-t border-[#242d40] px-6 py-4">
                                    {drillLoading ? (
                                      <div className="flex items-center gap-2 text-gray-400 text-xs py-2">
                                        <Loader2 size={12} className="animate-spin" /> Carregando...
                                      </div>
                                    ) : drillAdsets.length === 0 ? (
                                      <p className="text-gray-500 text-xs py-2">Nenhum conjunto encontrado</p>
                                    ) : (
                                      <div className="space-y-3">
                                        {drillAdsets.map(adset => {
                                          const adsetAds = drillAds.filter(ad => ad.adset_id === adset.id);
                                          const adsetExpanded = expandedAdsetId === adset.id;
                                          return (
                                            <div key={adset.id}>
                                              <button
                                                onClick={() => setExpandedAdsetId(adsetExpanded ? null : adset.id)}
                                                className="w-full flex items-center justify-between gap-3 text-left"
                                              >
                                                <div className="flex items-center gap-2 min-w-0">
                                                  <ChevronDown size={12} className={cn('shrink-0 text-gray-500 transition-transform', adsetExpanded && 'rotate-180')} />
                                                  <span className="text-xs font-medium text-gray-200 truncate">{adset.name}</span>
                                                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0',
                                                    (adset.effective_status ?? adset.status) === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-600/40 text-gray-400'
                                                  )}>
                                                    {adset.effective_status ?? adset.status}
                                                  </span>
                                                </div>
                                                <span className="text-[10px] text-gray-500 shrink-0">
                                                  {adset.daily_budget ? `R$${(Number(adset.daily_budget)/100).toFixed(0)}/dia` : ''}
                                                  {adsetAds.length > 0 && ` · ${adsetAds.length} anúncio${adsetAds.length > 1 ? 's' : ''}`}
                                                </span>
                                              </button>
                                              {adsetExpanded && (
                                                <div className="mt-2 ml-5 space-y-2">
                                                  {adsetAds.length === 0 ? (
                                                    <p className="text-[11px] text-gray-600">Nenhum anúncio neste conjunto</p>
                                                  ) : adsetAds.map(ad => (
                                                    <div key={ad.id} className="flex items-center gap-3 bg-[#1c2333] rounded-xl px-3 py-2 border border-[#242d40]">
                                                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-[#242d40] shrink-0 flex items-center justify-center">
                                                        {ad.creative?.thumbnail_url
                                                          ? <img src={ad.creative.thumbnail_url} alt={ad.name} className="w-full h-full object-cover" />
                                                          : <Play size={14} className="text-gray-600" />
                                                        }
                                                      </div>
                                                      <div className="flex-1 min-w-0">
                                                        <div className="text-xs font-medium text-gray-200 truncate">{ad.creative?.title ?? ad.name}</div>
                                                        {ad.creative?.body && <div className="text-[11px] text-gray-500 truncate mt-0.5">{ad.creative.body}</div>}
                                                      </div>
                                                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0',
                                                        (ad.effective_status ?? ad.status) === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-600/40 text-gray-400'
                                                      )}>
                                                        {ad.effective_status ?? ad.status}
                                                      </span>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
            <div className="mt-6 pt-6 border-t border-gray-100">
              <CriadorCampanha pageId={metaPageId || '101337882545607'} whatsappNumber="5562981480687" />
            </div>
          </div>
        );
      case 'criativos':  return <GaleriaCriativos />;
      case 'publicos':   return <PublicosTab />;
      case 'textos':     return <TextosTab copies={copies} />;
      case 'analise':    return <AnaliseTab />;
      case 'relatorio':  return <RelatorioTab />;
      case 'agente':     return <AgenteTrafegoPanel />;
      case 'aprovacoes': return <FilaAprovacao />;
      case 'leads':      return <LeadsPanel />;
      case 'regras':     return <RulesPanel />;
      case 'consolidado': return <ConsolidadoTab />;
      case 'abtest':     return <ABTestTab />;
      case 'catalogo':   return <CatalogoTab />;
      case 'biblioteca': return null;
      case 'config':
        return (
          <div className="max-w-lg">
            <h2 className="font-bold text-gray-900 mb-1">Conexão com o Meta Ads</h2>
            <p className="text-xs text-gray-500 mb-5">
              Configure um System User Token para integração permanente.
            </p>
            <MetaTokenConfig />
          </div>
        );
      default: return null;
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 py-6 space-y-4">

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

        {/* ─── Layout de duas colunas ─────────────────────────────────────── */}
        <div className="flex gap-5 items-start mt-4">

          {/* Conteúdo principal */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-2xl border border-gray-100">
              <div className="p-5">
                {renderSecao()}
              </div>
            </div>
          </div>

          {/* Menu lateral direito */}
          <div className="w-52 shrink-0">
            <div
              className="rounded-2xl overflow-hidden sticky top-6"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              {/* Header */}
              <div className="px-4 py-4 border-b border-white/10">
                <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
                  Módulos
                </p>
              </div>

              {/* Itens */}
              <nav className="p-2 space-y-0.5">
                {([
                  { key: 'campanhas',  label: 'Campanhas',     icon: Target },
                  { key: 'criativos',  label: 'Criativos',     icon: ImageIcon },
                  { key: 'publicos',   label: 'Públicos',      icon: Users },
                  { key: 'textos',     label: 'Textos',        icon: FileText },
                  { key: 'analise',    label: 'Análise',       icon: Zap },
                  { key: 'relatorio',  label: 'Relatório',     icon: BarChart3 },
                  { key: 'agente',     label: 'Agente',        icon: Bot },
                  { key: 'aprovacoes', label: 'Aprovações',    icon: CheckCircle, badge: pendentes },
                  { key: 'leads',      label: 'Leads',         icon: CloudDownload },
                  { key: 'config',     label: 'Configurações', icon: Settings },
                ] as Array<{ key: Tab; label: string; icon: React.ElementType; badge?: number }>).map(item => {
                  const ativo = tab === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => setTab(item.key)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 relative',
                        ativo
                          ? 'bg-white/15 text-white'
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <item.icon
                        size={17}
                        className={cn('shrink-0 transition-colors', ativo ? 'text-white' : 'text-white/60')}
                      />
                      <span className="text-sm font-medium truncate">{item.label}</span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="ml-auto w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                          {item.badge > 9 ? '9+' : item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              {/* Footer */}
              <div className="px-4 py-3 border-t border-white/10 mt-1">
                <p className="text-[10px] text-white/30">Tráfego v2.0</p>
              </div>
            </div>
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
