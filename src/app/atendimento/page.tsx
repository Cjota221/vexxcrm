'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Rota legada /atendimento — redireciona para /central.
 * Toda a funcionalidade de atendimento foi consolidada na Central.
 */
export default function AtendimentoRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/central');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-sm text-txt-muted">Redirecionando para Central...</p>
    </div>
  );
}
