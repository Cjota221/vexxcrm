'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Plus, Search, Play, Pause, Square, BarChart3,
  Send, Clock, CheckCircle, XCircle, FileText,
  TrendingUp, Users, Loader2, RefreshCw,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { formatDate } from '@/lib/utils';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';

interface CampanhaCard {
  id: string;
  name: string;
  status: CampaignStatus;
  status_detalhe?: string;
  destinatarios: number;
  sent_count: number;
  failed_count: number;
  tipo_destinatario?: string;
  origem?: string;
  created_at: string;
  scheduled_at?: string;
  cool_off_ate?: string;
}

// ─── Mapa de status ───────────────────────────────────────────────────────────

const STATUS_MAP: Record<CampaignStatus, {
  label: string;
  variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
}> = {
  draft:     { label: 'Rascunho',  variant: 'neutral',  icon: FileText    },
  scheduled: { label: 'Agendada',  variant: 'info',     icon: Clock       },
  running:   { label: 'Enviando',  variant: 'warning',  icon: Play        },
  paused:    { label: 'Pausada',   variant: 'neutral',  icon: Pause       },
  completed: { label: 'Concluída', variant: 'success',  icon: CheckCircle },
  cancelled: { label: 'Cancelada', variant: 'danger',   icon: XCircle     },
};

// ─── Hook campanhas v2 ────────────────────────────────────────────────────────

function useCampanhasV2(statusFilter?: string) {
  const [campanhas, setCampanhas] = useState<CampanhaCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCampanhas = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/v2/campanhas?${params}`);
      if (!res.ok) throw new Error('Falha ao carregar campanhas');
      const json = await res.json();
      setCampanhas(json.campanhas ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchCampanhas(); }, [fetchCampanhas]);

  useEffect(() => {
    const temAtiva = campanhas.some(c => c.status === 'running');
    if (!temAtiva) return;
    const interval = setInterval(fetchCampanhas, 10_000);
    return () => clearInterval(interval);
  }, [campanhas, fetchCampanhas]);

  return { campanhas, isLoading, error, refetch: fetchCampanhas };
}

// ─── Ações ────────────────────────────────────────────────────────────────────

async function pausarCampanha(id: string) {
  return (await fetch(`/api/v2/campanhas/${id}/pausar`, { method: 'PATCH' })).ok;
}
async function retomarCampanha(id: string) {
  return (await fetch(`/api/v2/campanhas/${id}/retomar`, { method: 'PATCH' })).ok;
}
async function cancelarCampanha(id: string) {
  if (!confirm('Cancelar campanha? Esta ação não pode ser desfeita.')) return false;
  return (await fetch(`/api/v2/campanhas/${id}/cancelar`, { method: 'DELETE' })).ok;
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-txt-secondary mb-1">
        <span>{value.toLocaleString('pt-BR')} / {max.toLocaleString('pt-BR')}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-surface-200 rounded-full overflow-hidden">
        <div className="h-full bg-crm-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── CampanhaCard ─────────────────────────────────────────────────────────────

function CampanhaCardItem({ campanha, onAction }: { campanha: CampanhaCard; onAction: () => void }) {
  const router = useRouter();
  const config = STATUS_MAP[campanha.status] ?? STATUS_MAP.draft;
  const Icon = config.icon;
  const [atualizando, setAtualizando] = useState(false);

  const handleAction = async (fn: () => Promise<boolean>, e: React.MouseEvent) => {
    e.stopPropagation();
    setAtualizando(true);
    await fn();
    setAtualizando(false);
    onAction();
  };

  const taxaErro = (campanha.sent_count + campanha.failed_count) > 0
    ? Math.round((campanha.failed_count / (campanha.sent_count + campanha.failed_count)) * 100)
    : 0;

  return (
    <Card hover onClick={() => router.push(`/campanhas/${campanha.id}`)}>
      <div className="p-4 space-y-3 cursor-pointer">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-txt-primary line-clamp-2 flex-1">{campanha.name}</h3>
          <Badge variant={config.variant} className="flex-shrink-0">
            <Icon size={10} className="mr-1" /> {config.label}
          </Badge>
        </div>

        {campanha.status_detalhe && campanha.status_detalhe !== 'enviando' && (
          <p className="text-xs text-yellow-600 bg-yellow-50 rounded px-2 py-1">⏳ {campanha.status_detalhe}</p>
        )}

        <ProgressBar value={campanha.sent_count} max={campanha.destinatarios} />

        <div className="flex items-center gap-3 text-xs text-txt-secondary">
          <span className="flex items-center gap-1"><Users size={11} /> {(campanha.destinatarios ?? 0).toLocaleString('pt-BR')} dest.</span>
          {taxaErro > 0 && <span className="flex items-center gap-1 text-red-500"><XCircle size={11} /> {taxaErro}% erros</span>}
          {campanha.scheduled_at && campanha.status === 'scheduled' && (
            <span className="flex items-center gap-1 text-blue-600"><Clock size={11} /> {formatDate(campanha.scheduled_at)}</span>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-surface-100">
          <span className="text-xs text-txt-muted">{formatDate(campanha.created_at)}</span>
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            {atualizando && <Loader2 size={14} className="animate-spin text-txt-secondary" />}
            {campanha.status === 'running' && (
              <button onClick={e => handleAction(() => pausarCampanha(campanha.id), e)} className="p-1 rounded hover:bg-yellow-50 text-yellow-600" title="Pausar"><Pause size={14} /></button>
            )}
            {campanha.status === 'paused' && (
              <button onClick={e => handleAction(() => retomarCampanha(campanha.id), e)} className="p-1 rounded hover:bg-green-50 text-green-600" title="Retomar"><Play size={14} /></button>
            )}
            {['running', 'paused', 'scheduled'].includes(campanha.status) && (
              <button onClick={e => handleAction(() => cancelarCampanha(campanha.id), e)} className="p-1 rounded hover:bg-red-50 text-red-500" title="Cancelar"><Square size={14} /></button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function CampanhasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const s = searchParams.get('status');
    if (s) setStatusFilter(s);
  }, [searchParams]);

  const { campanhas, isLoading, error, refetch } = useCampanhasV2(statusFilter || undefined);
  const temAtiva = campanhas.some(c => c.status === 'running');
  const filtradas = campanhas.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()));

  const total = campanhas.length;
  const ativas = campanhas.filter(c => c.status === 'running').length;
  const concluidas = campanhas.filter(c => c.status === 'completed').length;
  const totalEnviadas = campanhas.reduce((acc, c) => acc + (c.sent_count ?? 0), 0);
  const totalFalhas = campanhas.reduce((acc, c) => acc + (c.failed_count ?? 0), 0);
  const taxaErroGeral = totalEnviadas > 0 ? Math.round((totalFalhas / totalEnviadas) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-txt-primary">Campanhas</h1>
          <p className="text-sm text-txt-secondary mt-1">
            Disparo humanizado com anti-ban e blocos compostos
            {temAtiva && (
              <span className="ml-2 inline-flex items-center gap-1 text-yellow-600">
                <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                Atualizando a cada 10s
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={refetch}><RefreshCw size={15} /></Button>
          <Button variant="primary" onClick={() => router.push('/campanhas/nova')}>
            <Plus size={16} /> Nova Campanha
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-crm-primary/10 flex items-center justify-center">
              <Send size={20} className="text-crm-primary" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Total</p>
              <p className="text-xl font-bold text-txt-primary">{total}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
              <Play size={20} className="text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Ativas</p>
              <p className="text-xl font-bold text-txt-primary">{ativas}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Concluídas</p>
              <p className="text-xl font-bold text-txt-primary">{concluidas}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${taxaErroGeral > 5 ? 'bg-red-500/10' : 'bg-blue-500/10'} flex items-center justify-center`}>
              <TrendingUp size={20} className={taxaErroGeral > 5 ? 'text-red-500' : 'text-blue-600'} />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Taxa de Erro</p>
              <p className={`text-xl font-bold ${taxaErroGeral > 5 ? 'text-red-500' : 'text-txt-primary'}`}>{taxaErroGeral}%</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
          <Input className="pl-9" placeholder="Buscar campanha..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-surface-300 rounded-lg bg-white text-txt-primary focus:outline-none focus:ring-2 focus:ring-crm-primary/40"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_MAP).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</div>}

      {/* Lista */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <div className="p-4 space-y-3 animate-pulse">
                  <div className="h-5 bg-surface-200 rounded w-3/4" />
                  <div className="h-3 bg-surface-200 rounded w-1/2" />
                  <div className="h-2 bg-surface-200 rounded w-full mt-4" />
                  <div className="h-8 bg-surface-200 rounded w-full" />
                </div>
              </Card>
            ))
          : filtradas.map(c => (
              <CampanhaCardItem key={c.id} campanha={c} onAction={refetch} />
            ))
        }
      </div>

      {!isLoading && filtradas.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-crm-primary/10 flex items-center justify-center mx-auto mb-4">
            <Send size={28} className="text-crm-primary" />
          </div>
          <h3 className="text-base font-semibold text-txt-primary mb-1">
            {search || statusFilter ? 'Nenhuma campanha encontrada' : 'Ainda sem campanhas'}
          </h3>
          <p className="text-sm text-txt-secondary mb-6">
            {search || statusFilter ? 'Tente outro filtro ou termo de busca' : 'Crie sua primeira campanha e alcance seus clientes de forma humanizada'}
          </p>
          {!search && !statusFilter && (
            <Button variant="primary" onClick={() => router.push('/campanhas/nova')}>
              <Plus size={16} /> Criar Campanha
            </Button>
          )}
        </div>
      )}
    </div>
  );
}