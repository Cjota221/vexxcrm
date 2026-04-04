export interface ProdutoLoja {
  id: string
  sku: string
  nome: string
  descricao?: string
  preco_atacado: number
  foto_url: string
  fotos_urls?: string[]
  categoria: string
  cores: CorProduto[]
  tamanhos: TamanhoProduto[]
  estoque_total: number
  ativo: boolean
  destaque?: boolean
  novidade?: boolean
}

export interface CorProduto {
  nome: string
  hex: string
}

export interface TamanhoProduto {
  tamanho: string
  estoque: number
}

export interface ItemCarrinhoLoja {
  produto_id: string
  sku: string
  nome: string
  foto_url: string
  preco_unitario: number
  cor?: string
  tamanho: string
  quantidade: number
}

export interface GradeSelecao {
  [tamanho: string]: number
}

export interface DadosRevendedora {
  nome: string
  cpf_cnpj?: string
  telefone: string
  email?: string
  instagram?: string
}

export interface EnderecoEntrega {
  cep: string
  logradouro: string
  numero: string
  complemento?: string
  bairro: string
  cidade: string
  estado: string
}

export interface SimulacaoFrete {
  servico: string
  prazo: string
  valor: number
}
