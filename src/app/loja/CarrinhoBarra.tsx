'use client'

import Link from 'next/link'
import { ShoppingBag, ArrowRight, AlertCircle } from 'lucide-react'
import { useCarrinhoLoja } from './useCarrinhoLoja'

export default function CarrinhoBarra() {
  const totalPecas = useCarrinhoLoja((s) => s.totalPecas())
  const totalPreco = useCarrinhoLoja((s) => s.totalPreco())
  const atingiuMinimo = useCarrinhoLoja((s) => s.atingiuMinimo())
  const pecasFaltando = useCarrinhoLoja((s) => s.pecasFaltando())

  if (totalPecas === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-gradient-to-t from-[#0a0a0a] to-transparent pointer-events-none">
      <div className="max-w-lg mx-auto pointer-events-auto">
        {!atingiuMinimo && (
          <div className="mb-2 px-4 py-2 rounded-xl bg-orange-500/15 border border-orange-500/20 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0" />
            <p className="text-xs text-orange-400 font-medium">
              Adicione mais {pecasFaltando} {pecasFaltando === 1 ? 'peça' : 'peças'} para atingir o pedido mínimo
            </p>
          </div>
        )}

        <Link href="/loja/carrinho"
          className={`flex items-center justify-between gap-4 px-5 py-4 rounded-2xl shadow-2xl transition-all ${
            atingiuMinimo
              ? 'bg-[#dc2ade] text-white shadow-[#dc2ade]/30'
              : 'bg-[#1a1a1a] border border-white/10 text-white/70'
          }`}>
          <div className="flex items-center gap-3">
            <ShoppingBag className="w-5 h-5" />
            <div>
              <p className="text-sm font-bold uppercase"
                 style={{ fontFamily: 'League Spartan, sans-serif' }}>
                {totalPecas} {totalPecas === 1 ? 'peça' : 'peças'}
              </p>
              <p className="text-xs opacity-70">
                R$ {totalPreco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold uppercase"
                  style={{ fontFamily: 'League Spartan, sans-serif' }}>
              {atingiuMinimo ? 'Ver carrinho' : 'Carrinho'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </Link>
      </div>
    </div>
  )
}
