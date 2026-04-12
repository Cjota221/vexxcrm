'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export function MetricCard({
  label, value, sub, badge, badgeColor,
}: {
  label: string;
  value: string;
  sub?: string;
  badge?: string;
  badgeColor?: 'green' | 'yellow' | 'red' | 'gray';
  icon?: React.ReactNode;
}) {
  const badgeStyles = {
    green:  'bg-green-500/20 text-green-400 border border-green-500/30',
    yellow: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    red:    'bg-red-500/20 text-red-400 border border-red-500/30',
    gray:   'bg-gray-100 text-gray-600 border border-gray-200',
  };
  const valueColor =
    badgeColor === 'red' ? 'text-red-500' :
    badgeColor === 'yellow' ? 'text-amber-500' :
    badgeColor === 'green' ? 'text-emerald-600' :
    'text-gray-900';
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100">
      <div className="flex items-start justify-between mb-3">
        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</div>
        {badge && (
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-md', badgeStyles[badgeColor || 'gray'])}>
            {badge}
          </span>
        )}
      </div>
      <div className={cn('text-3xl font-bold', valueColor)}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1.5">{sub}</div>}
    </div>
  );
}
