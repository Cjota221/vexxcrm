'use client';

/**
 * usePresence — Monitora presença (online / digitando / gravando) de contatos via SSE.
 *
 * Uso:
 *   const { status, label } = usePresence(phone);
 *   // status: 'online' | 'typing' | 'recording' | 'offline' | null
 */

import { useEffect, useRef, useState } from 'react';

type PresenceStatus = 'online' | 'typing' | 'recording' | 'offline' | null;

interface PresenceData {
  phone: string;
  jid: string;
  status: PresenceStatus;
  expires_at: number;
}

// Store global em memória para presença (sem re-renders desnecessários em outros componentes)
const presenceStore = new Map<string, PresenceData>();
const listeners = new Map<string, Set<() => void>>();

function notifyListeners(phone: string) {
  listeners.get(phone)?.forEach(cb => cb());
}

function getPresence(phone: string): PresenceStatus {
  const data = presenceStore.get(phone);
  if (!data) return null;
  if (Date.now() > data.expires_at) {
    presenceStore.delete(phone);
    return null;
  }
  return data.status;
}

// Singleton SSE para presença — uma única conexão por aba
let sseInstance: EventSource | null = null;
let sseRefCount = 0;

function getSseToken(): string | null {
  // Tenta pegar o token do localStorage (padrão Supabase)
  try {
    const raw = localStorage.getItem('sb-auth-token') ||
      Object.entries(localStorage)
        .find(([k]) => k.startsWith('sb-') && k.endsWith('-auth-token'))?.[1];
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.access_token || null;
  } catch {
    return null;
  }
}

function startSSE() {
  // ⚠️ SSE DESATIVADO — endpoint /api/sse retorna 204.
  // Presença em tempo real não está disponível nesta versão.
  return;
}

function stopSSE() {
  sseInstance?.close();
  sseInstance = null;
}

/**
 * Hook para observar presença de um número de telefone.
 * @param phone — telefone normalizado (apenas dígitos, com ou sem código do país)
 */
export function usePresence(phone: string | null | undefined) {
  const [status, setStatus] = useState<PresenceStatus>(null);
  const phoneRef = useRef<string | null>(null);

  // Normalizar telefone para usar como chave
  const normalizedPhone = phone ? phone.replace(/\D/g, '') : null;

  useEffect(() => {
    if (!normalizedPhone) return;

    phoneRef.current = normalizedPhone;
    sseRefCount++;
    startSSE();

    // Registrar listener
    if (!listeners.has(normalizedPhone)) {
      listeners.set(normalizedPhone, new Set());
    }

    const update = () => {
      if (phoneRef.current === normalizedPhone) {
        setStatus(getPresence(normalizedPhone));
      }
    };

    listeners.get(normalizedPhone)!.add(update);

    // Estado inicial
    setStatus(getPresence(normalizedPhone));

    return () => {
      listeners.get(normalizedPhone)?.delete(update);
      if (listeners.get(normalizedPhone)?.size === 0) {
        listeners.delete(normalizedPhone);
      }
      sseRefCount--;
      if (sseRefCount <= 0) {
        sseRefCount = 0;
        stopSSE();
      }
    };
  }, [normalizedPhone]);

  const label = status === 'typing'
    ? 'digitando...'
    : status === 'recording'
      ? 'gravando áudio...'
      : status === 'online'
        ? 'online'
        : null;

  return { status, label };
}
