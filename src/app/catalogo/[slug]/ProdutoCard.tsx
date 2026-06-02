'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ShoppingBag, AlertCircle, Plus, X } from 'lucide-react'
import { useCarrinho } from './useCarrinho'
import SeletorTamanhos from './SeletorTamanhos'
import type { ProdutoCatalogo } from './catalogo.types'

interface Props {
  produto: ProdutoCatalogo
  slug: string
  corPrimaria?: string
}

export default function ProdutoCard({ produto, slug, corPrimaria = '#dc2ade' }: Props) {
  const [modalAberto, setModalAberto] = useState(false)
  const adicionarItem = useCarrinho((s) => s.adicionarItem)

  const semEstoque = produto.estoque === 0
  const estoqueBaixo = produto.estoque > 0 && produto.estoque <= 4
  const temDesconto = !!produto.preco_promocional && produto.preco_promocional < produto.preco
  const precoExibido = temDesconto ? produto.preco_promocional! : produto.preco
  const temTamanhos = produto.tamanhos.length > 0

  function handleAdicionar(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (semEstoque) return
    if (temTamanhos) {
      setModalAberto(true)
      return
    }
    // Produto sem tamanhos: adiciona direto
    adicionarItem({
      produto_id: produto.id,
      sku: produto.sku,
      nome: produto.nome,
      foto_url: produto.foto_url,
      preco: precoExibido,
      quantidade: 1,
    })
  }

  return (
    <>
      <div
        className={`group relative rounded-2xl overflow-hidden border transition-all duration-300 bg-white ${
          semEstoque
            ? 'border-gray-100 opacity-70'
            : 'border-gray-200 hover:border-gray-300 hover:shadow-lg'
        }`}
      >
        {/* Imagem */}
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

          {/* Botão rápido "+" hover */}
          {!semEstoque && (
            <button
              onClick={handleAdicionar}
              className="absolute bottom-2 right-2 w-9 h-9 rounded-full flex items-center justify-center text-white shadow-lg opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200 active:scale-90"
              style={{ backgroundColor: corPrimaria }}
              aria-label="Comprar"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </Link>

        {/* Info */}
        <div className="p-3 space-y-2">
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

          {/* Resumo de tamanhos disponíveis */}
          {temTamanhos && (
            <p className="text-[11px] text-gray-400">
              {produto.tamanhos.length} tamanho{produto.tamanhos.length !== 1 ? 's' : ''}: {produto.tamanhos.slice(0, 4).join(', ')}{produto.tamanhos.length > 4 ? '…' : ''}
            </p>
          )}

          {/* Botão */}
          <button
            onClick={handleAdicionar}
            disabled={semEstoque}
            className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 active:scale-95 text-white disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
            style={!semEstoque ? { backgroundColor: corPrimaria } : {}}
          >
            <ShoppingBag className="w-4 h-4" />
            {semEstoque ? 'Indisponível' : 'Comprar'}
          </button>
        </div>
      </div>

      {/* Bottom sheet com seletor de tamanhos */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setModalAberto(false)}>
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          {/* Sheet */}
          <div
            className="relative bg-white rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                {produto.foto_url && (
                  <img src={produto.foto_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
                )}
                <div>
                  <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-1">{produto.nome}</p>
                  <p className="text-xs font-bold" style={{ color: corPrimaria }}>
                    R$ {precoExibido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    {temDesconto && (
                      <span className="text-gray-400 line-through font-normal ml-2">
                        R$ {produto.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalAberto(false)}
                className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Seletor de tamanhos com scroll */}
            <div className="overflow-y-auto flex-1">
              <SeletorTamanhos
                produto={produto}
                corPrimaria={corPrimaria}
                onAdicionado={() => setModalAberto(false)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
