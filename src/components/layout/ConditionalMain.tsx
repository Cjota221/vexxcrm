'use client';

import { usePathname } from 'next/navigation';

/**
 * Wrapper do conteúdo principal.
 * - Central de Atendimento: sem padding, sem scroll externo (gerencia internamente).
 * - Tráfego Pago: sem padding, overflow hidden (layout de duplo sidebar gerencia internamente).
 * - Demais páginas: padding p-6 com overflow-y-auto.
 */
export function ConditionalMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isCentral = pathname?.startsWith('/central');
  const isTrafego = pathname?.startsWith('/trafego');

  if (isCentral || isTrafego) {
    return (
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto p-6">
      {children}
    </main>
  );
}
