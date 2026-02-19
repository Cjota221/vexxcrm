'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Megaphone,
  Users,
  FileText,
  Calendar,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  StopCircle,
  BarChart2,
  RefreshCw,
  Clock,
  TrendingUp,
  Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { KANBAN_COLUMN_CONFIG, KANBAN_COLUMNS_ORDER } from '@/lib/kanban-state-machine';
import type { KanbanColumn } from '@/types';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TIPOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type CampaignScheduleType = 'imediato' | 'agendado' | 'fila_inteligente';

interface CampaignDraft {
  nome: string;
  tags_kanban: KanbanColumn[];
  tags_cliente: string[];
  score_min?: number;
  template_id: string;
  agenda: CampaignScheduleType;
  data_agendamento?: string;
}

interface CampaignEstimate {
  total_destinatarios: number;
  estimativa_custo: string;
  estimativa_tempo: string;
  preview_contatos: Array<{ name: string; phone: string; tag: string }>;
  warnings: string[];
}

interface CampaignResult {
  entregues: number;
  erros: number;
  aberturas: number;
  respostas_24h: number;
  respostas_48h: number;
  respostas_72h: number;
  conversoes: number;
  custo_total: string;
  roi: string;
  status: 'running' | 'completed' | 'aborted';
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CONSTANTES DAS ETAPAS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const STEPS = [
  { id: 1, label: 'Nome',       icon: FileText },
  { id: 2, label: 'Filtros',    icon: Users },
  { id: 3, label: 'Template',   icon: FileText },
  { id: 4, label: 'Agenda',     icon: Calendar },
  { id: 5, label: 'Resumo',     icon: CheckCircle },
  { id: 6, label: 'Confirmação',icon: Send },
  { id: 7, label: 'Resultado',  icon: BarChart2 },
] as const;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   STEP 1 — NOME
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function StepNome({ draft, onChange }: { draft: CampaignDraft; onChange: (p: Partial<CampaignDraft>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-txt-primary block mb-1.5">Nome da campanha</label>
        <input
          autoFocus
          className="w-full text-sm px-3 py-2.5 border border-surface-200 rounded-xl outline-none focus:border-crm-primary transition-colors placeholder:text-txt-muted"
          placeholder="Ex: Reativação — Clientes Inativos 30d"
          value={draft.nome}
          onChange={e => onChange({ nome: e.target.value })}
        />
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   STEP 2 — FILTROS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function StepFiltros({
  draft,
  onChange,
  estimate,
  loadingEstimate,
}: {
  draft: CampaignDraft;
  onChange: (p: Partial<CampaignDraft>) => void;
  estimate: CampaignEstimate | null;
  loadingEstimate: boolean;
}) {
  const toggleKanban = (col: KanbanColumn) => {
    const current = draft.tags_kanban;
    const next = current.includes(col) ? current.filter(c => c !== col) : [...current, col];
    onChange({ tags_kanban: next });
  };

  return (
    <div className="space-y-4">
      {/* Filtro por coluna Kanban */}
      <div>
        <label className="text-xs font-semibold text-txt-primary block mb-2">Pipeline Kanban</label>
        <div className="grid grid-cols-2 gap-1.5">
          {KANBAN_COLUMNS_ORDER.map(col => {
            const config = KANBAN_COLUMN_CONFIG[col];
            const selected = draft.tags_kanban.includes(col);
            return (
              <button
                key={col}
                onClick={() => toggleKanban(col)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-medium transition-all text-left',
                  selected
                    ? 'border-crm-primary bg-crm-primary/5 text-crm-primary'
                    : 'border-surface-200 text-txt-secondary hover:border-surface-300'
                )}
              >
                <span>{config.icon}</span>
                <span className="truncate">{config.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Score mínimo da Anne */}
      <div>
        <label className="text-xs font-semibold text-txt-primary block mb-1.5">
          Score Anne mínimo: <span className="text-crm-primary">{((draft.score_min ?? 0) * 100).toFixed(0)}%</span>
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={draft.score_min ?? 0}
          onChange={e => onChange({ score_min: parseFloat(e.target.value) })}
          className="w-full accent-crm-primary"
        />
        <div className="flex justify-between text-[10px] text-txt-muted mt-0.5">
          <span>0% (todos)</span>
          <span>100%</span>
        </div>
      </div>

      {/* Estimativa de alcance */}
      <div className="px-3 py-2.5 bg-surface-50 rounded-xl border border-surface-200">
        {loadingEstimate ? (
          <div className="flex items-center gap-2">
            <Loader2 size={13} className="animate-spin text-crm-primary" />
            <span className="text-xs text-txt-muted">Calculando alcance...</span>
          </div>
        ) : estimate ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-txt-secondary">Destinatários estimados</span>
              <span className="text-sm font-bold text-txt-primary">{estimate.total_destinatarios.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-txt-secondary">Custo estimado</span>
              <span className="text-xs font-semibold text-txt-primary">{estimate.estimativa_custo}</span>
            </div>
            {estimate.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-1.5 mt-1.5 text-amber-700">
                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                <span className="text-[11px]">{w}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-txt-muted">Selecione filtros para ver o alcance estimado.</p>
        )}
      </div>

      {/* Preview de contatos */}
      {estimate?.preview_contatos && estimate.preview_contatos.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-1.5">Preview (5 aleatórios)</p>
          <div className="space-y-1">
            {estimate.preview_contatos.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] px-2 py-1 bg-surface-50 rounded-lg">
                <span className="font-medium text-txt-primary">{c.name}</span>
                <span className="text-txt-muted">{c.phone}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   STEP 3 — TEMPLATE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function StepTemplate({ draft, onChange }: { draft: CampaignDraft; onChange: (p: Partial<CampaignDraft>) => void }) {
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates-list'],
    queryFn: async () => {
      const res = await api.get<{ templates: Array<{ id: string; name: string; variables: string[] }> }>('/api/templates');
      return res.data?.templates ?? [];
    },
    staleTime: 60_000,
  });

  return (
    <div className="space-y-3">
      <label className="text-xs font-semibold text-txt-primary block">Selecionar Template</label>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 size={16} className="animate-spin text-txt-muted" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-6 text-txt-muted">
          <FileText size={24} className="mx-auto mb-2 opacity-40" />
          <p className="text-xs">Nenhum template cadastrado.</p>
          <p className="text-[11px] mt-1">Use [F2] para criar um template composto.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
          {templates.map(t => {
            const selected = draft.template_id === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onChange({ template_id: t.id })}
                className={cn(
                  'w-full text-left px-3 py-2.5 rounded-xl border transition-all',
                  selected
                    ? 'border-crm-primary bg-crm-primary/5'
                    : 'border-surface-200 hover:border-surface-300'
                )}
              >
                <p className="text-xs font-semibold text-txt-primary">{t.name}</p>
                {t.variables.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {t.variables.map(v => (
                      <span key={v} className="px-1 py-0.5 bg-crm-primary/10 text-crm-primary rounded text-[10px] font-mono">
                        {`{{${v}}}`}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   STEP 4 — AGENDA
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function StepAgenda({ draft, onChange }: { draft: CampaignDraft; onChange: (p: Partial<CampaignDraft>) => void }) {
  const options: Array<{ value: CampaignScheduleType; label: string; desc: string; icon: typeof Clock }> = [
    { value: 'imediato',          label: 'Imediato',          desc: 'Disparo começa agora',                          icon: Send },
    { value: 'agendado',          label: 'Agendar',           desc: 'Escolha data e hora',                           icon: Calendar },
    { value: 'fila_inteligente',  label: 'Fila Inteligente',  desc: 'Anne distribui nos melhores horários',          icon: TrendingUp },
  ];

  return (
    <div className="space-y-3">
      <label className="text-xs font-semibold text-txt-primary block">Quando disparar?</label>
      <div className="space-y-2">
        {options.map(opt => {
          const Icon = opt.icon;
          const selected = draft.agenda === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange({ agenda: opt.value })}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-3 rounded-xl border transition-all text-left',
                selected ? 'border-crm-primary bg-crm-primary/5' : 'border-surface-200 hover:border-surface-300'
              )}
            >
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                selected ? 'bg-crm-primary text-white' : 'bg-surface-100 text-txt-secondary'
              )}>
                <Icon size={15} />
              </div>
              <div>
                <p className="text-xs font-semibold text-txt-primary">{opt.label}</p>
                <p className="text-[11px] text-txt-muted">{opt.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {draft.agenda === 'agendado' && (
        <input
          type="datetime-local"
          className="w-full text-sm px-3 py-2 border border-surface-200 rounded-xl outline-none focus:border-crm-primary transition-colors"
          value={draft.data_agendamento ?? ''}
          onChange={e => onChange({ data_agendamento: e.target.value })}
        />
      )}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   STEP 5 — RESUMO
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function StepResumo({ draft, estimate }: { draft: CampaignDraft; estimate: CampaignEstimate | null }) {
  const rows = [
    { label: 'Campanha',        value: draft.nome || '—' },
    { label: 'Destinatários',   value: estimate?.total_destinatarios.toLocaleString() ?? '—' },
    { label: 'Template',        value: draft.template_id || '—' },
    { label: 'Agenda',          value: draft.agenda === 'imediato' ? 'Imediato' : draft.agenda === 'fila_inteligente' ? 'Fila Inteligente' : (draft.data_agendamento ?? '—') },
    { label: 'Custo estimado',  value: estimate?.estimativa_custo ?? '—' },
    { label: 'Tempo estimado',  value: estimate?.estimativa_tempo ?? '—' },
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-txt-primary">Revise antes de confirmar</p>
      <div className="divide-y divide-surface-100 border border-surface-200 rounded-xl overflow-hidden">
        {rows.map(row => (
          <div key={row.label} className="flex items-center justify-between px-3 py-2">
            <span className="text-[11px] text-txt-muted">{row.label}</span>
            <span className="text-xs font-medium text-txt-primary text-right max-w-[60%] truncate">{row.value}</span>
          </div>
        ))}
      </div>
      {estimate?.warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle size={12} className="text-amber-500 mt-0.5 shrink-0" />
          <span className="text-[11px] text-amber-700">{w}</span>
        </div>
      ))}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   STEP 7 — DASHBOARD DE RESULTADO
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function StepResultado({ campaignId }: { campaignId: string }) {
  const { data: result, isLoading } = useQuery({
    queryKey: ['campaign-result', campaignId],
    queryFn: async () => {
      const res = await api.get<CampaignResult>(`/api/v2/campanhas/${campaignId}/resultado`);
      return res.data;
    },
    refetchInterval: 30_000, // Polling 30s durante disparo ativo
    enabled: !!campaignId,
  });

  if (isLoading || !result) {
    return (
      <div className="flex items-center justify-center py-10 gap-2">
        <Loader2 size={16} className="animate-spin text-crm-primary" />
        <span className="text-xs text-txt-muted">Aguardando dados...</span>
      </div>
    );
  }

  const metrics = [
    { label: 'Entregues',    value: result.entregues,     color: 'text-emerald-600' },
    { label: 'Erros',        value: result.erros,         color: 'text-red-500' },
    { label: 'Aberturas',    value: result.aberturas,     color: 'text-blue-600' },
    { label: 'Respostas 24h',value: result.respostas_24h, color: 'text-indigo-600' },
    { label: 'Respostas 48h',value: result.respostas_48h, color: 'text-purple-600' },
    { label: 'Conversões',   value: result.conversoes,    color: 'text-amber-600' },
  ];

  return (
    <div className="space-y-3">
      {/* Status */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold',
        result.status === 'running'   ? 'bg-amber-50 text-amber-700' : '',
        result.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : '',
        result.status === 'aborted'   ? 'bg-gray-50 text-gray-600' : '',
      )}>
        {result.status === 'running'   && <><Loader2 size={12} className="animate-spin" /> Disparo em andamento</>}
        {result.status === 'completed' && <><CheckCircle size={12} /> Concluído</>}
        {result.status === 'aborted'   && <><StopCircle size={12} /> Abortado</>}
        <span className="ml-auto text-[10px] opacity-70">Atualiza a cada 30s</span>
      </div>

      {/* Grid de métricas */}
      <div className="grid grid-cols-2 gap-2">
        {metrics.map(m => (
          <div key={m.label} className="bg-surface-50 border border-surface-200 rounded-xl p-2.5">
            <p className="text-[10px] text-txt-muted">{m.label}</p>
            <p className={cn('text-lg font-bold', m.color)}>{m.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* ROI */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-crm-primary/5 border border-crm-primary/20 rounded-xl">
        <div>
          <p className="text-[11px] text-txt-muted">Custo total</p>
          <p className="text-xs font-bold text-txt-primary">{result.custo_total}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-txt-muted">ROI estimado</p>
          <p className="text-sm font-bold text-emerald-600">{result.roi}</p>
        </div>
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   COMPONENTE PRINCIPAL — EmbeddedCampaignPanel
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface EmbeddedCampaignPanelProps {
  onClose: () => void;
  /** Tag Kanban da conversa ativa para pré-filtrar */
  preselectedKanbanColumn?: KanbanColumn;
}

export function EmbeddedCampaignPanel({ onClose, preselectedKanbanColumn }: EmbeddedCampaignPanelProps) {
  const [step, setStep] = useState(1);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [abortCountdown, setAbortCountdown] = useState<number | null>(null);
  const abortTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [draft, setDraft] = useState<CampaignDraft>({
    nome: '',
    tags_kanban: preselectedKanbanColumn ? [preselectedKanbanColumn] : [],
    tags_cliente: [],
    template_id: '',
    agenda: 'imediato',
  });

  const updateDraft = useCallback((patch: Partial<CampaignDraft>) => {
    setDraft(prev => ({ ...prev, ...patch }));
  }, []);

  // Estimativa de alcance (quando step === 2)
  const { data: estimate, isFetching: loadingEstimate } = useQuery({
    queryKey: ['campaign-estimate', draft.tags_kanban, draft.score_min],
    queryFn: async () => {
      const res = await api.post<CampaignEstimate>('/api/v2/campanhas/estimate', {
        filtros: { tags_kanban: draft.tags_kanban, score_min: draft.score_min },
      });
      return res.data;
    },
    enabled: step === 2 && draft.tags_kanban.length > 0,
    staleTime: 30_000,
  });

  // Criar e disparar campanha
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ campanha_id: string }>('/api/v2/campanhas/criar', {
        nome: draft.nome,
        filtros: { tags_kanban: draft.tags_kanban, score_min: draft.score_min, tags: draft.tags_cliente },
        template_id: draft.template_id,
        agenda: draft.agenda,
        data_agendamento: draft.data_agendamento,
      });
      if (res.error) throw new Error(res.error);
      return res.data!.campanha_id;
    },
    onSuccess: (id) => {
      setCampaignId(id);
      setStep(7);
      // Iniciar countdown de abort (60s)
      setAbortCountdown(60);
      abortTimer.current = setInterval(() => {
        setAbortCountdown(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(abortTimer.current!);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    },
  });

  // Abort
  const abortMutation = useMutation({
    mutationFn: async () => {
      if (!campaignId) return;
      await api.post(`/api/v2/campanhas/${campaignId}/abort`, {});
    },
    onSuccess: () => {
      clearInterval(abortTimer.current!);
      setAbortCountdown(null);
    },
  });

  useEffect(() => {
    return () => {
      if (abortTimer.current) clearInterval(abortTimer.current);
    };
  }, []);

  // Validação por step
  const canAdvance = useCallback(() => {
    if (step === 1) return draft.nome.trim().length >= 3;
    if (step === 2) return draft.tags_kanban.length > 0;
    if (step === 3) return !!draft.template_id;
    if (step === 4) return draft.agenda !== 'agendado' || !!draft.data_agendamento;
    if (step === 5) return true;
    return false;
  }, [step, draft]);

  const handleNext = useCallback(() => {
    if (step === 6) {
      createMutation.mutate();
      return;
    }
    setStep(s => Math.min(s + 1, 7));
  }, [step, createMutation]);

  const handleBack = () => setStep(s => Math.max(s - 1, 1));

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl border-l border-surface-200 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-surface-200 shrink-0">
        <div className="flex items-center gap-2">
          <Megaphone size={16} className="text-crm-primary" />
          <span className="text-sm font-semibold text-txt-primary">Nova Campanha</span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-txt-muted hover:bg-surface-100 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0.5 px-4 py-2 border-b border-surface-200 shrink-0 overflow-x-auto">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isDone = step > s.id;
          const isCurrent = step === s.id;
          return (
            <div key={s.id} className="flex items-center gap-0.5">
              <div className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all whitespace-nowrap',
                isCurrent ? 'bg-crm-primary text-white' : isDone ? 'text-emerald-600' : 'text-txt-muted'
              )}>
                <Icon size={10} />
                {s.label}
              </div>
              {i < STEPS.length - 1 && (
                <ChevronRight size={10} className="text-surface-300 shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Conteúdo do step */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {step === 1 && <StepNome draft={draft} onChange={updateDraft} />}
        {step === 2 && <StepFiltros draft={draft} onChange={updateDraft} estimate={estimate ?? null} loadingEstimate={loadingEstimate} />}
        {step === 3 && <StepTemplate draft={draft} onChange={updateDraft} />}
        {step === 4 && <StepAgenda draft={draft} onChange={updateDraft} />}
        {step === 5 && <StepResumo draft={draft} estimate={estimate ?? null} />}
        {step === 6 && (
          <div className="text-center py-8 space-y-3">
            <div className="w-14 h-14 bg-crm-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Send size={24} className="text-crm-primary" />
            </div>
            <p className="text-sm font-semibold text-txt-primary">Tudo pronto!</p>
            <p className="text-xs text-txt-muted">
              Clique em <strong>Confirmar Disparo</strong> para iniciar. Você terá 60 segundos para cancelar.
            </p>
          </div>
        )}
        {step === 7 && campaignId && <StepResultado campaignId={campaignId} />}
      </div>

      {/* Footer com ações */}
      <div className="px-4 py-3 border-t border-surface-200 shrink-0 space-y-2">
        {/* Botão de abort (60s após confirmação) */}
        {step === 7 && abortCountdown !== null && (
          <button
            onClick={() => abortMutation.mutate()}
            disabled={abortMutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-2 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold hover:bg-red-100 transition-colors"
          >
            <StopCircle size={13} />
            Abortar disparo ({abortCountdown}s)
          </button>
        )}

        {/* Navegação */}
        {step < 7 && (
          <div className="flex gap-2">
            {step > 1 && (
              <button
                onClick={handleBack}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-surface-200 rounded-xl text-xs text-txt-secondary hover:bg-surface-50 transition-colors"
              >
                <ChevronLeft size={13} />
                Voltar
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={!canAdvance() || createMutation.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-crm-primary text-white rounded-xl text-xs font-semibold hover:bg-crm-primary/90 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? (
                <><Loader2 size={12} className="animate-spin" /> Criando...</>
              ) : step === 6 ? (
                <><Send size={12} /> Confirmar Disparo</>
              ) : (
                <>Próximo <ChevronRight size={13} /></>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
