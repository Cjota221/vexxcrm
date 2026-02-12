'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  Play,
  Pause,
  BarChart3,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
} from 'lucide-react';
import { useCampaigns } from '@/hooks/useCampaigns';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { formatDate, debounce } from '@/lib/utils';
import type { Campaign, CampaignStatus } from '@/types';

const STATUS_MAP: Record<CampaignStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; icon: typeof Play }> = {
  draft: { label: 'Rascunho', variant: 'neutral', icon: FileText },
  scheduled: { label: 'Agendada', variant: 'info', icon: Clock },
  running: { label: 'Enviando', variant: 'warning', icon: Play },
  paused: { label: 'Pausada', variant: 'neutral', icon: Pause },
  completed: { label: 'Concluída', variant: 'success', icon: CheckCircle },
  failed: { label: 'Falhou', variant: 'danger', icon: XCircle },
};

export default function CampanhasPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const { data: campaigns = [], isLoading } = useCampaigns();

  const filtered = (campaigns as Campaign[]).filter(
    (c) => !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-txt-primary">Campanhas</h1>
          <p className="text-sm text-txt-secondary mt-1">
            Disparo de mensagens em massa com sequências inteligentes
          </p>
        </div>
        <Button variant="primary">
          <Plus size={16} /> Nova Campanha
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-crm-primary/10 flex items-center justify-center">
              <Send size={20} className="text-crm-primary" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Total</p>
              <p className="text-lg font-bold text-txt-primary">{(campaigns as Campaign[]).length}</p>
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
              <p className="text-lg font-bold text-txt-primary">
                {(campaigns as Campaign[]).filter((c) => c.status === 'running').length}
              </p>
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
              <p className="text-lg font-bold text-txt-primary">
                {(campaigns as Campaign[]).filter((c) => c.status === 'completed').length}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <BarChart3 size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Taxa de Leitura</p>
              <p className="text-lg font-bold text-txt-primary">73%</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <div className="p-4">
          <Input
            placeholder="Buscar campanha..."
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </Card>

      {/* Lista de campanhas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <div className="p-4 space-y-3 animate-pulse">
                  <div className="h-5 bg-surface-200 rounded w-3/4" />
                  <div className="h-3 bg-surface-200 rounded w-1/2" />
                  <div className="h-8 bg-surface-200 rounded w-full mt-4" />
                </div>
              </Card>
            ))
          : filtered.map((campaign) => {
              const config = STATUS_MAP[campaign.status];
              const Icon = config.icon;
              const totalSent = campaign.enviadas;
              const totalTarget = campaign.total_destinatarios;
              const progress = totalTarget > 0 ? (totalSent / totalTarget) * 100 : 0;

              return (
                <div
                  key={campaign.id}
                  onClick={() => router.push(`/campanhas/${campaign.id}`)}
                  className="cursor-pointer"
                >
                <Card
                  hover
                >
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-txt-primary truncate">
                        {campaign.name}
                      </h3>
                      <Badge variant={config.variant}>
                        <Icon size={10} /> {config.label}
                      </Badge>
                    </div>

                    {campaign.description && (
                      <p className="text-xs text-txt-secondary line-clamp-2">
                        {campaign.description}
                      </p>
                    )}

                    {/* Progress bar */}
                    <div>
                      <div className="flex items-center justify-between text-xs text-txt-secondary mb-1">
                        <span>{totalSent} / {totalTarget} enviadas</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <div className="h-1.5 bg-surface-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-crm-primary rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-txt-muted pt-2 border-t border-surface-100">
                      <span>{campaign.blocks.length} blocos</span>
                      <span>{formatDate(campaign.created_at)}</span>
                    </div>
                  </div>
                </Card>
                </div>
              );
            })}
      </div>

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-12">
          <Send size={32} className="mx-auto text-txt-secondary mb-3" />
          <p className="text-txt-secondary">Nenhuma campanha encontrada</p>
        </div>
      )}
    </div>
  );
}
