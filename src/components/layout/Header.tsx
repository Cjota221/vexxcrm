'use client';

import { Search, Bell, User } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { getInitials } from '@/lib/utils';
import { ConnectionStatus } from './ConnectionStatus';

/**
 * Header do dashboard com busca, notificações e perfil.
 */
export function Header() {
  const { user } = useAuthStore();

  return (
    <header className="h-16 bg-white border-b border-surface-border flex items-center justify-between px-6">
      {/* Search */}
      <div className="relative w-80">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-txt-muted" />
        <input
          type="text"
          placeholder="Buscar clientes, conversas..."
          className="input pl-10 py-2 text-sm bg-surface-bg"
        />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Connection status */}
        <ConnectionStatus />

        {/* Notifications */}
        <button className="relative p-2 rounded-xl text-txt-muted hover:text-txt-primary hover:bg-slate-50 transition-colors">
          <Bell size={20} />
          {/* Badge de notificação */}
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            3
          </span>
        </button>

        {/* Profile */}
        <div className="flex items-center gap-3 pl-4 border-l border-surface-border">
          <div className="w-8 h-8 rounded-full bg-crm-primary flex items-center justify-center">
            <span className="text-white text-xs font-semibold">
              {user ? getInitials(user.name) : <User size={16} />}
            </span>
          </div>
          {user && (
            <div className="hidden md:block">
              <p className="text-sm font-medium text-txt-primary leading-tight">{user.name}</p>
              <p className="text-[11px] text-txt-muted leading-tight">{user.role}</p>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
