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

  const normalizedPhone = phone ? phone.replace(/\D/g, '') : null;

  const fetchPresence = useCallback(async () => {
    if (!normalizedPhone) return;

    try {
      const { data } = await supabase
        .from('contact_presence')
        .select('status, updated_at')
        .eq('phone', normalizedPhone)
        .maybeSingle();

      if (data) {
        const age = Date.now() - new Date(data.updated_at).getTime();
        if (age < 30_000) {
          const mapped = STATUS_MAP[data.status] ?? null;
          // Typing/recording expira em 15s
          if ((mapped === 'typing' || mapped === 'recording') && age > 15_000) {
            setStatus(null);
          } else {
            setStatus(mapped);
          }
        } else {
          setStatus(null);
        }
      } else {
        setStatus(null);
      }
    } catch {
      // silencioso
    }
  }, [normalizedPhone]);

  useEffect(() => {
    if (!normalizedPhone) {
      setStatus(null);
      return;
    }

    // Busca imediata
    fetchPresence();

    // Polling a cada 3 segundos
    intervalRef.current = setInterval(fetchPresence, 3_000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [normalizedPhone, fetchPresence]);

  const label = status === 'typing'
    ? 'digitando...'
    : status === 'recording'
      ? 'gravando áudio...'
      : status === 'online'
        ? 'online'
        : null;

  return { status, label };
}
