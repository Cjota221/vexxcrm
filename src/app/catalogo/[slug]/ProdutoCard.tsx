'use client'

import { useState } from 'react'
import { ShoppingBag, AlertCircle } from 'lucide-react'
import { useCarrinho } from './useCarrinho'
import type { ProdutoCatalogo } from './catalogo.types'

interface Props {
  produto: ProdutoCatalogo
  corPrimaria?: string
}

export default function ProdutoCard({ produto, corPrimaria = '#dc2ade' }: Props) {
  const [tamanhoSelecionado, setTamanhoSelecionado] = useState('')
  const [adicionado, setAdicionado] = useState(false)
  const adicionarItem = useCarrinho((s) => s.adicionarItem)

  const semEstoque = produto.estoque === 0
  const estoqueBaixo = produto.estoque > 0 && produto.estoque <= 4
  const temDesconto = !!produto.preco_promocional && produto.preco_promocional < produto.preco
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
      className={`group relative rounded-2xl overflow-hidden border transition-all duration-300 bg-white ${
        semEstoque
          ? 'border-gray-100 opacity-70'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-lg'
      }`}
    >
      {/* Imagem */}
      <div className="relative aspect-[3/4] overflow-hidden bg-gray-100">
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
      </div>

      {/* Info */}
      <div className="p-3 space-y-2.5">
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider">{produto.categoria}</p>
          <h3 className="text-sm font-semibold text-gray-900 leading-tight mt-0.5 line-clamp-2">
            {produto.nome}
          </h3>
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

        {/* Botão */}
        <button
          onClick={handleAdicionar}
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
