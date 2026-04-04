'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode, useState, useEffect } from 'react'
import { useCarrinhoLoja } from './useCarrinhoLoja'

function CarrinhoRehydrate() {
  useEffect(() => {
    useCarrinhoLoja.persist.rehydrate()
  }, [])
  return null
}

export default function LojaProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000 } },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      <CarrinhoRehydrate />
      {children}
    </QueryClientProvider>
  )
}
