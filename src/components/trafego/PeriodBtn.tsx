'use client';

import { cn } from '@/lib/utils';

export function PeriodBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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
