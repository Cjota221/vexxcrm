import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

/**
 * Input reutilizável com label, erro e hint.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="label">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn('input', error && 'input-error', className)}
          {...props}
        />
        {error && (
          <p className="text-xs text-red-600 mt-1">{error}</p>
        )}
        {hint && !error && (
          <p className="text-xs text-slate-400 mt-1">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
