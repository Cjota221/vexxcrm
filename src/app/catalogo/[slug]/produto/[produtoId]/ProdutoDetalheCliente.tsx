'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ShoppingBag, ChevronLeft, ChevronRight, AlertCircle, Check } from 'lucide-react'
import { useProdutos, useConfiguracaoCatalogo } from '../../useCatalogo'
import { useCarrinho } from '../../useCarrinho'
import CarrinhoFlutuante from '../../CarrinhoFlutuante'

interface Props {
  slug: string
  produtoId: string
}

export default function ProdutoDetalheCliente({ slug, produtoId }: Props) {
  const { data: produtos = [], isLoading } = useProdutos(slug)
  const { data: config } = useConfiguracaoCatalogo(slug)
  const adicionarItem = useCarrinho((s) => s.adicionarItem)

  const produto = produtos.find((p) => p.id === produtoId)
  const corPrimaria = config?.cor_primaria ?? '#dc2ade'
  const whatsapp = config?.whatsapp ?? ''

  const [fotoIdx, setFotoIdx] = useState(0)
  const [corSelecionada, setCorSelecionada] = useState('')
  const [tamanhoSelecionado, setTamanhoSelecionado] = useState('')
  const [adicionado, setAdicionado] = useState(false)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div
          className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: corPrimaria, borderTopColor: 'transparent' }}
        />
      </div>
    )
  }

  if (!produto) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 px-4">
        <ShoppingBag className="w-16 h-16 text-gray-200" />
        <p className="text-gray-400 text-lg font-medium">Produto não encontrado</p>
        <Link
          href={`/catalogo/${slug}`}
          className="mt-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold transition-all active:scale-95"
          style={{ backgroundColor: corPrimaria }}
        >
          Voltar ao catálogo
        </Link>
      </div>
    )
  }

  const fotos = [produto.foto_url, ...(produto.fotos_urls?.filter((f) => f !== produto.foto_url) ?? [])].filter(Boolean)
  const semEstoque = produto.estoque === 0
  const estoqueBaixo = produto.estoque > 0 && produto.estoque <= 4
  const temDesconto = !!produto.preco_promocional && produto.preco_promocional < produto.preco
  const precoExibido = temDesconto ? produto.preco_promocional! : produto.preco

  // Se produto tem cores, filtrar tamanhos com estoque da cor selecionada
  const temCores = produto.cores && produto.cores.length > 0

  function handleAdicionar() {
    if (semEstoque) return
    adicionarItem({
      produto_id: produto!.id,
      sku: produto!.sku,
      nome: produto!.nome,
      foto_url: produto!.foto_url,
      preco: precoExibido,
      cor: corSelecionada || undefined,
      tamanho: tamanhoSelecionado || undefined,
      quantidade: 1,
    })
    setAdicionado(true)
    setTimeout(() => setAdicionado(false), 2000)
  }

  function prevFoto() {
    setFotoIdx((i) => (i === 0 ? fotos.length - 1 : i - 1))
  }

  function nextFoto() {
    setFotoIdx((i) => (i === fotos.length - 1 ? 0 : i + 1))
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href={`/catalogo/${slug}`}
            className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-all"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <span className="font-semibold text-gray-900 text-sm flex-1 truncate">{produto.nome}</span>
          <CarrinhoFlutuante whatsapp={whatsapp} corPrimaria={corPrimaria} />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

          {/* Galeria de fotos */}
          <div className="space-y-3">
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100">
              {fotos[fotoIdx] ? (
                <img
                  src={fotos[fotoIdx]}
                  alt={produto.nome}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ShoppingBag className="w-20 h-20 text-gray-200" />
                </div>
              )}

              {/* Badges */}
              <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                {temDesconto && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold text-white" style={{ backgroundColor: corPrimaria }}>
                    OFERTA
                  </span>
                )}
                {produto.destaque && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500 text-white">
                    DESTAQUE
                  </span>
                )}
                {estoqueBaixo && !semEstoque && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-500 text-white flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Últimas {produto.estoque}
                  </span>
                )}
                {semEstoque && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-400 text-white">
                    Indisponível
                  </span>
                )}
              </div>

              {/* Navegação de fotos */}
              {fotos.length > 1 && (
                <>
                  <button
                    onClick={prevFoto}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white/80 hover:bg-white shadow-sm transition-all"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-700" />
                  </button>
                  <button
                    onClick={nextFoto}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white/80 hover:bg-white shadow-sm transition-all"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-700" />
                  </button>
                  {/* Dots */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {fotos.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setFotoIdx(i)}
                        className="w-1.5 h-1.5 rounded-full transition-all"
                        style={{ backgroundColor: i === fotoIdx ? corPrimaria : '#d1d5db' }}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Thumbnails */}
            {fotos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto scrollbar-none">
                {fotos.map((foto, i) => (
                  <button
                    key={i}
                    onClick={() => setFotoIdx(i)}
                    className={`flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                      i === fotoIdx ? 'border-opacity-100' : 'border-transparent'
                    }`}
                    style={{ borderColor: i === fotoIdx ? corPrimaria : 'transparent' }}
                  >
                    <img src={foto} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Informações */}
          <div className="space-y-5">
            <div>
              <p className="text-[11px] text-gray-400 uppercase tracking-widest font-medium">{produto.categoria}</p>
              <h1
                className="text-2xl font-bold text-gray-900 mt-1 leading-tight"
                style={{ fontFamily: 'Syne, sans-serif' }}
              >
                {produto.nome}
              </h1>
              {produto.sku && (
                <p className="text-[11px] text-gray-300 mt-1">SKU: {produto.sku}</p>
              )}
            </div>

            {/* Preço */}
            <div className="flex items-baseline gap-3">
              {temDesconto ? (
                <>
                  <span className="text-3xl font-bold" style={{ color: corPrimaria }}>
                    R$ {produto.preco_promocional!.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-lg text-gray-400 line-through">
                    R$ {produto.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: corPrimaria }}>
                    -{Math.round((1 - produto.preco_promocional! / produto.preco) * 100)}%
                  </span>
                </>
              ) : (
                <span className="text-3xl font-bold text-gray-900">
                  R$ {produto.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>

            {/* Descrição */}
            {produto.descricao && (
              <p className="text-sm text-gray-500 leading-relaxed">{produto.descricao}</p>
            )}

            {/* Seletor de cores */}
            {temCores && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Cor{corSelecionada && <span className="normal-case font-normal text-gray-400 ml-1">— {corSelecionada}</span>}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {produto.cores.map((cor) => (
                    <button
                      key={cor.nome}
                      onClick={() => setCorSelecionada((prev) => (prev === cor.nome ? '' : cor.nome))}
                      title={cor.nome}
                      className={`w-9 h-9 rounded-full border-2 transition-all flex items-center justify-center ${
                        corSelecionada === cor.nome ? 'scale-110 shadow-md' : 'hover:scale-105'
                      }`}
                      style={{
                        backgroundColor: cor.hex,
                        borderColor: corSelecionada === cor.nome ? corPrimaria : 'transparent',
                        outline: corSelecionada === cor.nome ? `2px solid ${corPrimaria}` : '2px solid transparent',
                        outlineOffset: '2px',
                      }}
                    >
                      {corSelecionada === cor.nome && (
                        <Check className="w-4 h-4" style={{ color: isLight(cor.hex) ? '#111' : '#fff' }} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Seletor de tamanhos */}
            {produto.tamanhos.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Tamanho{tamanhoSelecionado && <span className="normal-case font-normal text-gray-400 ml-1">— {tamanhoSelecionado}</span>}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {produto.tamanhos.map((tam) => (
                    <button
                      key={tam}
                      onClick={() => setTamanhoSelecionado((prev) => (prev === tam ? '' : tam))}
                      className={`min-w-[44px] px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                        tamanhoSelecionado === tam
                          ? 'text-white border-transparent'
                          : 'border-gray-200 text-gray-600 hover:border-gray-400 hover:text-gray-800'
                      }`}
                      style={tamanhoSelecionado === tam ? { backgroundColor: corPrimaria, borderColor: corPrimaria } : {}}
                    >
                      {tam}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Botão adicionar */}
            <div className="pt-2 space-y-3">
              <button
                onClick={handleAdicionar}
                disabled={semEstoque}
                className={`w-full py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-3 transition-all duration-200 active:scale-95 shadow-lg ${
                  semEstoque
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                    : adicionado
                    ? 'bg-green-500 text-white shadow-green-500/30'
                    : 'text-white'
                }`}
                style={!semEstoque && !adicionado ? { backgroundColor: corPrimaria, boxShadow: `0 8px 24px ${corPrimaria}40` } : {}}
              >
                {adicionado ? (
                  <>
                    <Check className="w-5 h-5" />
                    Adicionado ao carrinho!
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-5 h-5" />
                    {semEstoque ? 'Indisponível' : 'Adicionar ao carrinho'}
                  </>
                )}
              </button>

              <Link
                href={`/catalogo/${slug}`}
                className="block w-full py-3 rounded-2xl text-sm font-semibold text-gray-500 hover:text-gray-700 text-center transition-colors border border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              >
                Continuar comprando
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Determina se uma cor hex é clara (para escolher texto preto ou branco) */
function isLight(hex: string): boolean {
  const c = hex.replace('#', '')
  if (c.length < 6) return true
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  // Luminância relativa simplificada
  return (r * 299 + g * 587 + b * 114) / 1000 > 128
}
