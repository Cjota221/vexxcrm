'use client';

import { cn } from '@/lib/utils';

type CampaignHealth = 'great' | 'ok' | 'bad' | 'paused';

export function HealthBadge({ health }: { health: CampaignHealth }) {
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
