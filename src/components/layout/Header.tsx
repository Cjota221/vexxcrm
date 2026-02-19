'use client';

import { useState, useRef } from 'react';
import { Bell, Camera, Trash2, LogOut, Loader2, Wifi, WifiOff } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useConnectionStore } from '@/store/connection';
import { getInitials } from '@/lib/utils';

/**
 * Header limpo — dot de conexão + notificações + perfil.
 * A busca "Buscar clientes, conversas..." foi removida — é ruído desnecessário
 * nas páginas internas que já têm busca própria.
 */
export function Header() {
  const { user, accessToken, updateUser, clearSession } = useAuthStore();
  const { whatsappStatus } = useConnectionStore();
  const [showMenu, setShowMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      // Reset input
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

      {/* Lado esquerdo — vazio, título vem da sidebar */}
      <div />

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
        <button className="relative p-2 rounded-xl text-txt-muted hover:text-txt-primary hover:bg-slate-50 transition-colors">
          <Bell size={18} />
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            3
          </span>
        </button>

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
    </header>
  );
}
