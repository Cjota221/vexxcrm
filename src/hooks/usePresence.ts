'use client';

/**
 * usePresence — Monitora presença (online / digitando / gravando) via Supabase Realtime.
 *
 * Uso:
 *   const { status, label } = usePresence(phone);
 *   // status: 'online' | 'typing' | 'recording' | 'offline' | null
 *
 * Funciona via:
 * 1. Leitura inicial da tabela contact_presence
 * 2. Subscription Realtime para mudanças na tabela
 * 3. Auto-expira status de typing/recording após 15s
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

type PresenceStatus = 'online' | 'typing' | 'recording' | 'offline' | null;

// Mapa de status da Evolution API para status do app
const STATUS_MAP: Record<string, PresenceStatus> = {
  available: 'online',
  unavailable: 'offline',
  composing: 'typing',
  recording: 'recording',
  paused: null,
  online: 'online',
  offline: 'offline',
  typing: 'typing',
};

/**
 * Hook para observar presença de um número de telefone.
 * @param phone — telefone (com ou sem formatação)
 */
export function usePresence(phone: string | null | undefined) {
  const [status, setStatus] = useState<PresenceStatus>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalizedPhone = phone ? phone.replace(/\D/g, '') : null;

  // Limpar timer de expiração
  const clearExpiry = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Definir status com auto-expiração para typing/recording
  const setPresenceStatus = useCallback((newStatus: PresenceStatus) => {
    clearExpiry();
    setStatus(newStatus);

    // Typing e recording expiram após 15 segundos
    if (newStatus === 'typing' || newStatus === 'recording') {
      timerRef.current = setTimeout(() => {
        setStatus(null);
      }, 15_000);
    }
  }, [clearExpiry]);

  useEffect(() => {
    if (!normalizedPhone) {
      setStatus(null);
      return;
    }

    // 1. Leitura inicial da tabela contact_presence
    supabase
      .from('contact_presence')
      .select('status, updated_at')
      .eq('phone', normalizedPhone)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const age = Date.now() - new Date(data.updated_at).getTime();
          // Só considerar se atualizado nos últimos 30 segundos
          if (age < 30_000) {
            const mapped = STATUS_MAP[data.status] ?? null;
            setPresenceStatus(mapped);
          }
        }
      });

    // 2. Subscription Realtime para mudanças
    const channel = supabase
      .channel(`presence-${normalizedPhone}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contact_presence',
          filter: `phone=eq.${normalizedPhone}`,
        },
        (payload) => {
          const row = (payload.new || {}) as { status?: string; updated_at?: string };
          if (row.status) {
            const mapped = STATUS_MAP[row.status] ?? null;
            setPresenceStatus(mapped);
          }
        }
      )
      .subscribe();

    return () => {
      clearExpiry();
      void supabase.removeChannel(channel);
    };
  }, [normalizedPhone, setPresenceStatus, clearExpiry]);

  const label = status === 'typing'
    ? 'digitando...'
    : status === 'recording'
      ? 'gravando áudio...'
      : status === 'online'
        ? 'online'
        : null;

  return { status, label };
}
