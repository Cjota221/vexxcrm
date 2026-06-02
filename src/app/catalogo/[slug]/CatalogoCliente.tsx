'use client'

import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { useProdutos, useConfiguracaoCatalogo } from './useCatalogo'
import ProdutoCard from './ProdutoCard'
import CarrinhoFlutuante from './CarrinhoFlutuante'
import { useCarrinho } from './useCarrinho'

interface Props {
  slug: string
  whatsapp: string
}

export default function CatalogoCliente({ slug, whatsapp }: Props) {
  const [busca, setBusca] = useState('')
  const [categoriaAtiva, setCategoriaAtiva] = useState('todas')

  // Rehydrate carrinho do localStorage após mount (evita hydration mismatch)
  useEffect(() => {
    useCarrinho.persist.rehydrate()
  }, [])

  const { data: produtos = [], isLoading, isError } = useProdutos(slug)
  const { data: config } = useConfiguracaoCatalogo(slug)

  const whatsappFinal = config?.whatsapp || whatsapp
  const corPrimaria = config?.cor_primaria ?? '#dc2ade'

  const categorias = [
    'todas',
    ...Array.from(new Set(produtos.map((p) => p.categoria))).sort(),
  ]

  const produtosFiltrados = produtos.filter((p) => {
    const buscaOk =
      !busca ||
      p.nome.toLowerCase().includes(busca.toLowerCase()) ||
      p.categoria.toLowerCase().includes(busca.toLowerCase())
    const categoriaOk = categoriaAtiva === 'todas' || p.categoria === categoriaAtiva
    return buscaOk && categoriaOk && p.ativo && p.estoque > 0
  })

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          {/* Logo / Nome */}
          <div className="flex-shrink-0">
            {config?.logo_url ? (
              <img src={config.logo_url} alt={config.nome_loja} className="h-8 w-auto" />
            ) : (
              <span
                className="text-xl font-bold tracking-tight"
                style={{ fontFamily: 'Syne, sans-serif', color: corPrimaria }}
              >
                {config?.nome_loja ?? 'Catálogo'}
              </span>
            )}
          </div>

          {/* Busca desktop */}
          <div className="flex-1 max-w-md relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar produtos..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full bg-gray-100 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:bg-white transition-all"
            />
          </div>

          <div className="ml-auto">
            <CarrinhoFlutuante whatsapp={whatsappFinal} corPrimaria={corPrimaria} />
          </div>
        </div>

        {/* Busca mobile */}
        <div className="sm:hidden px-4 pb-3 relative">
          <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full bg-gray-100 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
          />
        </div>
      </header>

      {/* Banner */}
      {config?.banner_url && (
        <div className="w-full h-40 sm:h-56 overflow-hidden">
          <img
            src={config.banner_url}
            alt="Banner"
            className="w-full h-full object-cover object-center"
          />
        </div>
      )}

      {/* Filtros de categoria */}
      {categorias.length > 2 && (
        <div className="sticky top-[57px] sm:top-[65px] z-30 bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 py-2.5">
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
              {categorias.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoriaAtiva(cat)}
                  className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-all ${
                    categoriaAtiva === cat
                      ? 'text-white shadow-sm'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                  }`}
                  style={categoriaAtiva === cat ? { backgroundColor: corPrimaria } : {}}
                >
                  {cat === 'todas' ? 'Todas' : cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-gray-200 animate-pulse aspect-[3/4]" />
            ))}
          </div>
        )}

        {isError && (
          <div className="text-center py-24">
            <p className="text-gray-400 text-lg">Erro ao carregar produtos.</p>
            <p className="text-gray-300 text-sm mt-2">Tente novamente em instantes.</p>
          </div>
        )}

        {!isLoading && !isError && produtosFiltrados.length === 0 && (
          <div className="text-center py-24">
            <p className="text-gray-400 text-lg">
              {busca ? 'Nenhum produto encontrado.' : 'Nenhum produto disponível.'}
            </p>
          </div>
        )}

        {!isLoading && !isError && produtosFiltrados.length > 0 && (
          <>
            <p className="text-gray-400 text-xs mb-6">
              {produtosFiltrados.length} produto{produtosFiltrados.length !== 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {produtosFiltrados.map((produto) => (
                <ProdutoCard key={produto.id} produto={produto} slug={slug} corPrimaria={corPrimaria} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-16 border-t border-gray-200 py-8 text-center bg-white">
        <p className="text-gray-400 text-xs">
          Pedidos via WhatsApp · {config?.nome_loja ?? 'Catálogo'}
        </p>
      </footer>
    </div>
  )
}
