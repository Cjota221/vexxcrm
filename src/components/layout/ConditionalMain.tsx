'use client';

import { usePathname } from 'next/navigation';

/**
 * Wrapper do conteúdo principal.
 * Na Central de Atendimento, remove o padding e overflow-y-auto
 * pois a página gerencia seu próprio scroll internamente.
 */
export function ConditionalMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isCentral = pathname?.startsWith('/central');

  if (isCentral) {
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
