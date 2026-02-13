'use client';

import { useAutoSync } from '@/hooks/useAutoSync';

/**
 * Componente invisível que ativa o auto-sync da FacilZap.
 * Deve ser incluído no layout do dashboard.
 * Roda sync automático a cada 5 minutos em background.
 */
export function AutoSyncProvider() {
  useAutoSync();
  return null;
}
