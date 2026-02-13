import { Header } from '@/components/layout/Header';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { ToastContainer } from '@/components/ui/Toast';

/**
 * Layout do Atendimento — Full-screen sem sidebar, maximizando espaço.
 */
export default function AtendimentoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <div className="flex flex-col h-screen bg-surface-bg overflow-hidden">
        <Header />
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
        <ToastContainer />
      </div>
    </ProtectedRoute>
  );
}
