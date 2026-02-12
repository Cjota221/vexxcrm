import type { Metadata } from 'next';

import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'VEXX CRM 2.0 — Gestão de Vendas via WhatsApp',
  description: 'Sistema SaaS Multi-Tenant de gestão de vendas via WhatsApp para e-commerces.',
  icons: {
    icon: '/images/logo-full.png',
    apple: '/images/logo-full.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
