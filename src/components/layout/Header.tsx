'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, Camera, Trash2, LogOut, Loader2, Wifi, WifiOff, ShoppingCart, Package, GitBranch, Bot, Zap, Menu } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useConnectionStore } from '@/store/connection';
import { useUIStore } from '@/store/ui';
import { supabase } from '@/lib/supabase';
import { getInitials } from '@/lib/utils';
import { KanbanModal } from '@/components/crm/KanbanModal';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Link from 'next/link';

/**
 * Header limpo — dot de conexão + notificações realtime + perfil.
 * Notificações: Supabase Realtime escuta INSERT em orders (tenant filtrado).
 */
export function Header() {
  const { user, accessToken, tenant, updateUser, clearSession } = useAuthStore();
  const { whatsappStatus } = useConnectionStore();
  const { toggleMobileSidebar } = useUIStore();
  const [showMenu, setShowMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Kanban Modal ───────────────────────────────────────────────
  const [showKanban, setShowKanban] = useState(false);

  // Atalho F4 para abrir/fechar Kanban
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F4') {
        e.preventDefault();
        setShowKanban(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Stats da Anne (carrinhos recuperados hoje) ─────────────
  interface AnneStats {
    carts_recovered_today: number;
    suggestions_pending: number;
    automations_fired_today: number;
  }
  const { data: anneStats } = useQuery<AnneStats>({
    queryKey: ['anne-stats'],
    queryFn: async (): Promise<AnneStats> => {
      const res = await api.get<AnneStats>('/api/v2/anne/stats');
      return res.data;
    },
    staleTime: 60_000,
    enabled: !!tenant?.id,
    refetchInterval: 3 * 60_000,
  });

  // ── Notificações Realtime ──────────────────────────────────
  const [notifCount, setNotifCount] = useState(0);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [recentNotifs, setRecentNotifs] = useState<Array<{
    id: string;
    type: 'order' | 'cart';
    label: string;
    time: string;
  }>>([]);

  useEffect(() => {
    if (!tenant?.id) return;

    const channel = supabase
      .channel(`header-notifs-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const notif = {
            id: String(row.id ?? Date.now()),
            type: 'order' as const,
            label: `Novo pedido #${String(row.external_id ?? row.id ?? '').slice(-6).toUpperCase()}`,
            time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          };
          setRecentNotifs(prev => [notif, ...prev].slice(0, 10));
          setNotifCount(c => c + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant?.id]);

  const clearNotifs = () => {
    setNotifCount(0);
    setShowNotifMenu(false);
  };
  // ────────────────────────────────────────────────────────────

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !accessToken) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/auth/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.avatar_url) {
        updateUser({ avatar_url: data.avatar_url });
      } else {
        alert(data.error || 'Erro ao enviar foto');
      }
    } catch {
      alert('Erro ao enviar foto');
    } finally {
      setUploading(false);
      setShowMenu(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    if (!accessToken) return;
    setUploading(true);
    try {
      const res = await fetch('/api/auth/avatar', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        updateUser({ avatar_url: undefined });
      }
    } catch {
      alert('Erro ao remover foto');
    } finally {
      setUploading(false);
      setShowMenu(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch { /* ignore */ }
    clearSession();
    window.location.href = '/login';
  };

  return (
    <header className="h-16 bg-white border-b border-surface-border flex items-center justify-between px-6">

      {/* Lado esquerdo — Botão Fluxo de Vendas */}
      <div className="flex items-center gap-2">
        {/* Hamburguer — abre a sidebar como drawer no mobile */}
        <button
          onClick={toggleMobileSidebar}
          className="md:hidden p-2 rounded-xl text-txt-muted hover:text-txt-primary hover:bg-slate-50 transition-colors"
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>
        <button
          onClick={() => setShowKanban(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-crm-primary/8 hover:bg-crm-primary/15 text-crm-primary transition-colors group"
          title="Fluxo de Vendas (F4)"
        >
          <GitBranch size={15} className="shrink-0" />
          <span className="text-xs font-semibold hidden sm:block">Fluxo de Vendas</span>
          <span className="text-[9px] bg-crm-primary/20 px-1.5 py-0.5 rounded font-bold hidden md:block">F4</span>
        </button>

        {/* Badge — Carrinhos Recuperados pela Anne */}
        {(anneStats?.carts_recovered_today ?? 0) > 0 && (
          <Link
            href="/configuracoes/anne"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
            title="Carrinhos recuperados hoje pela Anne"
          >
            <Zap size={13} className="text-emerald-600 shrink-0" />
            <span className="text-xs font-bold text-emerald-700 hidden sm:block">
              {anneStats!.carts_recovered_today} recuperado{anneStats!.carts_recovered_today > 1 ? 's' : ''} hoje
            </span>
          </Link>
        )}

        {/* Badge — Sugestões pendentes da Anne */}
        {(anneStats?.suggestions_pending ?? 0) > 0 && (
          <Link
            href="/configuracoes/anne"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors"
            title="Mensagens da Anne aguardando sua aprovação"
          >
            <Bot size={13} className="text-amber-600 shrink-0" />
            <span className="text-xs font-bold text-amber-700">{anneStats!.suggestions_pending}</span>
          </Link>
        )}
      </div>

      {/* Lado direito */}
      <div className="flex items-center gap-3">

        {/* Dot de conexão compacto */}
        <div
          title={
            whatsappStatus === 'connected' ? 'WhatsApp conectado' :
            whatsappStatus === 'connecting' ? 'Conectando...' :
            whatsappStatus === 'disconnected' ? 'Desconectado' : 'Verificando...'
          }
          className="flex items-center gap-1.5 text-xs font-medium"
        >
          {whatsappStatus === 'connected' ? (
            <Wifi size={14} className="text-emerald-500" />
          ) : whatsappStatus === 'disconnected' ? (
            <WifiOff size={14} className="text-red-400" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          )}
        </div>

        {/* Notificações */}
        <div className="relative">
          <button
            onClick={() => setShowNotifMenu(v => !v)}
            className="relative p-2 rounded-xl text-txt-muted hover:text-txt-primary hover:bg-slate-50 transition-colors"
            title="Notificações"
          >
            <Bell size={18} />
            {notifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4.5 h-4.5 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-1">
                {notifCount > 99 ? '99+' : notifCount}
              </span>
            )}
          </button>

          {showNotifMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotifMenu(false)} />
              <div className="absolute right-0 top-11 w-72 bg-white rounded-xl shadow-lg border border-surface-border z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-bold text-gray-800">Notificações</p>
                  {notifCount > 0 && (
                    <button
                      onClick={clearNotifs}
                      className="text-[11px] text-crm-primary hover:underline font-medium"
                    >
                      Limpar todas
                    </button>
                  )}
                </div>

                {recentNotifs.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-center px-4">
                    <Bell size={24} className="text-gray-200 mb-2" />
                    <p className="text-sm text-gray-400 font-medium">Sem notificações</p>
                    <p className="text-xs text-gray-300 mt-0.5">Novos pedidos aparecerão aqui</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                    {recentNotifs.map(n => (
                      <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${n.type === 'cart' ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                          {n.type === 'cart'
                            ? <ShoppingCart size={14} className="text-amber-600" />
                            : <Package size={14} className="text-emerald-600" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{n.label}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{n.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Perfil */}
        <div className="relative flex items-center gap-3 pl-3 border-l border-surface-border">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="relative w-9 h-9 rounded-full overflow-hidden bg-crm-primary flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-crm-primary/30 transition-all group"
            title="Alterar foto de perfil"
          >
            {uploading ? (
              <Loader2 size={16} className="text-white animate-spin" />
            ) : user?.avatar_url ? (
              <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-xs font-semibold">
                {user ? getInitials(user.name) : '?'}
              </span>
            )}
            {!uploading && (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                <Camera size={14} className="text-white" />
              </div>
            )}
          </button>

          {user && (
            <div className="hidden md:block">
              <p className="text-sm font-semibold text-txt-primary leading-tight">{user.name}</p>
              <p className="text-[11px] text-txt-muted leading-tight">{user.role}</p>
            </div>
          )}

          {/* Dropdown */}
          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-12 w-52 bg-white rounded-xl shadow-lg border border-surface-border z-50 py-1 animate-in fade-in slide-in-from-top-2 duration-200">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-txt-primary hover:bg-slate-50 transition-colors"
                >
                  <Camera size={16} className="text-txt-muted" />
                  {user?.avatar_url ? 'Trocar foto' : 'Adicionar foto'}
                </button>
                {user?.avatar_url && (
                  <button
                    onClick={handleRemoveAvatar}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={16} />
                    Remover foto
                  </button>
                )}
                <div className="border-t border-surface-border my-1" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-txt-primary hover:bg-slate-50 transition-colors"
                >
                  <LogOut size={16} className="text-txt-muted" />
                  Sair
                </button>
              </div>
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleAvatarUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Kanban Modal */}
      <KanbanModal open={showKanban} onClose={() => setShowKanban(false)} />
    </header>
  );
}
