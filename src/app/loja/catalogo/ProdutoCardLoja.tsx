'use client'

import Link from 'next/link'
import { ShoppingBag, AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { useCarrinhoLoja } from '../useCarrinhoLoja'
import type { ProdutoLoja } from '../loja.types'

interface Props {
  produto: ProdutoLoja
}

export default function ProdutoCardLoja({ produto }: Props) {
  const [adicionado, setAdicionado] = useState(false)
  const adicionarItem = useCarrinhoLoja((s) => s.adicionarItem)
  const semEstoque = produto.estoque_total === 0
  const estoqueBaixo = produto.estoque_total > 0 && produto.estoque_total <= 10

  function handleAdicionarRapido(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (semEstoque) return
    const tamanhoDisponivel = produto.tamanhos.find((t) => t.estoque > 0)
    if (!tamanhoDisponivel) return
    adicionarItem({
      produto_id: produto.id,
      sku: produto.sku,
      nome: produto.nome,
      foto_url: produto.foto_url,
      preco_unitario: produto.preco_atacado,
      cor: produto.cores[0]?.nome,
      tamanho: tamanhoDisponivel.tamanho,
      quantidade: 1,
    })
    setAdicionado(true)
    setTimeout(() => setAdicionado(false), 1800)
  }

  return (
    <Link href={`/loja/produto/${produto.id}`} className="group block">
      <div className={`rounded-lg overflow-hidden border transition-all duration-300 bg-[#111111] ${
        semEstoque ? 'border-white/5 opacity-50' : 'border-white/[0.08] hover:border-[#dc2ade]/30'
      }`}>

        {/* Foto */}
        <div className="relative aspect-[3/4] overflow-hidden bg-[#1a1a1a]">
          {produto.foto_url ? (
            <img src={produto.foto_url} alt={produto.nome}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ShoppingBag className="w-10 h-10 text-white/10" />
            </div>
          )}

          {/* Badges */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {produto.novidade && (
              <span className="px-2 py-0.5 text-[10px] font-black uppercase bg-[#e8f044] text-black rounded"
                    style={{ fontFamily: 'League Spartan, sans-serif' }}>
                Novo
              </span>
            )}
            {produto.destaque && !produto.novidade && (
              <span className="px-2 py-0.5 text-[10px] font-black uppercase bg-[#dc2ade] text-white rounded"
                    style={{ fontFamily: 'League Spartan, sans-serif' }}>
                Destaque
              </span>
            )}
            {estoqueBaixo && (
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-orange-500/90 text-white rounded flex items-center gap-1">
                <AlertCircle className="w-2.5 h-2.5" /> Últimas
              </span>
            )}
            {semEstoque && (
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-white/10 text-white/40 rounded">
                Esgotado
              </span>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="p-3 space-y-2">
          <div>
            <p className="text-[10px] text-white/25 uppercase tracking-wider">{produto.categoria}</p>
            <h3 className="text-sm font-bold text-white uppercase leading-tight mt-0.5 line-clamp-2"
                style={{ fontFamily: 'League Spartan, sans-serif' }}>
              {produto.nome}
            </h3>
          </div>

          <p className="text-base font-black text-[#dc2ade]"
             style={{ fontFamily: 'League Spartan, sans-serif' }}>
            R$ {produto.preco_atacado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            <span className="text-xs font-normal text-white/30 ml-1">/ par</span>
          </p>

          {/* Preview tamanhos */}
          {produto.tamanhos.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {produto.tamanhos.slice(0, 5).map((t) => (
                <span key={t.tamanho}
                  className={`px-1.5 py-0.5 text-[10px] rounded border ${
                    t.estoque > 0 ? 'border-white/15 text-white/50' : 'border-white/5 text-white/20 line-through'
                  }`}>
                  {t.tamanho}
                </span>
              ))}
              {produto.tamanhos.length > 5 && (
                <span className="px-1.5 py-0.5 text-[10px] text-white/25">
                  +{produto.tamanhos.length - 5}
                </span>
              )}
            </div>
          )}

          {/* Botão rápido */}
          <button
            onClick={handleAdicionarRapido}
            disabled={semEstoque}
            className={`w-full py-2 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
              semEstoque
                ? 'bg-white/5 text-white/20 cursor-not-allowed'
                : adicionado
                ? 'bg-[#059669] text-white'
                : 'bg-[#dc2ade]/10 hover:bg-[#dc2ade] text-[#dc2ade] hover:text-white border border-[#dc2ade]/30 hover:border-transparent'
            }`}
            style={{ fontFamily: 'League Spartan, sans-serif' }}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            {adicionado ? 'Adicionado!' : semEstoque ? 'Esgotado' : 'Adicionar'}
          </button>
        </div>
      </div>
    </Link>
  )
}
