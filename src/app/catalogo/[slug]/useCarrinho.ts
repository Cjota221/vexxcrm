'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ItemCarrinho } from './catalogo.types'

interface CarrinhoState {
  itens: ItemCarrinho[]
  adicionarItem: (item: ItemCarrinho) => void
  removerItem: (produtoId: string, tamanho?: string) => void
  alterarQuantidade: (produtoId: string, tamanho: string | undefined, quantidade: number) => void
  limparCarrinho: () => void
  totalItens: () => number
  totalPreco: () => number
}

export const useCarrinho = create<CarrinhoState>()(
  persist(
    (set, get) => ({
      itens: [],

      adicionarItem: (novoItem) => set((state) => {
        const existente = state.itens.find(
          (i) => i.produto_id === novoItem.produto_id && i.tamanho === novoItem.tamanho
        )
        if (existente) {
          return {
            itens: state.itens.map((i) =>
              i.produto_id === novoItem.produto_id && i.tamanho === novoItem.tamanho
                ? { ...i, quantidade: i.quantidade + novoItem.quantidade }
                : i
            ),
          }
        }
        return { itens: [...state.itens, novoItem] }
      }),

      removerItem: (produtoId, tamanho) => set((state) => ({
        itens: state.itens.filter(
          (i) => !(i.produto_id === produtoId && i.tamanho === tamanho)
        ),
      })),

      alterarQuantidade: (produtoId, tamanho, quantidade) => set((state) => ({
        itens: quantidade <= 0
          ? state.itens.filter((i) => !(i.produto_id === produtoId && i.tamanho === tamanho))
          : state.itens.map((i) =>
              i.produto_id === produtoId && i.tamanho === tamanho
                ? { ...i, quantidade }
                : i
            ),
      })),

      limparCarrinho: () => set({ itens: [] }),

      totalItens: () => get().itens.reduce((acc, i) => acc + i.quantidade, 0),

      totalPreco: () => get().itens.reduce((acc, i) => acc + i.preco * i.quantidade, 0),
    }),
    { name: 'vexx-carrinho' }
  )
)
