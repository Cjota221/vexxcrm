'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { supabase } from '@/lib/supabase';

/**
 * Componente wrapper para proteger rotas client-side.
 * Redireciona para login se o usuário não estiver autenticado.
 * Inclui timeout de segurança para nunca ficar preso no loading.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();
  const [checking, setChecking] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const hasResolved = useRef(false);

  // Timeout de segurança — se isLoading ficar true por +5s, verificar direto no Supabase
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasResolved.current) {
        console.log('🔒 ProtectedRoute: ⏱ Timeout — forçando verificação direta');
        setTimedOut(true);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      console.log('🔒 ProtectedRoute: Verificando...', { isAuthenticated, isLoading, timedOut });

      // Se ainda está carregando e não deu timeout, aguardar
      if (isLoading && !timedOut) {
        console.log('🔒 ProtectedRoute: Aguardando AuthInitializer...');
        return;
      }

      // Se já está autenticado pelo store, liberar
      if (isAuthenticated) {
        console.log('🔒 ProtectedRoute: ✅ Autenticado!');
        hasResolved.current = true;
        setChecking(false);
        return;
      }

      // Fallback: verificar sessão diretamente no Supabase
      console.log('🔒 ProtectedRoute: Verificando sessão no Supabase...');
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          console.log('🔒 ProtectedRoute: ✅ Sessão encontrada no Supabase!');
          hasResolved.current = true;
          setChecking(false);
          return;
        }
      } catch (err) {
        console.error('🔒 ProtectedRoute: Erro ao verificar sessão:', err);
      }

      // Não tem sessão, redirecionar
      console.log('🔒 ProtectedRoute: ❌ Não autenticado, redirecionando...');
      hasResolved.current = true;
      router.push('/login');
    };

    checkAuth();
  }, [isAuthenticated, isLoading, timedOut, router]);

  if (!hasResolved.current && (isLoading || checking)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
