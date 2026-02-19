'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  BarChart3,
  Send,
  CheckCircle,
  Eye,
  AlertTriangle,
  Clock,
  Users,
  Loader2,
  Image,
  Video,
  Mic,
  Type,
  ExternalLink,
  Zap,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface CampanhaDetalhe {
  id: string;
  name: string;
  description?: string;
  type: string;
  status: string;
  status_detalhe?: string;
  destinatarios: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  reply_count: number;
  blocos_snapshot?: BlocoSnapshot[];
  messages?: BlocoSnapshot[];
  config_antiban?: Record<string, number>;
  origem?: string;
  origem_grupo_nome?: string;
  tipo_destinatario?: string;
  cool_off_ate?: string;
  scheduled_at?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

interface BlocoSnapshot {
  id: string;
  tipo: string;
  ordem: number;
  conteudo: {
    url?: string;
    texto_raw?: string;
    texto_formatado?: string;
    texto_botao?: string;
    url_destino?: string;
  };
}

interface Metricas {
  total: number;
  pendente: number;
  enviado: number;
  erro: number;
  cancelado: number;
}

const STATUS_MAP: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; cor: string }> = {
  draft:     { label: 'Rascunho',  variant: 'neutral',  cor: 'text-gray-500'   },
  scheduled: { label: 'Agendada',  variant: 'info',     cor: 'text-blue-500'   },
  running:   { label: 'Enviando',  variant: 'warning',  cor: 'text-yellow-600' },
  paused:    { label: 'Pausada',   variant: 'neutral',  cor: 'text-gray-500'   },
  completed: { label: 'Concluída', variant: 'success',  cor: 'text-green-600'  },
  cancelled: { label: 'Cancelada', variant: 'danger',   cor: 'text-red-500'    },
};

const BLOCO_ICON: Record<string, React.ReactNode> = {
  texto:  <Type size={14} />,
  imagem: <Image size={14} />,
  video:  <Video size={14} />,
  audio:  <Mic size={14} />,
  cta:    <ExternalLink size={14} />,
};

export default function CampanhaDetalhePage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const [campanha, setCampanha] = useState<CampanhaDetalhe | null>(null);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [dispatchLog, setDispatchLog] = useState<string[]>([]);
  const [dispatching, setDispatching] = useState(false);
  const dispatchAbortRef = useRef(false);

  const addLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString('pt-BR');
    setDispatchLog(prev => [...prev.slice(-50), `[${ts}] ${msg}`]);
  };

  const fetchCampanha = useCallback(async () => {
    const { data, error } = await api.get<{ campanha: CampanhaDetalhe; metricas: Metricas }>(
      `/api/v2/campanhas/${campaignId}`
    );
    if (!error && data) {
      setCampanha(data.campanha);
      setMetricas(data.metricas);
    }
    setIsLoading(false);
  }, [campaignId]);

  useEffect(() => { fetchCampanha(); }, [fetchCampanha]);

  // ─── Dispatch Loop (orquestra envios com delay anti-ban) ───────────────────
  // Quando a campanha está "running", faz polling no /dispatch-batch
  // com delay humanizado entre chamadas para simular anti-ban.
  useEffect(() => {
    if (campanha?.status !== 'running') {
      setDispatching(false);
      return;
    }
    if (dispatching) return; // já rodando

    let cancelled = false;
    dispatchAbortRef.current = false;
    setDispatching(true);

    const runLoop = async () => {
      addLog('🚀 Iniciando disparo automático...');

      while (!cancelled && !dispatchAbortRef.current) {
        try {
          const { data, error } = await api.post<{
            enviados: number;
            falhas: number;
            restantes: number;
            concluida: boolean;
            elapsed_ms: number;
          }>(`/api/v2/campanhas/${campaignId}/dispatch-batch`, { batch_size: 3 });

          if (error) {
            addLog(`❌ Erro no batch: ${error}`);
            // Espera 30s e tenta de novo
            await new Promise(r => setTimeout(r, 30_000));
            continue;
          }

          if (!data) break;

          addLog(`✅ Batch: ${data.enviados} enviados, ${data.falhas} falhas — ${data.restantes} restantes (${data.elapsed_ms}ms)`);

          // Atualizar dados da campanha
          await fetchCampanha();

          if (data.concluida) {
            addLog('🎉 Campanha concluída! Todos os envios foram processados.');
            break;
          }

          if (data.restantes === 0) break;

          // Delay anti-ban humanizado: 15-45s entre batches
          const delay = 15_000 + Math.random() * 30_000;
          addLog(`⏳ Aguardando ${Math.round(delay / 1000)}s (anti-ban)...`);
          await new Promise(r => setTimeout(r, delay));

        } catch (err) {
          addLog(`❌ Erro inesperado: ${err}`);
          await new Promise(r => setTimeout(r, 10_000));
        }
      }

      setDispatching(false);
    };

    runLoop();

    return () => {
      cancelled = true;
      dispatchAbortRef.current = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campanha?.status, campaignId]);

  const handleAction = async (action: string) => {
    setAtualizando(true);
    if (action === 'iniciar') {
      await api.post(`/api/v2/campanhas/${campaignId}/iniciar`, {});
    } else if (action === 'pausar') {
      await api.patch(`/api/v2/campanhas/${campaignId}/pausar`, {});
    } else if (action === 'retomar') {
      await api.patch(`/api/v2/campanhas/${campaignId}/retomar`, {});
    } else if (action === 'cancelar') {
      if (!confirm('Cancelar campanha? Esta ação não pode ser desfeita.')) {
        setAtualizando(false);
        return;
      }
      await api.delete(`/api/v2/campanhas/${campaignId}/cancelar`);
    }
    await fetchCampanha();
    setAtualizando(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-crm-primary" />
      </div>
    );
  }

  if (!campanha) {
    return (
      <div className="text-center py-20">
        <p className="text-txt-secondary">Campanha não encontrada</p>
        <Button variant="ghost" onClick={() => router.back()} className="mt-4">
          <ArrowLeft size={16} /> Voltar
        </Button>
      </div>
    );
  }

  const statusInfo = STATUS_MAP[campanha.status] ?? STATUS_MAP.draft;
  const blocos: BlocoSnapshot[] = campanha.blocos_snapshot ?? campanha.messages ?? [];
  const totalDest = campanha.destinatarios ?? metricas?.total ?? 0;
  const enviadas = campanha.sent_count ?? metricas?.enviado ?? 0;
  const falhas = campanha.failed_count ?? metricas?.erro ?? 0;
  const pendentes = metricas?.pendente ?? 0;
  const progress = totalDest > 0 ? Math.min(100, Math.round((enviadas / totalDest) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/campanhas')}
          className="p-2 rounded-lg hover:bg-surface-100 text-txt-secondary transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-txt-primary">{campanha.name}</h1>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
          {campanha.status_detalhe && campanha.status_detalhe !== 'enviando' && (
            <p className="text-sm text-yellow-600 mt-1">⏳ {campanha.status_detalhe}</p>
          )}
          {campanha.description && (
            <p className="text-sm text-txt-secondary mt-1">{campanha.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {atualizando && <Loader2 size={16} className="animate-spin" />}
          {campanha.status === 'draft' && (
            <Button variant="primary" onClick={() => handleAction('iniciar')} disabled={atualizando}>
              <Play size={16} /> Disparar
            </Button>
          )}
          {campanha.status === 'running' && (
            <Button variant="secondary" onClick={() => handleAction('pausar')} disabled={atualizando}>
              <Pause size={16} /> Pausar
            </Button>
          )}
          {campanha.status === 'paused' && (
            <Button variant="primary" onClick={() => handleAction('retomar')} disabled={atualizando}>
              <Play size={16} /> Retomar
            </Button>
          )}
          {['running', 'paused', 'scheduled', 'draft'].includes(campanha.status) && (
            <Button variant="ghost" onClick={() => handleAction('cancelar')} disabled={atualizando} className="text-red-500 hover:bg-red-50">
              <Square size={16} /> Cancelar
            </Button>
          )}
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <div className="p-4 text-center">
            <Users size={20} className="mx-auto text-crm-primary mb-1" />
            <p className="text-lg font-bold text-txt-primary">{totalDest.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-txt-secondary">Destinatários</p>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <Send size={20} className="mx-auto text-blue-500 mb-1" />
            <p className="text-lg font-bold text-txt-primary">{enviadas.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-txt-secondary">Enviadas</p>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <Clock size={20} className="mx-auto text-yellow-500 mb-1" />
            <p className="text-lg font-bold text-txt-primary">{pendentes.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-txt-secondary">Pendentes</p>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <CheckCircle size={20} className="mx-auto text-green-500 mb-1" />
            <p className="text-lg font-bold text-txt-primary">{(campanha.delivered_count ?? 0).toLocaleString('pt-BR')}</p>
            <p className="text-xs text-txt-secondary">Entregues</p>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <AlertTriangle size={20} className="mx-auto text-red-500 mb-1" />
            <p className="text-lg font-bold text-txt-primary">{falhas.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-txt-secondary">Falhas</p>
          </div>
        </Card>
      </div>

      {/* Barra de progresso */}
      <Card>
        <CardHeader>
          <CardTitle>
            <BarChart3 size={16} /> Progresso do Disparo
          </CardTitle>
        </CardHeader>
        <div className="px-6 pb-6">
          <div className="flex items-center justify-between text-sm text-txt-secondary mb-2">
            <span>{enviadas.toLocaleString('pt-BR')} de {totalDest.toLocaleString('pt-BR')}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-3 bg-surface-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-crm-primary to-crm-secondary rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          {falhas > 0 && (
            <p className="text-xs text-red-500 mt-2">⚠ {falhas} falha(s) — taxa de erro: {totalDest > 0 ? Math.round((falhas / totalDest) * 100) : 0}%</p>
          )}
        </div>
      </Card>

      {/* Log de disparo (só aparece quando running ou há logs) */}
      {(campanha.status === 'running' || dispatchLog.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Zap size={16} /> Log de Disparo
              {dispatching && <Loader2 size={14} className="animate-spin ml-2 inline" />}
            </CardTitle>
          </CardHeader>
          <div className="px-6 pb-6">
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 max-h-48 overflow-y-auto font-mono text-xs space-y-0.5">
              {dispatchLog.length === 0 ? (
                <p className="text-gray-500">Aguardando início do disparo...</p>
              ) : (
                dispatchLog.map((log, i) => <p key={i}>{log}</p>)
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Blocos da campanha */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Clock size={16} /> Blocos de Conteúdo
          </CardTitle>
        </CardHeader>
        <div className="px-6 pb-6 space-y-3">
          {blocos.length === 0 ? (
            <p className="text-sm text-txt-secondary text-center py-6">
              Nenhum bloco encontrado
            </p>
          ) : (
            [...blocos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map((bloco, index) => (
              <div
                key={bloco.id ?? index}
                className="flex items-start gap-3 p-3 bg-surface-50 rounded-lg border border-surface-200"
              >
                <div className="w-7 h-7 rounded-full bg-crm-primary text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {BLOCO_ICON[bloco.tipo] ?? <Type size={14} />}
                    <Badge variant="neutral">{bloco.tipo}</Badge>
                  </div>
                  {bloco.conteudo?.texto_raw && (
                    <p className="text-sm text-txt-primary whitespace-pre-wrap">{bloco.conteudo.texto_raw}</p>
                  )}
                  {bloco.conteudo?.url && bloco.tipo === 'imagem' && (
                    <img src={bloco.conteudo.url} alt="Criativo" className="mt-2 rounded-lg max-h-40 object-cover" />
                  )}
                  {bloco.conteudo?.url && bloco.tipo === 'video' && (
                    <video src={bloco.conteudo.url} controls className="mt-2 rounded-lg max-h-40" />
                  )}
                  {bloco.conteudo?.url && bloco.tipo === 'audio' && (
                    <audio src={bloco.conteudo.url} controls className="mt-2" />
                  )}
                  {bloco.conteudo?.texto_botao && (
                    <p className="text-xs text-blue-600 mt-1">🔗 {bloco.conteudo.texto_botao} → {bloco.conteudo.url_destino}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Info geral */}
      <Card>
        <div className="p-6 grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-txt-secondary">Tipo</p>
            <p className="font-medium text-txt-primary capitalize">{campanha.type}</p>
          </div>
          <div>
            <p className="text-txt-secondary">Modo</p>
            <p className="font-medium text-txt-primary capitalize">{campanha.origem ?? campanha.tipo_destinatario ?? '-'}</p>
          </div>
          <div>
            <p className="text-txt-secondary">Criada em</p>
            <p className="font-medium text-txt-primary">{formatDate(campanha.created_at)}</p>
          </div>
          {campanha.started_at && (
            <div>
              <p className="text-txt-secondary">Iniciada em</p>
              <p className="font-medium text-txt-primary">{formatDate(campanha.started_at)}</p>
            </div>
          )}
          {campanha.completed_at && (
            <div>
              <p className="text-txt-secondary">Concluída em</p>
              <p className="font-medium text-txt-primary">{formatDate(campanha.completed_at)}</p>
            </div>
          )}
          {campanha.scheduled_at && campanha.status === 'scheduled' && (
            <div>
              <p className="text-txt-secondary">Agendada para</p>
              <p className="font-medium text-blue-600">{formatDate(campanha.scheduled_at)}</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
