import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { ToastContainer } from '@/components/ui/Toast';

/**
 * Layout do Dashboard — Sidebar + Header + Área de conteúdo.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-surface-bg overflow-hidden">
        {/* Sidebar — full height via h-screen interno */}
        <Sidebar />

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Header />

          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>

        {/* Toast notifications */}
        <ToastContainer />
      </div>
    </ProtectedRoute>
  );
}
