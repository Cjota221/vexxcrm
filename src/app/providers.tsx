'use client';

import { useState, useEffect, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import type { AuthSession } from '@/types';

/**
 * Componente que inicializa a autenticação globalmente.
 * Garante que a auth store seja populada em TODAS as páginas,
 * não apenas nas telas de login/register.
 */
function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { setSession, clearSession, setLoading } = useAuthStore();

  const loadUserData = useCallback(async (accessToken: string) => {
    try {
      const response = await fetch('/api/auth/session', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        clearSession();
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        clearSession();
        return;
      }

      const data: AuthSession = await response.json();
      setSession(data);
    } catch {
      clearSession();
    }
  }, [setSession, clearSession]);

  useEffect(() => {
    let cancelled = false;

    const initAuth = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;

        if (session?.access_token) {
          await loadUserData(session.access_token);
        } else {
          clearSession();
        }
      } catch {
        if (!cancelled) clearSession();
      }
    };

    initAuth();

    // Listener de mudanças de auth (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          clearSession();
          return;
        }
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          await loadUserData(session.access_token);
        }
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [loadUserData, clearSession, setLoading]);

  return <>{children}</>;
}

/**
 * Providers globais da aplicação.
 * Wraps: React Query + Auth Initializer.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 2,
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthInitializer>{children}</AuthInitializer>
    </QueryClientProvider>
  );
}
