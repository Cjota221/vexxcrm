import React from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}

/**
 * Badge para status e labels.
 */
export function Badge({ variant = 'neutral', className, children }: BadgeProps) {
  const variantClasses: Record<BadgeVariant, string> = {
    success: 'badge-success',
    warning: 'badge-warning',
    danger: 'badge-danger',
    info: 'badge-info',
    neutral: 'badge-neutral',
  };

  return (
    <span className={cn('badge', variantClasses[variant], className)}>
      {children}
    </span>
  );
}
