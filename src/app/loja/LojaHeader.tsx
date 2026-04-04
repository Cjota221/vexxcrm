'use client'

import Link from 'next/link'
import { ShoppingBag, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { useCarrinhoLoja } from './useCarrinhoLoja'

export default function LojaHeader() {
  const [menuAberto, setMenuAberto] = useState(false)
  const totalPecas = useCarrinhoLoja((s) => s.totalPecas())
  const atingiuMinimo = useCarrinhoLoja((s) => s.atingiuMinimo())

  return (
    <header className="sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">

        {/* Logo */}
        <Link href="/loja" className="flex-shrink-0">
          <span className="text-xl font-black tracking-tight uppercase text-white font-display"
                style={{ fontFamily: 'League Spartan, sans-serif' }}>
            CJ<span className="text-[#dc2ade]">ota</span>
          </span>
        </Link>

        {/* Nav desktop */}
        <nav className="hidden md:flex items-center gap-8">
          {[
            { href: '/loja', label: 'Home' },
            { href: '/loja/catalogo', label: 'Catálogo' },
            { href: '/loja/catalogo?categoria=novidades', label: 'Novidades' },
          ].map(({ href, label }) => (
            <Link key={href} href={href}
              className="text-sm font-medium text-white/50 hover:text-white transition-colors uppercase tracking-wider"
              style={{ fontFamily: 'League Spartan, sans-serif' }}>
              {label}
            </Link>
          ))}
        </nav>

        {/* Direita */}
        <div className="flex items-center gap-3">
          <Link href="/loja/carrinho"
            className="relative flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 hover:border-[#dc2ade]/40 transition-all group">
            <ShoppingBag className="w-4 h-4 text-white/60 group-hover:text-white transition-colors" />
            {totalPecas > 0 && (
              <span className="text-xs font-bold text-white">
                {totalPecas} {totalPecas === 1 ? 'peça' : 'peças'}
              </span>
            )}
            {totalPecas > 0 && (
              <span className={`absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center ${
                atingiuMinimo ? 'bg-[#059669]' : 'bg-[#dc2ade]'
              } text-white`}>
                {totalPecas > 9 ? '9+' : totalPecas}
              </span>
            )}
          </Link>

          <button className="md:hidden p-2 text-white/50 hover:text-white transition-colors"
            onClick={() => setMenuAberto(!menuAberto)}>
            {menuAberto ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Menu mobile */}
      {menuAberto && (
        <div className="md:hidden border-t border-white/5 bg-[#111111] py-4 px-4 space-y-1">
          {[
            { href: '/loja', label: 'Home' },
            { href: '/loja/catalogo', label: 'Catálogo' },
            { href: '/loja/carrinho', label: `Carrinho (${totalPecas} peças)` },
          ].map(({ href, label }) => (
            <Link key={href} href={href} onClick={() => setMenuAberto(false)}
              className="block py-3 px-4 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-all uppercase tracking-wider"
              style={{ fontFamily: 'League Spartan, sans-serif' }}>
              {label}
            </Link>
          ))}
        </div>
      )}
    </header>
  )
}
