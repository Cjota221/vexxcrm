'use client';

/**
 * usePresence — Monitora presença (online / digitando / gravando) via polling.
 *
 * Uso:
 *   const { status, label } = usePresence(phone);
 *   // status: 'online' | 'typing' | 'recording' | 'offline' | null
 *
 * Funciona via polling da tabela contact_presence a cada 3 segundos.
 * Não depende de Supabase Realtime (que precisa de config manual).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';

type PresenceStatus = 'online' | 'typing' | 'recording' | 'offline' | null;

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

export function usePresence(phone: string | null | undefined) {
  const [status, setStatus] = useState<PresenceStatus>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tenantId = useAuthStore((s) => s.user?.tenant_id ?? null);

  const normalizedPhone = phone ? phone.replace(/\D/g, '') : null;

  const applyPresence = useCallback((rawStatus: string, updatedAt: string) => {
    const age = Date.now() - new Date(updatedAt).getTime();
    if (age < 30_000) {
      const mapped = STATUS_MAP[rawStatus] ?? null;
      // Typing/recording expira em 15s
      if ((mapped === 'typing' || mapped === 'recording') && age > 15_000) {
        setStatus(null);
      } else {
        setStatus(mapped);
      }
    } else {
      setStatus(null);
    }
  }, []);

  const fetchPresence = useCallback(async () => {
    if (!normalizedPhone) return;

    try {
      const { data } = await supabase
        .from('contact_presence')
        .select('status, updated_at')
        .eq('phone', normalizedPhone)
        .maybeSingle();

      if (data) {
        applyPresence(data.status, data.updated_at);
      } else {
        setStatus(null);
      }
    } catch {
      // silencioso
    }
  }, [normalizedPhone, applyPresence]);

  useEffect(() => {
    if (!normalizedPhone) {
      setStatus(null);
      return;
    }

    // Busca imediata
    fetchPresence();

    // Polling a cada 5 segundos como fallback se Realtime não estiver disponível
    intervalRef.current = setInterval(fetchPresence, 5_000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [normalizedPhone, fetchPresence]);

  // Realtime: atualização instantânea via WebSocket quando presença muda
  useEffect(() => {
    if (!normalizedPhone || !tenantId) return;

    const channel = supabase
      .channel(`presence-${tenantId}-${normalizedPhone}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contact_presence',
          filter: `phone=eq.${normalizedPhone}`,
        },
        (payload) => {
          const raw = (payload.new ?? payload.old) as { status?: string; updated_at?: string } | null;
          if (!raw?.status || !raw?.updated_at) return;
          applyPresence(raw.status, raw.updated_at);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [normalizedPhone, tenantId, applyPresence]);

  const label = status === 'typing'
    ? 'digitando...'
    : status === 'recording'
      ? 'gravando áudio...'
      : status === 'online'
        ? 'online'
        : null;

  return { status, label };
}
