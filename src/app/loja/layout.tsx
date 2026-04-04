import type { Metadata } from 'next'
import { ReactNode } from 'react'
import LojaProviders from './LojaProviders'

export const metadata: Metadata = {
  title: 'CJ Rasteirinhas — Atacado',
  description: 'Compre sandálias e rasteirinhas no atacado. Pedido mínimo 5 peças.',
  openGraph: {
    title: 'CJ Rasteirinhas Atacado',
    description: 'Moda feminina direto da fábrica. Pedido mínimo 5 peças.',
    type: 'website',
  },
}

export default function LojaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=League+Spartan:wght@400;600;700;800;900&family=DM+Sans:wght@300;400;500;600&display=swap');
        .font-display { font-family: 'League Spartan', sans-serif !important; }
      `}</style>
      <LojaProviders>
        {children}
      </LojaProviders>
    </div>
  )
}
