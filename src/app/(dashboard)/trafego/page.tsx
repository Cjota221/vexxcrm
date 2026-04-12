'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useMetaAccounts } from '@/hooks/useMetaAccounts';
import { AccountTabs } from '@/components/trafego/AccountTabs';
import { AddAccountModal } from '@/components/trafego/AddAccountModal';
import { MetaTokenConfig } from '@/components/meta/MetaTokenConfig';
import { GaleriaCriativos } from '@/components/meta/GaleriaCriativos';
import { CriadorCampanha } from '@/components/meta/CriadorCampanha';
import { JarvisAgentPanel } from '@/components/meta/JarvisAgentPanel';
import { FilaAprovacao } from '@/components/meta/FilaAprovacao';
import { BibliotecaInteresses } from '@/components/meta/BibliotecaInteresses';
import { FunilConversao } from '@/components/trafego/FunilConversao';
import { useUIStore } from '@/store/ui';
import {
  RefreshCw, AlertTriangle, CheckCircle,
  Clock, ChevronRight, ChevronDown, Pause, Play,
  Target, Loader2, Plus, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { authFetch, brl, brl2, n0, pct, formatDate, formatDateTime, getSazonalidade } from '@/components/trafego/trafegoUtils';
import type { Campaign, MetaAdset, MetaAd, MetricsData, Period, Tab, Summary } from '@/components/trafego/trafegoTypes';
import { PeriodBtn } from '@/components/trafego/PeriodBtn';
import { MetricCard } from '@/components/trafego/MetricCard';
import { HealthBadge } from '@/components/trafego/HealthBadge';
import { EffectiveStatusBadge } from '@/components/trafego/EffectiveStatusBadge';
import { CampaignDetailPanel } from '@/components/trafego/CampaignDetailPanel';
import { NovaCampanhaModal } from '@/components/trafego/NovaCampanhaModal';
import { PublicosTab } from '@/components/trafego/PublicosTab';
import { TextosTab } from '@/components/trafego/TextosTab';
import { AnaliseTab } from '@/components/trafego/AnaliseTab';
import { RelatorioTab } from '@/components/trafego/RelatorioTab';
import { ConsolidadoTab } from '@/components/trafego/ConsolidadoTab';
import { ABTestTab } from '@/components/trafego/ABTestTab';
import { CatalogoTab } from '@/components/trafego/CatalogoTab';
import { RulesPanel } from '@/components/trafego/RulesPanel';
import { LeadsPanel } from '@/components/trafego/LeadsPanel';

export default function TrafegoPage() {
  const [period, setPeriod] = useState<Period>('7d');
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Aba ativa gerenciada no store global para que o TrafegoContextMenu
  // (renderizado no layout pai) possa lê-la e alterá-la de forma independente.
  const { trafegoTab: tab, setTrafegoTab: setTab, setTrafegoPendentes } = useUIStore();

  useEffect(() => {
    authFetch('/api/meta/campanhas/fila')
      .then(r => r.json())
      .then((data: unknown) => setTrafegoPendentes(Array.isArray(data) ? data.length : 0))
      .catch(() => {});
  }, [setTrafegoPendentes]);
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
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<string>>(new Set());
  const [deletingBulk, setDeletingBulk] = useState(false);
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

  async function handleDeleteCampaign(campaign: Campaign) {
    if (!confirm(`Deletar "${campaign.nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      const res = await authFetch(`/api/trafego/editor`, {
        method: 'POST',
        body: JSON.stringify({ action: 'deletar_campanha', campaign_id: campaign.id }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (json.ok) {
        handleActionComplete(`Campanha "${campaign.nome}" deletada.`);
        setData(prev => prev ? {
          ...prev,
          campaigns: (prev.campaigns || []).filter(c => c.id !== campaign.id),
        } : prev);
      } else {
        setActionFeedback(`Erro: ${json.error || 'Não foi possível deletar'}`);
      }
    } catch (e) {
      setActionFeedback(`Erro: ${String(e)}`);
    }
  }

  async function handleDeleteBulk() {
    if (selectedCampaignIds.size === 0) return;
    if (!confirm(`Deletar ${selectedCampaignIds.size} campanha(s)? Esta ação não pode ser desfeita.`)) return;
    setDeletingBulk(true);
    const ids = Array.from(selectedCampaignIds);
    let deletedCount = 0;
    const errors: string[] = [];
    for (const id of ids) {
      try {
        const res = await authFetch(`/api/trafego/editor`, {
          method: 'POST',
          body: JSON.stringify({ action: 'deletar_campanha', campaign_id: id }),
        });
        const json = await res.json() as { ok?: boolean; error?: string };
        if (json.ok) {
          deletedCount++;
        } else {
          errors.push(json.error || id);
        }
      } catch (e) {
        errors.push(String(e));
      }
    }
    setData(prev => prev ? {
      ...prev,
      campaigns: (prev.campaigns || []).filter(c => !selectedCampaignIds.has(c.id)),
    } : prev);
    setSelectedCampaignIds(new Set());
    setDeletingBulk(false);
    if (errors.length > 0) {
      setActionFeedback(`${deletedCount} deletada(s). Erros: ${errors.join(', ')}`);
    } else {
      setActionFeedback(`${deletedCount} campanha(s) deletada(s) com sucesso.`);
      setTimeout(() => setActionFeedback(null), 5000);
    }
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
              const allFilteredSelected = filtered.length > 0 && filtered.every(c => selectedCampaignIds.has(c.id));
              const someSelected = selectedCampaignIds.size > 0;
              return (
                <div className="space-y-2">
                  {someSelected && (
                    <div className="flex items-center gap-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <span className="text-xs text-blue-700 font-medium">{selectedCampaignIds.size} selecionada(s)</span>
                      <button
                        onClick={handleDeleteBulk}
                        disabled={deletingBulk}
                        className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                      >
                        <Trash2 size={11} />
                        {deletingBulk ? 'Deletando...' : 'Deletar selecionadas'}
                      </button>
                      <button
                        onClick={() => setSelectedCampaignIds(new Set())}
                        className="text-xs text-blue-500 hover:text-blue-700 transition-colors ml-auto"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="pb-3 pr-2 w-6">
                          <input
                            type="checkbox"
                            checked={allFilteredSelected}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedCampaignIds(prev => new Set([...prev, ...filtered.map(c => c.id)]));
                              } else {
                                setSelectedCampaignIds(prev => {
                                  const next = new Set(prev);
                                  filtered.forEach(c => next.delete(c.id));
                                  return next;
                                });
                              }
                            }}
                            className="cursor-pointer accent-[#1e3a5f]"
                          />
                        </th>
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
                        const isChecked = selectedCampaignIds.has(c.id);
                        return (
                          <React.Fragment key={c.id}>
                            <tr className={cn('hover:bg-gray-50 transition-colors group', isChecked && 'bg-blue-50/50')}>
                              <td className="py-3 pr-2">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={e => {
                                    setSelectedCampaignIds(prev => {
                                      const next = new Set(prev);
                                      if (e.target.checked) next.add(c.id);
                                      else next.delete(c.id);
                                      return next;
                                    });
                                  }}
                                  className="cursor-pointer accent-[#1e3a5f]"
                                />
                              </td>
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
                                    onClick={() => handleDeleteCampaign(c)}
                                    className="p-1.5 rounded-lg border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                    title="Deletar campanha"
                                  >
                                    <Trash2 size={12} />
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
                                <td colSpan={8} className="p-0">
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
      case 'analise':
        return (
          <div className="space-y-6">
            {/* Funil de conversão — dados do período selecionado */}
            {data?.connected && data.summary && (() => {
              const s = data.summary;
              return (
                <FunilConversao
                  totalGasto={s.totalSpend}
                  etapas={[
                    {
                      nome: 'Cliques',
                      valor: s.totalClicks,
                      metricaEsquerda: { label: 'CPC', valor: s.totalCpc, prefixo: 'R$ ' },
                    },
                    {
                      nome: 'Leads',
                      valor: s.totalLeads,
                      metricaEsquerda: { label: 'CPL', valor: s.totalCpl, prefixo: 'R$ ' },
                    },
                    {
                      nome: 'Vendas',
                      valor: s.totalRevenue > 0 ? Math.round(s.totalRevenue / (s.totalCpl || 1)) : 0,
                      metricaDireita: { label: 'ROAS', valor: s.totalRoas, sufixo: 'x' },
                    },
                  ]}
                  totalVendas={s.totalRevenue}
                  roas={s.totalRoas}
                />
              );
            })()}
            <AnaliseTab />
          </div>
        );
      case 'relatorio':  return <RelatorioTab />;
      case 'agente':     return <JarvisAgentPanel />;
      case 'aprovacoes': return <FilaAprovacao />;
      case 'leads':      return <LeadsPanel />;
      case 'regras':     return <RulesPanel />;
      case 'consolidado': return <ConsolidadoTab />;
      case 'abtest':     return <ABTestTab />;
      case 'catalogo':   return <CatalogoTab />;
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
    <div className="min-h-full bg-gray-50">
      <div className="w-full px-5 py-5 space-y-4">

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

        {/* ─── Área de trabalho (ocupa toda a largura disponível) ─────────── */}
        <div className="mt-4">
          <div className="bg-white rounded-2xl border border-gray-100">
            <div className="p-5">
              {renderSecao()}
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
