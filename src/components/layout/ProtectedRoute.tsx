'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { supabase } from '@/lib/supabase';

/**
 * Componente wrapper para proteger rotas client-side.
 * Redireciona para login se o usuário não estiver autenticado.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, accessToken } = useAuthStore();

  useEffect(() => {
    const checkAuth = async () => {
      // Se ainda está carregando, aguardar
      if (isLoading) {
        return;
      }

      // Se não está autenticado E não tem token, redirecionar
      if (!isAuthenticated && !accessToken) {
        // Última verificação: verificar se há sessão no Supabase
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.log('🔒 ProtectedRoute: Não autenticado, redirecionando...');
          router.push('/login');
        }
      }
    };

    checkAuth();
  }, [isAuthenticated, isLoading, accessToken, router]);

  // Mostrar loading enquanto verifica autenticação
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // Se não autenticado E não tem token, não renderizar nada (vai redirecionar)
  if (!isAuthenticated && !accessToken) {
    return null;
  }

  return <>{children}</>;
}
