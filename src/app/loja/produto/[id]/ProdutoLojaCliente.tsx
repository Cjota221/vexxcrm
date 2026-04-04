'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ShoppingBag, Plus, Minus, ChevronLeft, ChevronRight, Check, AlertCircle } from 'lucide-react'
import { useCarrinhoLoja } from '../../useCarrinhoLoja'
import CarrinhoBarra from '../../CarrinhoBarra'
import type { ProdutoLoja, GradeSelecao } from '../../loja.types'

interface Props { produtoId: string }

export default function ProdutoLojaCliente({ produtoId }: Props) {
  const [fotoAtiva, setFotoAtiva] = useState(0)
  const [corSelecionada, setCorSelecionada] = useState('')
  const [grade, setGrade] = useState<GradeSelecao>({})
  const [feedback, setFeedback] = useState<string | null>(null)

  const adicionarItem = useCarrinhoLoja((s) => s.adicionarItem)
  const totalPecas = useCarrinhoLoja((s) => s.totalPecas())
  const atingiuMinimo = useCarrinhoLoja((s) => s.atingiuMinimo())

  const { data: produto, isLoading, isError } = useQuery<ProdutoLoja>({
    queryKey: ['loja', 'produto', produtoId],
    queryFn: async () => {
      const res = await fetch('/api/loja/produtos')
      if (!res.ok) throw new Error('Erro')
      const lista: ProdutoLoja[] = await res.json()
      const found = lista.find((p) => p.id === produtoId)
      if (!found) throw new Error('Não encontrado')
      return found
    },
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 rounded-full border-2 border-[#dc2ade] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (isError || !produto) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <p className="text-white/30">Produto não encontrado.</p>
        <Link href="/loja/catalogo" className="text-sm text-[#dc2ade] hover:underline">
          Voltar ao catálogo
        </Link>
      </div>
    )
  }

  const fotos = [produto.foto_url, ...(produto.fotos_urls?.filter((f) => f !== produto.foto_url) ?? [])].filter(Boolean)
  const totalGrade = Object.values(grade).reduce((a, b) => a + b, 0)
  const pecasFaltandoTotal = Math.max(0, 5 - (totalPecas + totalGrade))

  function alterarGrade(tamanho: string, delta: number) {
    const tam = produto!.tamanhos.find((t) => t.tamanho === tamanho)
    if (!tam || tam.estoque === 0) return
    const maxEstoque = tam.estoque === 9999 ? 999 : tam.estoque
    setGrade((g) => {
      const atual = g[tamanho] ?? 0
      const novo = Math.max(0, Math.min(maxEstoque, atual + delta))
      if (novo === 0) {
        const { [tamanho]: _, ...resto } = g
        return resto
      }
      return { ...g, [tamanho]: novo }
    })
  }

  function adicionarGradeAoCarrinho() {
    if (totalGrade === 0) return
    Object.entries(grade).forEach(([tamanho, quantidade]) => {
      if (quantidade > 0) {
        adicionarItem({
          produto_id: produto!.id,
          sku: produto!.sku,
          nome: produto!.nome,
          foto_url: produto!.foto_url,
          preco_unitario: produto!.preco_atacado,
          cor: corSelecionada || produto!.cores[0]?.nome,
          tamanho,
          quantidade,
        })
      }
    })
    setGrade({})
    setFeedback(`${totalGrade} peça${totalGrade !== 1 ? 's' : ''} adicionada${totalGrade !== 1 ? 's' : ''}!`)
    setTimeout(() => setFeedback(null), 2500)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 pb-32">
      {/* Voltar */}
      <Link href="/loja/catalogo"
        className="inline-flex items-center gap-2 text-white/30 hover:text-white text-sm mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Voltar ao catálogo
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">

        {/* Galeria */}
        <div className="space-y-3">
          <div className="relative aspect-square rounded-lg overflow-hidden bg-[#111111] border border-white/[0.08]">
            {fotos[fotoAtiva] ? (
              <img src={fotos[fotoAtiva]} alt={produto.nome} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ShoppingBag className="w-20 h-20 text-white/10" />
              </div>
            )}

            {fotos.length > 1 && (
              <>
                <button onClick={() => setFotoAtiva((f) => Math.max(0, f - 1))}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setFotoAtiva((f) => Math.min(fotos.length - 1, f + 1))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {fotos.map((_, i) => (
                    <button key={i} onClick={() => setFotoAtiva(i)}
                      className={`rounded-full transition-all ${fotoAtiva === i ? 'w-4 h-1.5 bg-[#dc2ade]' : 'w-1.5 h-1.5 bg-white/30'}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {fotos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {fotos.map((foto, i) => (
                <button key={i} onClick={() => setFotoAtiva(i)}
                  className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                    fotoAtiva === i ? 'border-[#dc2ade]' : 'border-white/10'
                  }`}>
                  <img src={foto} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info e grade */}
        <div className="space-y-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#dc2ade] mb-1"
               style={{ fontFamily: 'League Spartan, sans-serif' }}>
              {produto.categoria}
            </p>
            <h1 className="text-3xl sm:text-4xl font-black uppercase text-white leading-tight"
                style={{ fontFamily: 'League Spartan, sans-serif' }}>
              {produto.nome}
            </h1>
            <p className="text-3xl font-black text-[#dc2ade] mt-3"
               style={{ fontFamily: 'League Spartan, sans-serif' }}>
              R$ {produto.preco_atacado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              <span className="text-sm font-normal text-white/30 ml-2">/ par</span>
            </p>
          </div>

          {produto.descricao && (
            <p className="text-sm text-white/40 leading-relaxed">{produto.descricao}</p>
          )}

          {/* Seleção de cor */}
          {produto.cores.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-3"
                 style={{ fontFamily: 'League Spartan, sans-serif' }}>
                Cor {corSelecionada && (
                  <span className="text-white/50 normal-case font-normal">— {corSelecionada}</span>
                )}
              </p>
              <div className="flex gap-3 flex-wrap">
                {produto.cores.map((cor) => (
                  <button key={cor.nome} title={cor.nome}
                    onClick={() => setCorSelecionada((prev) => prev === cor.nome ? '' : cor.nome)}
                    className={`w-9 h-9 rounded-full border-2 transition-all relative flex items-center justify-center ${
                      corSelecionada === cor.nome
                        ? 'border-[#dc2ade] scale-110 shadow-lg shadow-[#dc2ade]/30'
                        : 'border-white/20 hover:border-white/50'
                    }`}
                    style={{ backgroundColor: cor.hex }}>
                    {corSelecionada === cor.nome && <Check className="w-4 h-4 text-white drop-shadow" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Grade de tamanhos */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold uppercase tracking-widest text-white/30"
                 style={{ fontFamily: 'League Spartan, sans-serif' }}>
                Grade de tamanhos
              </p>
              {totalGrade > 0 && (
                <span className="text-xs font-bold text-[#dc2ade] uppercase"
                      style={{ fontFamily: 'League Spartan, sans-serif' }}>
                  {totalGrade} peça{totalGrade !== 1 ? 's' : ''} selecionada{totalGrade !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="space-y-2">
              {produto.tamanhos.map(({ tamanho, estoque }) => {
                const qtd = grade[tamanho] ?? 0
                const semEstoque = estoque === 0
                const maxEstoque = estoque === 9999 ? 999 : estoque
                return (
                  <div key={tamanho}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                      semEstoque
                        ? 'border-white/5 opacity-40'
                        : qtd > 0
                        ? 'border-[#dc2ade]/40 bg-[#dc2ade]/5'
                        : 'border-white/[0.08] hover:border-white/20 bg-[#111111]'
                    }`}>
                    <div className="flex items-center gap-3">
                      <span className="text-base font-black uppercase text-white w-10"
                            style={{ fontFamily: 'League Spartan, sans-serif' }}>
                        {tamanho}
                      </span>
                      {!semEstoque ? (
                        <span className="text-xs text-white/25">
                          {estoque <= 5 && estoque !== 9999 ? `${estoque} disp.` : 'Disponível'}
                        </span>
                      ) : (
                        <span className="text-xs text-white/20">Esgotado</span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <button onClick={() => alterarGrade(tamanho, -1)}
                        disabled={semEstoque || qtd === 0}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                          qtd > 0
                            ? 'bg-[#dc2ade]/20 hover:bg-[#dc2ade]/40 text-[#dc2ade]'
                            : 'bg-white/5 text-white/20 cursor-not-allowed'
                        }`}>
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className={`w-6 text-center text-sm font-black ${qtd > 0 ? 'text-[#dc2ade]' : 'text-white/20'}`}
                            style={{ fontFamily: 'League Spartan, sans-serif' }}>
                        {qtd}
                      </span>
                      <button onClick={() => alterarGrade(tamanho, 1)}
                        disabled={semEstoque || qtd >= maxEstoque}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                          !semEstoque && qtd < maxEstoque
                            ? 'bg-[#dc2ade] hover:bg-[#c41fc7] text-white'
                            : 'bg-white/5 text-white/20 cursor-not-allowed'
                        }`}>
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Subtotal e aviso mínimo */}
          {totalGrade > 0 && (
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-white/40">Subtotal desta seleção</span>
                <span className="font-bold text-white">
                  R$ {(produto.preco_atacado * totalGrade).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              {!atingiuMinimo && pecasFaltandoTotal > 0 && (
                <div className="flex items-center gap-2 text-xs text-orange-400">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    Faltam {pecasFaltandoTotal} peça{pecasFaltandoTotal !== 1 ? 's' : ''} no total para atingir o mínimo de 5
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Botão adicionar */}
          <button
            onClick={adicionarGradeAoCarrinho}
            disabled={totalGrade === 0}
            className={`w-full py-4 rounded-xl text-base font-black uppercase tracking-wider flex items-center justify-center gap-3 transition-all ${
              totalGrade === 0
                ? 'bg-white/5 text-white/20 cursor-not-allowed'
                : feedback
                ? 'bg-[#059669] text-white'
                : 'bg-[#dc2ade] hover:bg-[#c41fc7] text-white shadow-xl shadow-[#dc2ade]/25 active:scale-[0.98]'
            }`}
            style={{ fontFamily: 'League Spartan, sans-serif' }}
          >
            {feedback ? (
              <><Check className="w-5 h-5" />{feedback}</>
            ) : (
              <>
                <ShoppingBag className="w-5 h-5" />
                {totalGrade === 0
                  ? 'Selecione os tamanhos'
                  : `Adicionar ${totalGrade} peça${totalGrade !== 1 ? 's' : ''} ao carrinho`}
              </>
            )}
          </button>
        </div>
      </div>

      <CarrinhoBarra />
    </div>
  )
}
