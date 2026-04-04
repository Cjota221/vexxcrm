'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ShoppingBag, AlertCircle, Plus, Check } from 'lucide-react'
import { useCarrinho } from './useCarrinho'
import type { ProdutoCatalogo } from './catalogo.types'

interface Props {
  produto: ProdutoCatalogo
  slug: string
  corPrimaria?: string
}

export default function ProdutoCard({ produto, slug, corPrimaria = '#dc2ade' }: Props) {
  const [tamanhoSelecionado, setTamanhoSelecionado] = useState('')
  const [adicionado, setAdicionado] = useState(false)
  const adicionarItem = useCarrinho((s) => s.adicionarItem)

  const semEstoque = produto.estoque === 0
  const estoqueBaixo = produto.estoque > 0 && produto.estoque <= 4
  const temDesconto = !!produto.preco_promocional && produto.preco_promocional < produto.preco
  const precoExibido = temDesconto ? produto.preco_promocional! : produto.preco

  function handleQuickAdd(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
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
      className={`group relative rounded-2xl overflow-hidden border transition-all duration-300 bg-white ${
        semEstoque
          ? 'border-gray-100 opacity-70'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-lg'
      }`}
    >
      {/* Imagem — clicável para detalhe */}
      <Link href={`/catalogo/${slug}/produto/${produto.id}`} className="block relative aspect-[3/4] overflow-hidden bg-gray-100">
        {produto.foto_url ? (
          <img
            src={produto.foto_url}
            alt={produto.nome}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingBag className="w-12 h-12 text-gray-300" />
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {produto.destaque && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
              DESTAQUE
            </span>
          )}
          {temDesconto && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: corPrimaria }}>
              OFERTA
            </span>
          )}
          {estoqueBaixo && !semEstoque && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500 text-white flex items-center gap-1">
              <AlertCircle className="w-2.5 h-2.5" />
              Últimas {produto.estoque}
            </span>
          )}
          {semEstoque && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-400 text-white">
              Indisponível
            </span>
          )}
        </div>

        {/* Botão rápido "+" — aparece no hover */}
        {!semEstoque && (
          <button
            onClick={handleQuickAdd}
            className="absolute bottom-2 right-2 w-9 h-9 rounded-full flex items-center justify-center text-white shadow-lg opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200 active:scale-90"
            style={{ backgroundColor: adicionado ? '#22c55e' : corPrimaria }}
            aria-label="Adicionar ao carrinho"
          >
            {adicionado ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </button>
        )}
      </Link>

      {/* Info */}
      <div className="p-3 space-y-2.5">
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider">{produto.categoria}</p>
          <Link href={`/catalogo/${slug}/produto/${produto.id}`} className="block mt-0.5">
            <h3 className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2 hover:underline decoration-gray-300">
              {produto.nome}
            </h3>
          </Link>
        </div>

        {/* Preço */}
        <div className="flex items-baseline gap-2">
          {temDesconto ? (
            <>
              <span className="text-base font-bold" style={{ color: corPrimaria }}>
                R$ {produto.preco_promocional!.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-xs text-gray-400 line-through">
                R$ {produto.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </>
          ) : (
            <span className="text-base font-bold text-gray-900">
              R$ {produto.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          )}
        </div>

        {/* Tamanhos */}
        {produto.tamanhos.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {produto.tamanhos.map((tam) => (
              <button
                key={tam}
                onClick={() => setTamanhoSelecionado((prev) => (prev === tam ? '' : tam))}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-medium border transition-all ${
                  tamanhoSelecionado === tam
                    ? 'border-transparent text-white'
                    : 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'
                }`}
                style={tamanhoSelecionado === tam ? { backgroundColor: corPrimaria, borderColor: corPrimaria } : {}}
              >
                {tam}
              </button>
            ))}
          </div>
        )}

        {/* Botão adicionar */}
        <button
          onClick={handleQuickAdd}
          disabled={semEstoque}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 active:scale-95 ${
            semEstoque
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : adicionado
              ? 'bg-green-500 text-white'
              : 'text-white'
          }`}
          style={!semEstoque && !adicionado ? { backgroundColor: corPrimaria } : {}}
        >
          <ShoppingBag className="w-4 h-4" />
          {semEstoque ? 'Indisponível' : adicionado ? 'Adicionado!' : 'Adicionar'}
        </button>
      </div>
    </div>
  )
}
