'use client';

import { useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore, type Toast as ToastType } from '@/store/ui';

/**
 * Container de toasts (notificações).
 */
export function ToastContainer() {
  const { toasts, removeToast } = useUIStore();

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastType;
  onDismiss: (id: string) => void;
}) {
  const { id, type, title, message, duration = 5000 } = toast;

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), duration);
    return () => clearTimeout(timer);
  }, [id, duration, onDismiss]);

  const icons = {
    success: <CheckCircle size={18} className="text-emerald-500" />,
    error: <AlertCircle size={18} className="text-red-500" />,
    warning: <AlertTriangle size={18} className="text-amber-500" />,
    info: <Info size={18} className="text-sky-500" />,
  };

  const borderColors = {
    success: 'border-l-emerald-500',
    error: 'border-l-red-500',
    warning: 'border-l-amber-500',
    info: 'border-l-sky-500',
  };

  return (
    <div
      className={cn(
        'bg-white rounded-xl shadow-dropdown border border-surface-border border-l-4 p-4 animate-slide-up',
        borderColors[type]
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">{icons[type]}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-txt-primary">{title}</p>
          {message && (
            <p className="text-xs text-txt-secondary mt-0.5">{message}</p>
          )}
        </div>
        <button
          onClick={() => onDismiss(id)}
          className="flex-shrink-0 p-1 rounded text-txt-muted hover:text-txt-primary transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
