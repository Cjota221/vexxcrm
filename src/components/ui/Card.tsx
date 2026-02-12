import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  className?: string;
  children: React.ReactNode;
  hover?: boolean;
  padding?: 'sm' | 'md' | 'lg' | 'none';
}

/**
 * Card com bordas arredondadas e sombra sutil.
 */
export function Card({ className, children, hover = false, padding = 'md' }: CardProps) {
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  return (
    <div
      className={cn(
        'bg-white rounded-[16px] border border-surface-border',
        'shadow-card',
        hover && 'transition-shadow duration-200 hover:shadow-card-hover',
        paddingClasses[padding],
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Card Header.
 */
export function CardHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex items-center justify-between mb-4', className)}>
      {children}
    </div>
  );
}

/**
 * Card Title.
 */
export function CardTitle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <h3 className={cn('text-lg font-semibold text-txt-primary', className)}>
      {children}
    </h3>
  );
}
