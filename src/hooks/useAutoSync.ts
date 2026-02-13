'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';

/**
 * AUTO_SYNC_INTERVAL — Intervalo entre sincronizações automáticas (em ms).
 * Padrão: 5 minutos (300.000ms).
 */
const AUTO_SYNC_INTERVAL = 5 * 60 * 1000;

/**
 * Hook de sincronização automática com FacilZap.
 * 
 * Roda em background no dashboard:
 * 1. Ao montar (primeira vez que o dashboard abre), faz sync imediato
 * 2. A cada 5 minutos, faz sync leve (página 1 de pedidos/produtos/clientes)
 * 3. Ao receber foco na janela, verifica se precisa sincronizar
 * 4. Invalida caches do React Query após sync para atualizar UIs
 * 
 * Usa o endpoint /api/facilzap/auto-sync que é uma versão leve do sync completo.
 */
export function useAutoSync() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSyncRef = useRef<number>(0);
  const isSyncingRef = useRef(false);
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();

  const doSync = useCallback(async () => {
    // Não sincronizar se já está em andamento ou não autenticado
    if (isSyncingRef.current || !isAuthenticated) return;

    // Não sincronizar mais de 1x a cada 2 minutos
    const now = Date.now();
    if (now - lastSyncRef.current < 2 * 60 * 1000) return;

    isSyncingRef.current = true;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        isSyncingRef.current = false;
        return;
      }

      console.log('[AutoSync] Iniciando sincronização automática...');

      const response = await fetch('/api/facilzap/auto-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        const data = await response.json();
        lastSyncRef.current = Date.now();

        const { results } = data;
        const total = (results?.products || 0) + (results?.clients || 0) + (results?.orders || 0);

        if (total > 0) {
          console.log(
            `[AutoSync] ✅ Sync completo: ${results.products}P ${results.clients}C ${results.orders}O` +
            (results.relinked > 0 ? ` (${results.relinked} revinculados)` : '') +
            ` — ${data.duration_ms}ms`
          );

          // Invalidar caches para forçar refetch nos componentes
          if (results.products > 0) {
            queryClient.invalidateQueries({ queryKey: ['products'] });
          }
          if (results.clients > 0) {
            queryClient.invalidateQueries({ queryKey: ['clients'] });
          }
          if (results.orders > 0) {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          }
        } else {
          console.log('[AutoSync] Nenhum dado novo encontrado');
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        // Não logar erro se é apenas token FacilZap não configurado
        if (errData.error !== 'Token FacilZap nao configurado') {
          console.warn('[AutoSync] Erro:', errData.error || response.status);
        }
      }
    } catch (err) {
      console.warn('[AutoSync] Falha na sincronização:', err);
    } finally {
      isSyncingRef.current = false;
    }
  }, [isAuthenticated, queryClient]);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Sync inicial com delay de 3s (esperar app carregar)
    const initialTimeout = setTimeout(() => {
      doSync();
    }, 3000);

    // Sync periódico a cada 5 minutos
    intervalRef.current = setInterval(() => {
      doSync();
    }, AUTO_SYNC_INTERVAL);

    // Sync ao voltar para a aba (window focus)
    const handleFocus = () => {
      // Só sync se passou mais de 2 minutos desde o último
      if (Date.now() - lastSyncRef.current > 2 * 60 * 1000) {
        doSync();
      }
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isAuthenticated, doSync]);
}
