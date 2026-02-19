'use client';

import { usePathname } from 'next/navigation';
import { Header } from './Header';

/**
 * Renderiza o Header global apenas fora da Central de Atendimento.
 * A Central tem seu próprio header completo (com menus + perfil + notificações).
 */
export function ConditionalHeader() {
  const pathname = usePathname();

  // Na Central, o header completo já está embutido na página
  if (pathname?.startsWith('/central')) return null;

  return <Header />;
}
