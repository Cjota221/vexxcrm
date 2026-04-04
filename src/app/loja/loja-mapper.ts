import type { ProdutoLoja, TamanhoProduto, CorProduto } from './loja.types'

function extrairTamanhos(customFields: unknown): TamanhoProduto[] {
  if (!customFields || typeof customFields !== 'object') return []
  const cf = customFields as Record<string, unknown>
  const variations = cf.variations as Array<{ name: string; stock: number; is_active?: boolean }> | undefined
  if (!Array.isArray(variations) || variations.length === 0) return []
  return variations
    .filter((v) => v.name)
    .map((v) => ({
      tamanho: v.name,
      estoque: v.stock === -1 ? 9999 : (v.stock ?? 0),
    }))
}

function extrairCores(customFields: unknown): CorProduto[] {
  if (!customFields || typeof customFields !== 'object') return []
  const cf = customFields as Record<string, unknown>
  const cores = cf.cores as Array<{ nome: string; hex?: string }> | undefined
  if (!Array.isArray(cores)) return []
  return cores.filter((c) => c.nome).map((c) => ({ nome: c.nome, hex: c.hex ?? '#888888' }))
}

export function mapProdutoRow(p: Record<string, unknown>): ProdutoLoja {
  const images = Array.isArray(p.images) ? (p.images as string[]).filter(Boolean) : []
  const fotoUrl = (p.image_url as string | null) || images[0] || ''
  const tamanhos = extrairTamanhos(p.custom_fields)
  const estoqueTotal = tamanhos.length > 0
    ? tamanhos.reduce((acc, t) => acc + (t.estoque === 9999 ? 1 : t.estoque), 0)
    : typeof p.stock === 'number' ? (p.stock === -1 ? 9999 : p.stock) : 0

  // FacilZap: price = preço efetivo (com desconto), compare_at_price = original
  const price = typeof p.price === 'number' ? p.price : Number(p.price) || 0
  const compareAt = typeof p.compare_at_price === 'number' && p.compare_at_price > price ? p.compare_at_price : null
  const precoAtacado = compareAt ?? price

  return {
    id: String(p.id),
    sku: (p.sku as string) || String(p.id),
    nome: (p.name as string) || 'Produto',
    descricao: (p.description as string | null) || undefined,
    preco_atacado: precoAtacado,
    foto_url: fotoUrl,
    fotos_urls: images.length > 1 ? images : undefined,
    categoria: (p.category as string | null) || 'Geral',
    cores: extrairCores(p.custom_fields),
    tamanhos,
    estoque_total: estoqueTotal,
    ativo: Boolean(p.is_active),
    destaque: false,
    novidade: false,
  }
}
