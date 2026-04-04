export interface ProdutoCatalogo {
  id: string
  sku: string
  nome: string
  descricao?: string
  preco: number
  preco_promocional?: number
  foto_url: string
  fotos_urls?: string[]
  categoria: string
  tamanhos: string[]
  estoque: number
  ativo: boolean
}

export interface ItemCarrinho {
  produto_id: string
  sku: string
  nome: string
  foto_url: string
  preco: number
  tamanho?: string
  quantidade: number
}

export interface ConfiguracaoCatalogo {
  tenant_slug: string
  nome_loja: string
  logo_url?: string
  cor_primaria: string
  whatsapp: string
  banner_url?: string
  descricao_loja?: string
}
