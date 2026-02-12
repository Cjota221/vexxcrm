/**
 * Layout de autenticação (login, register, etc.)
 * Sem sidebar, apenas conteúdo centralizado.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface-bg flex items-center justify-center p-4">
      {children}
    </div>
  );
}
