'use client'

import { useQuery } from '@tanstack/react-query'
import type { ProdutoCatalogo, ConfiguracaoCatalogo } from './catalogo.types'

export function useProdutos(slug: string) {
  return useQuery<ProdutoCatalogo[]>({
    queryKey: ['catalogo', 'produtos', slug],
    queryFn: async () => {
      const res = await fetch(`/api/catalogo/produtos?slug=${slug}`)
      if (!res.ok) throw new Error('Falha ao carregar produtos')
      return res.json()
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
}

export function useConfiguracaoCatalogo(slug: string) {
  return useQuery<ConfiguracaoCatalogo>({
    queryKey: ['catalogo', 'config', slug],
    queryFn: async () => {
      const res = await fetch(`/api/catalogo/config?slug=${slug}`)
      if (!res.ok) throw new Error('Configuração não encontrada')
      return res.json()
    },
    staleTime: 5 * 60_000,
  })
}
