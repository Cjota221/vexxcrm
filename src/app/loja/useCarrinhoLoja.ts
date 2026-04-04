'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ItemCarrinhoLoja } from './loja.types'

const MINIMO_PECAS = 5

interface CarrinhoLojaState {
  itens: ItemCarrinhoLoja[]
  adicionarItem: (item: ItemCarrinhoLoja) => void
  removerItem: (produtoId: string, cor: string | undefined, tamanho: string) => void
  alterarQuantidade: (produtoId: string, cor: string | undefined, tamanho: string, quantidade: number) => void
  limparCarrinho: () => void
  totalPecas: () => number
  totalPreco: () => number
  atingiuMinimo: () => boolean
  pecasFaltando: () => number
}

function mesmoItem(i: ItemCarrinhoLoja, produtoId: string, cor: string | undefined, tamanho: string) {
  return i.produto_id === produtoId && i.cor === cor && i.tamanho === tamanho
}

export const useCarrinhoLoja = create<CarrinhoLojaState>()(
  persist(
    (set, get) => ({
      itens: [],

      adicionarItem: (novoItem) => set((state) => {
        const existente = state.itens.find((i) =>
          mesmoItem(i, novoItem.produto_id, novoItem.cor, novoItem.tamanho)
        )
        if (existente) {
          return {
            itens: state.itens.map((i) =>
              mesmoItem(i, novoItem.produto_id, novoItem.cor, novoItem.tamanho)
                ? { ...i, quantidade: i.quantidade + novoItem.quantidade }
                : i
            ),
          }
        }
        return { itens: [...state.itens, novoItem] }
      }),

      removerItem: (produtoId, cor, tamanho) => set((state) => ({
        itens: state.itens.filter((i) => !mesmoItem(i, produtoId, cor, tamanho)),
      })),

      alterarQuantidade: (produtoId, cor, tamanho, quantidade) => set((state) => ({
        itens: quantidade <= 0
          ? state.itens.filter((i) => !mesmoItem(i, produtoId, cor, tamanho))
          : state.itens.map((i) =>
              mesmoItem(i, produtoId, cor, tamanho) ? { ...i, quantidade } : i
            ),
      })),

      limparCarrinho: () => set({ itens: [] }),

      totalPecas: () => get().itens.reduce((acc, i) => acc + i.quantidade, 0),

      totalPreco: () => get().itens.reduce((acc, i) => acc + i.preco_unitario * i.quantidade, 0),

      atingiuMinimo: () => get().itens.reduce((acc, i) => acc + i.quantidade, 0) >= MINIMO_PECAS,

      pecasFaltando: () =>
        Math.max(0, MINIMO_PECAS - get().itens.reduce((acc, i) => acc + i.quantidade, 0)),
    }),
    { name: 'cj-carrinho-loja', skipHydration: true }
  )
)
