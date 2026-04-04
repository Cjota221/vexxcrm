'use client'

import { useState } from 'react'
import { ShoppingBag, X, Plus, Minus, Trash2, MessageCircle } from 'lucide-react'
import { useCarrinho } from './useCarrinho'

interface Props {
  whatsapp: string
}

export default function CarrinhoFlutuante({ whatsapp }: Props) {
  const [aberto, setAberto] = useState(false)
  const { itens, removerItem, alterarQuantidade, limparCarrinho, totalItens, totalPreco } =
    useCarrinho()

  const total = totalItens()
  const preco = totalPreco()

  function gerarMensagem(): string {
    if (itens.length === 0) return ''
    const linhas = itens.map((item) => {
      const tam = item.tamanho ? ` | Tam: ${item.tamanho}` : ''
      const subtotal = (item.preco * item.quantidade).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
      })
      return `• ${item.quantidade}x ${item.nome}${tam} — R$ ${subtotal}`
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
        className="relative p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-[#dc2ade]/40 transition-all"
        aria-label="Abrir carrinho"
      >
        <ShoppingBag className="w-5 h-5 text-white/70" />
        {total > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#dc2ade] text-white text-[10px] font-bold flex items-center justify-center">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {/* Overlay */}
      {aberto && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          onClick={() => setAberto(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-sm bg-[#161b24] border-l border-white/10 z-50 flex flex-col transition-transform duration-300 ${
          aberto ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#dc2ade]" />
            <span className="font-semibold text-white text-sm">Meu Carrinho</span>
            {total > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#dc2ade]/15 text-[#dc2ade] text-xs font-bold">
                {total} {total === 1 ? 'item' : 'itens'}
              </span>
            )}
          </div>
          <button
            onClick={() => setAberto(false)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {itens.length === 0 ? (
            <div className="text-center py-16">
              <ShoppingBag className="w-12 h-12 text-white/10 mx-auto mb-3" />
              <p className="text-white/30 text-sm">Carrinho vazio</p>
              <p className="text-white/20 text-xs mt-1">Adicione produtos para continuar</p>
            </div>
          ) : (
            itens.map((item, idx) => (
              <div
                key={`${item.produto_id}-${item.tamanho ?? ''}-${idx}`}
                className="flex gap-3 p-3 rounded-xl bg-white/4 border border-white/8"
              >
                <img
                  src={item.foto_url}
                  alt={item.nome}
                  className="w-16 h-16 rounded-lg object-cover bg-white/5 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white leading-tight line-clamp-2">
                    {item.nome}
                  </p>
                  {item.tamanho && (
                    <p className="text-[11px] text-white/40 mt-0.5">Tam {item.tamanho}</p>
                  )}
                  <p className="text-sm font-bold text-[#dc2ade] mt-1">
                    R${' '}
                    {(item.preco * item.quantidade).toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                    })}
                  </p>

                  {/* Controles */}
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() =>
                        alterarQuantidade(item.produto_id, item.tamanho, item.quantidade - 1)
                      }
                      className="w-6 h-6 rounded-md bg-white/8 hover:bg-white/15 flex items-center justify-center transition-colors"
                    >
                      <Minus className="w-3 h-3 text-white/60" />
                    </button>
                    <span className="text-sm font-semibold text-white w-4 text-center">
                      {item.quantidade}
                    </span>
                    <button
                      onClick={() =>
                        alterarQuantidade(item.produto_id, item.tamanho, item.quantidade + 1)
                      }
                      className="w-6 h-6 rounded-md bg-white/8 hover:bg-white/15 flex items-center justify-center transition-colors"
                    >
                      <Plus className="w-3 h-3 text-white/60" />
                    </button>
                    <button
                      onClick={() => removerItem(item.produto_id, item.tamanho)}
                      className="ml-auto p-1 rounded-md hover:bg-red-500/15 text-white/20 hover:text-red-400 transition-colors"
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
          <div className="p-4 border-t border-white/10 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-white/50">Total estimado</span>
              <span className="text-lg font-bold text-white">
                R${' '}
                {preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
              className="w-full py-2 rounded-xl text-white/30 hover:text-white/60 text-xs transition-colors"
            >
              Limpar carrinho
            </button>
          </div>
        )}
      </div>
    </>
  )
}
