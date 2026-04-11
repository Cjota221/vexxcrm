import { TrafegoContextMenu } from '@/components/trafego/TrafegoContextMenu';

/**
 * Layout de Duplo Nível para o módulo de Tráfego Pago.
 *
 * Estrutura de 3 colunas:
 *   [Nível 1: Menu Global]  [Nível 2: Menu Contextual]  [Nível 3: Área de Trabalho]
 *      (Sidebar global)       (TrafegoContextMenu)           ({children})
 *
 * O Nível 1 é gerenciado pelo DashboardLayout pai.
 * Este layout apenas acrescenta o Nível 2 e delimita o Nível 3.
 */
export default function TrafegoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full overflow-hidden">
      {/* Nível 2: Menu Contextual de Tráfego */}
      <TrafegoContextMenu />

      {/* Nível 3: Área de Trabalho */}
      <div className="flex-1 overflow-y-auto min-w-0 bg-gray-50 pb-24 md:pb-0">
        {children}
      </div>
    </div>
  );
}
