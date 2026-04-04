'use client'

import { useState } from 'react'
import { Minus, Plus, ShoppingBag } from 'lucide-react'
import { useCarrinho } from './useCarrinho'
import type { ProdutoCatalogo } from './catalogo.types'

interface Props {
  produto: ProdutoCatalogo
  corPrimaria?: string
  onAdicionado?: () => void
}

interface QtdPorTamanho {
  [tamanho: string]: number
}

export default function SeletorTamanhos({ produto, corPrimaria = '#dc2ade', onAdicionado }: Props) {
  const adicionarItem = useCarrinho((s) => s.adicionarItem)
  const [qtds, setQtds] = useState<QtdPorTamanho>({})
  const [adicionado, setAdicionado] = useState(false)

  const totalItens = Object.values(qtds).reduce((acc, q) => acc + q, 0)
  const temDesconto = !!produto.preco_promocional && produto.preco_promocional < produto.preco
  const preco = temDesconto ? produto.preco_promocional! : produto.preco

  function alterar(tamanho: string, delta: number) {
    setQtds((prev) => {
      const atual = prev[tamanho] ?? 0
      const novo = Math.max(0, atual + delta)
      if (novo === 0) {
        const { [tamanho]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [tamanho]: novo }
    })
  }

  function handleAdicionar() {
    const entradas = Object.entries(qtds).filter(([, q]) => q > 0)
    if (entradas.length === 0) return

    entradas.forEach(([tamanho, quantidade]) => {
      adicionarItem({
        produto_id: produto.id,
        sku: produto.sku,
        nome: produto.nome,
        foto_url: produto.foto_url,
        preco,
        tamanho,
        quantidade,
      })
    })

    setAdicionado(true)
    setTimeout(() => {
      setAdicionado(false)
      setQtds({})
      onAdicionado?.()
    }, 1500)
  }

  const tamanhos = produto.tamanhos

  return (
    <div className="flex flex-col">
      {/* Lista de tamanhos */}
      <div className="divide-y divide-gray-100">
        {tamanhos.map((tam, idx) => {
          const qtd = qtds[tam] ?? 0
          const skuVariante = `${produto.sku}.${idx + 1}`

          return (
            <div key={tam} className="flex items-center justify-between px-4 py-3">
              {/* Tamanho + SKU */}
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: corPrimaria }}
                >
                  <span className="text-white font-bold text-base">{tam}</span>
                </div>
                <span className="text-xs text-gray-400">{skuVariante}</span>
              </div>

              {/* Stepper */}
              <div className="flex items-center gap-0 border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => alterar(tam, -1)}
                  disabled={qtd === 0}
                  className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span
                  className="w-10 text-center text-sm font-semibold"
                  style={{ color: qtd > 0 ? corPrimaria : '#9ca3af' }}
                >
                  {qtd}
                </span>
                <button
                  onClick={() => alterar(tam, +1)}
                  className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
                  style={{ color: qtd > 0 ? corPrimaria : undefined }}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Rodapé — total + botão */}
      <div className="px-4 pt-3 pb-4 border-t border-gray-100 space-y-3 mt-1">
        {totalItens > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">{totalItens} peça{totalItens !== 1 ? 's' : ''}</span>
            <span className="font-bold text-gray-800">
              R$ {(totalItens * preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}

        <button
          onClick={handleAdicionar}
          disabled={totalItens === 0}
          className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          style={
            adicionado
              ? { backgroundColor: '#22c55e', color: 'white' }
              : totalItens > 0
              ? { backgroundColor: corPrimaria, color: 'white', boxShadow: `0 4px 16px ${corPrimaria}40` }
              : { backgroundColor: '#f3f4f6', color: '#9ca3af' }
          }
        >
          <ShoppingBag className="w-4 h-4" />
          {adicionado ? 'Adicionado!' : totalItens > 0 ? `Adicionar ${totalItens} peça${totalItens !== 1 ? 's' : ''}` : 'Selecione os tamanhos'}
        </button>
      </div>
    </div>
  )
}
