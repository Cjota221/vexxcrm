'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ItemCarrinho } from './catalogo.types'

interface CarrinhoState {
  itens: ItemCarrinho[]
  adicionarItem: (item: ItemCarrinho) => void
  removerItem: (produtoId: string, cor?: string, tamanho?: string) => void
  alterarQuantidade: (produtoId: string, cor: string | undefined, tamanho: string | undefined, quantidade: number) => void
  limparCarrinho: () => void
  totalItens: () => number
  totalPreco: () => number
}

function mesmoItem(a: ItemCarrinho, produtoId: string, cor?: string, tamanho?: string) {
  return a.produto_id === produtoId && a.cor === cor && a.tamanho === tamanho
}

export const useCarrinho = create<CarrinhoState>()(
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

      totalItens: () => get().itens.reduce((acc, i) => acc + i.quantidade, 0),

      totalPreco: () => get().itens.reduce((acc, i) => acc + i.preco * i.quantidade, 0),
    }),
    { name: 'vexx-carrinho', skipHydration: true }
  )
)
