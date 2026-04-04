'use client'

import { useState } from 'react'
import { ShoppingBag, AlertCircle } from 'lucide-react'
import { useCarrinho } from './useCarrinho'
import type { ProdutoCatalogo } from './catalogo.types'

interface Props {
  produto: ProdutoCatalogo
}

export default function ProdutoCard({ produto }: Props) {
  const [tamanhoSelecionado, setTamanhoSelecionado] = useState('')
  const [adicionado, setAdicionado] = useState(false)
  const adicionarItem = useCarrinho((s) => s.adicionarItem)

  const semEstoque = produto.estoque === 0
  const estoqueBaixo = produto.estoque > 0 && produto.estoque <= 4
  const temDesconto =
    !!produto.preco_promocional && produto.preco_promocional < produto.preco

  // Preço exibido: se tem promoção, mostra promo; senão, preço normal
  const precoExibido = temDesconto ? produto.preco_promocional! : produto.preco

  function handleAdicionar() {
    if (semEstoque) return
    adicionarItem({
      produto_id: produto.id,
      sku: produto.sku,
      nome: produto.nome,
      foto_url: produto.foto_url,
      preco: precoExibido,
      tamanho: tamanhoSelecionado || undefined,
      quantidade: 1,
    })
    setAdicionado(true)
    setTimeout(() => setAdicionado(false), 1800)
  }

  return (
    <div
      className={`group relative rounded-2xl overflow-hidden border transition-all duration-300 bg-[#161b24] ${
        semEstoque
          ? 'border-white/5 opacity-60'
          : 'border-white/8 hover:border-[#dc2ade]/30 hover:shadow-xl hover:shadow-[#dc2ade]/10'
      }`}
    >
      {/* Imagem */}
      <div className="relative aspect-[3/4] overflow-hidden bg-[#1c2333]">
        {produto.foto_url ? (
          <img
            src={produto.foto_url}
            alt={produto.nome}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingBag className="w-12 h-12 text-white/10" />
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {temDesconto && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#dc2ade] text-white">
              OFERTA
            </span>
          )}
          {estoqueBaixo && !semEstoque && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/90 text-white flex items-center gap-1">
              <AlertCircle className="w-2.5 h-2.5" />
              Últimas {produto.estoque}
            </span>
          )}
          {semEstoque && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-white/50">
              Indisponível
            </span>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-3 space-y-2.5">
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-wider">
            {produto.categoria}
          </p>
          <h3 className="text-sm font-semibold text-white leading-tight mt-0.5 line-clamp-2">
            {produto.nome}
          </h3>
        </div>

        {/* Preço */}
        <div className="flex items-baseline gap-2">
          {temDesconto ? (
            <>
              <span className="text-base font-bold text-[#dc2ade]">
                R${' '}
                {produto.preco_promocional!.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                })}
              </span>
              <span className="text-xs text-white/30 line-through">
                R${' '}
                {produto.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </>
          ) : (
            <span className="text-base font-bold text-white">
              R${' '}
              {produto.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          )}
        </div>

        {/* Tamanhos */}
        {produto.tamanhos.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {produto.tamanhos.map((tam) => (
              <button
                key={tam}
                onClick={() =>
                  setTamanhoSelecionado((prev) => (prev === tam ? '' : tam))
                }
                className={`px-2 py-0.5 rounded-lg text-[11px] font-medium border transition-all ${
                  tamanhoSelecionado === tam
                    ? 'border-[#dc2ade] bg-[#dc2ade]/10 text-[#dc2ade]'
                    : 'border-white/10 text-white/50 hover:border-white/30 hover:text-white/80'
                }`}
              >
                {tam}
              </button>
            ))}
          </div>
        )}

        {/* Botão */}
        <button
          onClick={handleAdicionar}
          disabled={semEstoque}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 ${
            semEstoque
              ? 'bg-white/5 text-white/20 cursor-not-allowed'
              : adicionado
              ? 'bg-[#059669] text-white'
              : 'bg-[#dc2ade] hover:bg-[#c41fc7] text-white shadow-md shadow-[#dc2ade]/20 active:scale-95'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          {semEstoque ? 'Indisponível' : adicionado ? 'Adicionado!' : 'Adicionar'}
        </button>
      </div>
    </div>
  )
}
