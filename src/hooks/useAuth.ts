'use client';

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import type { AuthSession } from '@/types';

/**
 * Hook de autenticação.
 * Gerencia login, logout e verificação de sessão.
 */
export function useAuth() {
  const router = useRouter();
  const {
    user,
    tenant,
    isAuthenticated,
    isLoading,
    setSession,
    clearSession,
    setLoading,
  } = useAuthStore();

  /** Verificar sessão ativa ao montar */
  useEffect(() => {
    checkSession();

    // Listener de mudanças de auth
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
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Carregar dados do usuário e tenant */
  const loadUserData = useCallback(async (accessToken: string) => {
    try {
      const response = await fetch('/api/auth/session', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Session error:', errorData);
        clearSession();
        setLoading(false);
        return;
      }

      const data: AuthSession = await response.json();
      setSession(data);
      setLoading(false);
    } catch (err) {
      console.error('Load user data error:', err);
      clearSession();
      setLoading(false);
    }
  }, [setSession, clearSession, setLoading]);

  /** Verificar sessão atual */
  const checkSession = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        await loadUserData(session.access_token);
      } else {
        clearSession();
      }
    } catch {
      clearSession();
    }
  }, [loadUserData, clearSession, setLoading]);

  /** Login com email e senha */
  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setLoading(false);
        if (error.message.includes('Invalid login')) {
          return { error: 'E-mail ou senha incorretos' };
        }
        return { error: error.message };
      }

      if (data.session) {
        await loadUserData(data.session.access_token);
        
        // Aguarda um pouco para verificar se o carregamento finalizou
        setTimeout(() => {
          router.push('/');
        }, 500);
      }

      return { error: null };
    } catch (err) {
      console.error('Login error:', err);
      setLoading(false);
      return { error: 'Erro ao fazer login. Tente novamente.' };
    }
  }, [loadUserData, router, setLoading]);

  /** Registrar nova conta (tenant + profile) */
  const register = useCallback(async (params: {
    storeName: string;
    fullName: string;
    email: string;
    password: string;
  }) => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await response.json();

      if (!response.ok) {
        setLoading(false);
        return { error: data.error || 'Erro ao criar conta' };
      }

      setLoading(false);
      return { error: null, data };
    } catch (err) {
      setLoading(false);
      return { error: 'Erro ao criar conta. Tente novamente.' };
    }
  }, [setLoading]);

  /** Logout */
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    clearSession();
    router.push('/login');
  }, [clearSession, router]);

  return {
    user,
    tenant,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    checkSession,
  };
}
