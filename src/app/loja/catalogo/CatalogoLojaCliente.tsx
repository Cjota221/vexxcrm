'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import ProdutoCardLoja from './ProdutoCardLoja'
import CarrinhoBarra from '../CarrinhoBarra'
import type { ProdutoLoja } from '../loja.types'

export default function CatalogoLojaCliente() {
  const [busca, setBusca] = useState('')
  const [categoriaAtiva, setCategoriaAtiva] = useState('todas')

  const { data: produtos = [], isLoading } = useQuery<ProdutoLoja[]>({
    queryKey: ['loja', 'produtos'],
    queryFn: async () => {
      const res = await fetch('/api/loja/produtos')
      if (!res.ok) throw new Error('Erro')
      return res.json()
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const categorias = ['todas', ...Array.from(new Set(produtos.map((p) => p.categoria))).sort()]

  const filtrados = produtos.filter((p) => {
    const buscaOk = !busca || p.nome.toLowerCase().includes(busca.toLowerCase()) || p.categoria.toLowerCase().includes(busca.toLowerCase())
    const catOk = categoriaAtiva === 'todas' || p.categoria === categoriaAtiva
    return buscaOk && catOk && p.ativo
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      {/* Título */}
      <div className="mb-10">
        <p className="text-xs font-bold uppercase tracking-widest text-[#dc2ade] mb-2"
           style={{ fontFamily: 'League Spartan, sans-serif' }}>
          Atacado B2B
        </p>
        <h1 className="text-4xl sm:text-5xl font-black uppercase text-white"
            style={{ fontFamily: 'League Spartan, sans-serif' }}>
          Catálogo
        </h1>
      </div>

      {/* Filtros sticky */}
      <div className="sticky top-16 z-30 bg-[#0a0a0a]/95 backdrop-blur-xl -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 border-b border-white/5 mb-8">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              placeholder="Buscar produto..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#dc2ade]/50 transition-all"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
            {categorias.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoriaAtiva(cat)}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                  categoriaAtiva === cat
                    ? 'bg-[#dc2ade] text-white'
                    : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
                }`}
                style={{ fontFamily: 'League Spartan, sans-serif' }}
              >
                {cat === 'todas' ? 'Todas' : cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-lg bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-white/30 text-lg">Nenhum produto encontrado.</p>
        </div>
      ) : (
        <>
          <p className="text-white/20 text-xs mb-6">
            {filtrados.length} produto{filtrados.length !== 1 ? 's' : ''}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pb-32">
            {filtrados.map((produto) => (
              <ProdutoCardLoja key={produto.id} produto={produto} />
            ))}
          </div>
        </>
      )}

      <CarrinhoBarra />
    </div>
  )
}
