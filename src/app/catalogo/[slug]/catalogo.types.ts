export interface CorProduto {
  nome: string
  hex: string
  estoque: number
}

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
  cores: CorProduto[]
  tamanhos: string[]
  estoque: number
  ativo: boolean
  destaque?: boolean
  ordem?: number
}

export interface ItemCarrinho {
  produto_id: string
  sku: string
  nome: string
  foto_url: string
  preco: number
  cor?: string
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

// Produto curado (selecionado pelo tenant para o catálogo)
export interface ProdutoCurado {
  id: string
  produto_id: string
  produto_sku: string
  produto_nome: string
  produto_foto_url: string
  produto_preco: number
  ordem: number
  destaque: boolean
  ativo: boolean
}
