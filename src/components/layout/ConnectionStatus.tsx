'use client';

import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConnectionStore } from '@/store/connection';

/**
 * Indicador visual de status da conexão WhatsApp.
 */
export function ConnectionStatus() {
  const { whatsappStatus } = useConnectionStore();

  const config = {
    connected: {
      icon: <Wifi size={14} />,
      label: 'Conectado',
      color: 'text-emerald-600 bg-emerald-50',
      dot: 'bg-emerald-500',
    },
    connecting: {
      icon: <Loader2 size={14} className="animate-spin" />,
      label: 'Conectando...',
      color: 'text-amber-600 bg-amber-50',
      dot: 'bg-amber-500',
    },
    disconnected: {
      icon: <WifiOff size={14} />,
      label: 'Desconectado',
      color: 'text-red-600 bg-red-50',
      dot: 'bg-red-500',
    },
    unknown: {
      icon: <WifiOff size={14} />,
      label: 'Verificando...',
      color: 'text-slate-500 bg-slate-50',
      dot: 'bg-slate-400',
    },
  };

  const current = config[whatsappStatus];

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
        current.color
      )}
    >
      <span className={cn('w-2 h-2 rounded-full', current.dot)} />
      {current.icon}
      <span className="hidden sm:inline">{current.label}</span>
    </div>
  );
}
