'use client';

import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Play,
  Pause,
  BarChart3,
  Send,
  CheckCircle,
  Eye,
  AlertTriangle,
  Clock,
  Users,
} from 'lucide-react';
import { useCampaign } from '@/hooks/useCampaigns';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function CampanhaDetalhePage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;
  const { data: campaign, isLoading } = useCampaign(campaignId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-surface-200 rounded w-48 animate-pulse" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-surface-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-20">
        <p className="text-txt-secondary">Campanha não encontrada</p>
        <Button variant="ghost" onClick={() => router.back()} className="mt-4">
          <ArrowLeft size={16} /> Voltar
        </Button>
      </div>
    );
  }

  const progress =
    campaign.total_destinatarios > 0
      ? (campaign.enviadas / campaign.total_destinatarios) * 100
      : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-surface-100 text-txt-secondary transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-txt-primary">{campaign.name}</h1>
          {campaign.description && (
            <p className="text-sm text-txt-secondary mt-1">{campaign.description}</p>
          )}
        </div>
        {campaign.status === 'draft' && (
          <Button variant="primary">
            <Play size={16} /> Iniciar
          </Button>
        )}
        {campaign.status === 'running' && (
          <Button variant="secondary">
            <Pause size={16} /> Pausar
          </Button>
        )}
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card padding="none">
          <div className="p-4 text-center">
            <Users size={20} className="mx-auto text-crm-primary mb-1" />
            <p className="text-lg font-bold text-txt-primary">{campaign.total_destinatarios}</p>
            <p className="text-xs text-txt-secondary">Destinatários</p>
          </div>
        </Card>
        <Card padding="none">
          <div className="p-4 text-center">
            <Send size={20} className="mx-auto text-blue-500 mb-1" />
            <p className="text-lg font-bold text-txt-primary">{campaign.enviadas}</p>
            <p className="text-xs text-txt-secondary">Enviadas</p>
          </div>
        </Card>
        <Card padding="none">
          <div className="p-4 text-center">
            <CheckCircle size={20} className="mx-auto text-green-500 mb-1" />
            <p className="text-lg font-bold text-txt-primary">{campaign.entregues}</p>
            <p className="text-xs text-txt-secondary">Entregues</p>
          </div>
        </Card>
        <Card padding="none">
          <div className="p-4 text-center">
            <Eye size={20} className="mx-auto text-purple-500 mb-1" />
            <p className="text-lg font-bold text-txt-primary">{campaign.lidas}</p>
            <p className="text-xs text-txt-secondary">Lidas</p>
          </div>
        </Card>
        <Card padding="none">
          <div className="p-4 text-center">
            <AlertTriangle size={20} className="mx-auto text-red-500 mb-1" />
            <p className="text-lg font-bold text-txt-primary">{campaign.falhas}</p>
            <p className="text-xs text-txt-secondary">Falhas</p>
          </div>
        </Card>
      </div>

      {/* Barra de progresso */}
      <Card>
        <CardHeader>
          <CardTitle>
            <BarChart3 size={16} /> Progresso
          </CardTitle>
        </CardHeader>
        <div className="px-6 pb-6">
          <div className="flex items-center justify-between text-sm text-txt-secondary mb-2">
            <span>{campaign.enviadas} de {campaign.total_destinatarios}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-3 bg-surface-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-crm-primary to-crm-secondary rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </Card>

      {/* Blocos da sequência */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Clock size={16} /> Sequência de Mensagens
          </CardTitle>
        </CardHeader>
        <div className="px-6 pb-6 space-y-3">
          {campaign.blocks.length === 0 ? (
            <p className="text-sm text-txt-secondary text-center py-6">
              Nenhum bloco adicionado
            </p>
          ) : (
            campaign.blocks.map((block, index) => (
              <div
                key={block.id}
                className="flex items-start gap-3 p-3 bg-surface-50 rounded-lg border border-surface-200"
              >
                <div className="w-7 h-7 rounded-full bg-crm-primary text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="neutral">{block.type}</Badge>
                    {block.delay_seconds && (
                      <span className="text-xs text-txt-secondary">
                        ⏱ {block.delay_seconds}s de delay
                      </span>
                    )}
                  </div>
                  {block.content && (
                    <p className="text-sm text-txt-primary">{block.content}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Info */}
      <Card>
        <div className="p-6 grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-txt-secondary">Tipo</p>
            <p className="font-medium text-txt-primary capitalize">{campaign.type}</p>
          </div>
          <div>
            <p className="text-txt-secondary">Criada em</p>
            <p className="font-medium text-txt-primary">{formatDate(campaign.created_at)}</p>
          </div>
          {campaign.started_at && (
            <div>
              <p className="text-txt-secondary">Iniciada em</p>
              <p className="font-medium text-txt-primary">{formatDate(campaign.started_at)}</p>
            </div>
          )}
          {campaign.completed_at && (
            <div>
              <p className="text-txt-secondary">Concluída em</p>
              <p className="font-medium text-txt-primary">{formatDate(campaign.completed_at)}</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
