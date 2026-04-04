import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { ProdutoCatalogo } from '@/app/catalogo/[slug]/catalogo.types'

// Cache em memória por slug (60s) — evita múltiplas leituras do Supabase
const cache = new Map<string, { data: ProdutoCatalogo[]; ts: number }>()
const CACHE_TTL = 60_000

/**
 * Extrai tamanhos/variações do custom_fields do produto.
 * O FacilZap armazena variações (tamanhos) em custom_fields.variations.
 */
function extrairTamanhos(customFields: unknown): string[] {
  if (!customFields || typeof customFields !== 'object') return []
  const cf = customFields as Record<string, unknown>
  const variations = cf.variations as Array<{
    name: string
    stock: number
    is_active?: boolean
  }> | undefined

  if (!Array.isArray(variations) || variations.length === 0) return []

  return variations
    .filter((v) => v.is_active !== false && (v.stock === -1 || v.stock > 0))
    .map((v) => v.name)
    .filter(Boolean)
}

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get('slug')
    if (!slug) {
      return NextResponse.json({ error: 'slug obrigatório' }, { status: 400 })
    }

    // Verificar cache
    const cached = cache.get(slug)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(cached.data)
    }

    const supabase = createServerSupabaseClient()

    // Buscar tenant pelo slug
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 })
    }

    // Buscar produtos ativos do tenant (já sincronizados do FacilZap)
    const { data: rows, error: prodError } = await supabase
      .from('products')
      .select('id, sku, name, description, price, compare_at_price, stock, image_url, images, category, is_active, custom_fields')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(500)

    if (prodError) {
      console.error('[catalogo/produtos] Erro ao buscar produtos:', prodError.message)
      return NextResponse.json({ error: 'Erro ao carregar produtos' }, { status: 500 })
    }

    const produtos: ProdutoCatalogo[] = (rows ?? []).map((p) => {
      const images = Array.isArray(p.images) ? p.images.filter(Boolean) : []
      const fotoUrl = (p.image_url as string | null) || images[0] || ''

      // Estoque: -1 significa sem controle (tratar como disponível)
      const estoqueRaw = typeof p.stock === 'number' ? p.stock : 0
      const estoque = estoqueRaw === -1 ? 9999 : estoqueRaw

      return {
        id: String(p.id),
        sku: (p.sku as string) || String(p.id),
        nome: (p.name as string) || 'Produto',
        descricao: (p.description as string | null) || undefined,
        // Normalizer FacilZap: price = preço efetivo (já com desconto se houver),
        // compare_at_price = preço original (mais alto, riscado).
        // No catálogo: preco = regular (maior), preco_promocional = desconto (menor).
        ...((): { preco: number; preco_promocional?: number } => {
          const price = typeof p.price === 'number' ? p.price : Number(p.price) || 0
          const compareAt =
            typeof p.compare_at_price === 'number' && p.compare_at_price > 0
              ? p.compare_at_price
              : null
          const hasDiscount = compareAt !== null && compareAt > price
          return {
            preco: hasDiscount ? compareAt : price,
            preco_promocional: hasDiscount ? price : undefined,
          }
        })(),
        foto_url: fotoUrl,
        fotos_urls: images.length > 1 ? images : undefined,
        categoria: (p.category as string | null) || 'Geral',
        tamanhos: extrairTamanhos(p.custom_fields),
        estoque,
        ativo: Boolean(p.is_active),
      }
    })

    // Salvar em cache
    cache.set(slug, { data: produtos, ts: Date.now() })

    return NextResponse.json(produtos)
  } catch (err) {
    console.error('[catalogo/produtos]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
