import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { ToastContainer } from '@/components/ui/Toast';

/**
 * Layout da Central de Atendimento — Full-screen sem sidebar, sem Header global.
 * O header completo (com menus + notificações + perfil) está embutido na page.tsx.
 */
export default function CentralLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <div className="flex flex-col h-dvh bg-surface-bg overflow-hidden w-screen max-w-full">
        <main className="flex-1 overflow-hidden min-w-0">
          {children}
        </main>
        <ToastContainer />
      </div>
    </ProtectedRoute>
  );
}
