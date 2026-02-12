'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { supabase } from '@/lib/supabase';

/**
 * Componente wrapper para proteger rotas client-side.
 * Redireciona para login se o usuário não estiver autenticado.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      console.log('🔒 ProtectedRoute: Verificando...', { isAuthenticated, isLoading });
      
      // Se ainda está carregando o auth, aguardar
      if (isLoading) {
        console.log('🔒 ProtectedRoute: Ainda carregando...');
        return;
      }

      // Se já está autenticado, liberar
      if (isAuthenticated) {
        console.log('🔒 ProtectedRoute: ✅ Autenticado!');
        setChecking(false);
        return;
      }

      // Última verificação: ver se tem sessão no Supabase
      console.log('🔒 ProtectedRoute: Verificando sessão no Supabase...');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        console.log('🔒 ProtectedRoute: ✅ Sessão encontrada no Supabase!');
        setChecking(false);
        return;
      }

      // Não tem sessão, redirecionar
      console.log('🔒 ProtectedRoute: ❌ Não autenticado, redirecionando...');
      router.push('/login');
    };

    checkAuth();
  }, [isAuthenticated, isLoading, router]);

  // Mostrar loading apenas nos primeiros 2 segundos
  if (isLoading || checking) {
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
