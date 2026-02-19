import { Sidebar } from '@/components/layout/Sidebar';
import { ConditionalHeader } from '@/components/layout/ConditionalHeader';
import { ToastContainer } from '@/components/ui/Toast';
import { AutoSyncProvider } from '@/components/layout/AutoSyncProvider';
import { ConditionalMain } from '@/components/layout/ConditionalMain';

/**
 * Layout do Dashboard — Sidebar + Header + Área de conteúdo.
 * Inclui AutoSyncProvider para sincronização automática com FacilZap.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-surface-bg overflow-hidden">
      {/* Sidebar — full height via h-screen interno */}
      <Sidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <ConditionalHeader />

        <ConditionalMain>{children}</ConditionalMain>
      </div>

      {/* Auto-sync FacilZap (pedidos, produtos, clientes) a cada 5 min */}
      <AutoSyncProvider />

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  );
}
