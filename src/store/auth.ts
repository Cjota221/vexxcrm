import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { User, Tenant, AuthSession } from '@/types';

interface AuthState {
  /** Usuário autenticado */
  user: User | null;
  /** Tenant do usuário */
  tenant: Tenant | null;
  /** Token de acesso */
  accessToken: string | null;
  /** Se está autenticado */
  isAuthenticated: boolean;
  /** Se está carregando a sessão */
  isLoading: boolean;

  /** Define a sessão após login */
  setSession: (session: AuthSession) => void;
  /** Limpa a sessão (logout) */
  clearSession: () => void;
  /** Atualiza o tenant */
  updateTenant: (tenant: Partial<Tenant>) => void;
  /** Atualiza dados do usuário (ex: avatar) */
  updateUser: (user: Partial<User>) => void;
  /** Define loading */
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tenant: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: true,

      setSession: (session) =>
        set({
          user: session.user,
          tenant: session.tenant,
          accessToken: session.access_token,
          isAuthenticated: true,
          isLoading: false,
        }),

      clearSession: () =>
        set({
          user: null,
          tenant: null,
          accessToken: null,
          isAuthenticated: false,
          isLoading: false,
        }),

      updateTenant: (tenantUpdate) =>
        set((state) => ({
          tenant: state.tenant
            ? { ...state.tenant, ...tenantUpdate }
            : null,
        })),

      updateUser: (userUpdate) =>
        set((state) => ({
          user: state.user
            ? { ...state.user, ...userUpdate }
            : null,
        })),

      setLoading: (loading) => set({ isLoading: loading }),
    }),
    {
      name: 'vexx-auth',
      // accessToken removido do localStorage por segurança (XSS).
      // A sessão é restaurada via supabase.auth.getSession() em providers.tsx.
      partialize: () => ({}),
    }
  )
);
