'use client';

import { useState } from 'react';
import {
  AlertOctagon, AlertTriangle, ChevronDown, Copy, DollarSign,
  Edit2, FileText, Image as ImageIcon, Loader2, Pause, Play,
  Users, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch, brl, brl2, formatDate, n0, pct } from '@/components/trafego/trafegoUtils';
import { HealthBadge } from '@/components/trafego/HealthBadge';
import type { Campaign, DailyMetric, BreakdownRow } from '@/components/trafego/trafegoTypes';

const CTA_OPTIONS = [
  'Saiba mais', 'Comprar agora', 'Cadastrar', 'Entrar em contato',
  'Enviar mensagem', 'Falar agora', 'Ver oferta', 'Quero ser franqueada',
];

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

export function CampaignDetailPanel({
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
          ad_id: campaign.id,
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
                {([
                  { label: '25%', value: campaign.video.p25, color: 'bg-blue-400' },
                  { label: '50%', value: campaign.video.p50, color: 'bg-blue-500' },
                  { label: '75%', value: campaign.video.p75, color: 'bg-violet-500' },
                  { label: '95%', value: campaign.video.p95, color: 'bg-violet-600' },
                  { label: '100%', value: campaign.video.p100, color: 'bg-green-500' },
                ] as const).map(({ label, value, color }) => {
                  const pctVal = campaign.video!.p25 > 0 ? Math.round((value / campaign.video!.p25) * 100) : 0;
                  return (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-8 text-right">{label}</span>
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', color)} style={{ width: `${pctVal}%` }} />
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
