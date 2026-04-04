'use client'

import { useState } from 'react'
import { ShoppingBag, X, Plus, Minus, Trash2, MessageCircle } from 'lucide-react'
import { useCarrinho } from './useCarrinho'

interface Props {
  whatsapp: string
  corPrimaria?: string
}

export default function CarrinhoFlutuante({ whatsapp, corPrimaria = '#dc2ade' }: Props) {
  const [aberto, setAberto] = useState(false)
  const { itens, removerItem, alterarQuantidade, limparCarrinho, totalItens, totalPreco } =
    useCarrinho()

  const total = totalItens()
  const preco = totalPreco()

  function gerarMensagem(): string {
    if (itens.length === 0) return ''
    const linhas = itens.map((item) => {
      const cor = item.cor ? ` | Cor: ${item.cor}` : ''
      const tam = item.tamanho ? ` | Tam: ${item.tamanho}` : ''
      const subtotal = (item.preco * item.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      return `• ${item.quantidade}x ${item.nome}${cor}${tam} — R$ ${subtotal}`
    })
    const totalFmt = preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    return encodeURIComponent(
      ['Olá! Gostaria de fazer um pedido:', '', ...linhas, '', `*Total estimado: R$ ${totalFmt}*`, '', 'Aguardo confirmação! 😊'].join('\n')
    )
  }

  function finalizarPedido() {
    const msg = gerarMensagem()
    if (!msg) return
    window.open(`https://wa.me/${whatsapp}?text=${msg}`, '_blank')
  }

  return (
    <>
      {/* Botão no header */}
      <button
        onClick={() => setAberto(true)}
        className="relative p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 transition-all"
        aria-label="Abrir carrinho"
      >
        <ShoppingBag className="w-5 h-5 text-gray-600" />
        {total > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
            style={{ backgroundColor: corPrimaria }}
          >
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {/* Overlay */}
      {aberto && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          onClick={() => setAberto(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-sm bg-white border-l border-gray-200 z-50 flex flex-col transition-transform duration-300 shadow-2xl ${
          aberto ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" style={{ color: corPrimaria }} />
            <span className="font-semibold text-gray-900 text-sm">Meu Carrinho</span>
            {total > 0 && (
              <span
                className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: corPrimaria }}
              >
                {total} {total === 1 ? 'item' : 'itens'}
              </span>
            )}
          </div>
          <button
            onClick={() => setAberto(false)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {itens.length === 0 ? (
            <div className="text-center py-16">
              <ShoppingBag className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Carrinho vazio</p>
              <p className="text-gray-300 text-xs mt-1">Adicione produtos para continuar</p>
            </div>
          ) : (
            itens.map((item, idx) => (
              <div
                key={`${item.produto_id}-${item.cor ?? ''}-${item.tamanho ?? ''}-${idx}`}
                className="flex gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100"
              >
                <img
                  src={item.foto_url}
                  alt={item.nome}
                  className="w-16 h-16 rounded-lg object-cover bg-gray-200 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 leading-tight line-clamp-2">
                    {item.nome}
                  </p>
                  {(item.tamanho || item.cor) && (
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {item.cor && <>Cor: {item.cor}</>}
                      {item.cor && item.tamanho && ' · '}
                      {item.tamanho && <>Tam: {item.tamanho}</>}
                    </p>
                  )}
                  <p className="text-sm font-bold mt-1" style={{ color: corPrimaria }}>
                    R$ {(item.preco * item.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>

                  {/* Controles */}
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => alterarQuantidade(item.produto_id, item.cor, item.tamanho, item.quantidade - 1)}
                      className="w-6 h-6 rounded-md bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
                    >
                      <Minus className="w-3 h-3 text-gray-600" />
                    </button>
                    <span className="text-sm font-semibold text-gray-800 w-4 text-center">
                      {item.quantidade}
                    </span>
                    <button
                      onClick={() => alterarQuantidade(item.produto_id, item.cor, item.tamanho, item.quantidade + 1)}
                      className="w-6 h-6 rounded-md bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
                    >
                      <Plus className="w-3 h-3 text-gray-600" />
                    </button>
                    <button
                      onClick={() => removerItem(item.produto_id, item.cor, item.tamanho)}
                      className="ml-auto p-1 rounded-md hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {itens.length > 0 && (
          <div className="p-4 border-t border-gray-100 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Total estimado</span>
              <span className="text-lg font-bold text-gray-900">
                R$ {preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <button
              onClick={finalizarPedido}
              className="w-full py-3.5 rounded-xl bg-[#25D366] hover:bg-[#1fba57] text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-500/20 active:scale-95"
            >
              <MessageCircle className="w-5 h-5" />
              Finalizar pelo WhatsApp
            </button>
            <button
              onClick={limparCarrinho}
              className="w-full py-2 rounded-xl text-gray-400 hover:text-gray-600 text-xs transition-colors"
            >
              Limpar carrinho
            </button>
          </div>
        )}
      </div>
    </>
  )
}
