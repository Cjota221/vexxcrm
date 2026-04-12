'use client';

import { cn } from '@/lib/utils';

export function EffectiveStatusBadge({ status }: { status?: string }) {
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
