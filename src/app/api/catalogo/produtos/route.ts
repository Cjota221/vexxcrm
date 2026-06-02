import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { ProdutoCatalogo } from '@/app/catalogo/[slug]/catalogo.types'

// Cache em memória por slug (60s) — evita múltiplas leituras do Supabase
const cache = new Map<string, { data: ProdutoCatalogo[]; ts: number }>()
const CACHE_TTL = 60_000

type VariacaoCatalogo = {
  nome: string
  estoque: number
  ativa: boolean
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

/**
 * Extrai variações/tamanhos em formatos antigos e novos do custom_fields.
 */
function extrairVariacoes(customFields: unknown): VariacaoCatalogo[] {
  if (!customFields || typeof customFields !== 'object') return []

  const cf = customFields as Record<string, unknown>
  const rawVariations =
    (Array.isArray(cf.variations) && cf.variations) ||
    (Array.isArray(cf.variacoes) && cf.variacoes) ||
    (Array.isArray(cf.sizes) && cf.sizes) ||
    []

  if (!Array.isArray(rawVariations) || rawVariations.length === 0) return []

  return rawVariations
    .map((item) => {
      if (!item || typeof item !== 'object') return null

      const variacao = item as Record<string, unknown>
      const nome = String(
        variacao.name ??
        variacao.nome ??
        variacao.tamanho ??
        variacao.label ??
        ''
      ).trim()

      const estoqueObj =
        variacao.estoque && typeof variacao.estoque === 'object'
          ? (variacao.estoque as Record<string, unknown>)
          : null

      const estoque = estoqueObj
        ? toNumber(estoqueObj.estoque ?? estoqueObj.quantidade ?? estoqueObj.stock)
        : toNumber(variacao.stock ?? variacao.estoque ?? variacao.quantidade)

      const ativa = variacao.is_active !== false && variacao.ativada !== false

      if (!nome) return null

      return { nome, estoque, ativa }
    })
    .filter((variacao): variacao is VariacaoCatalogo => Boolean(variacao))
}

/**
 * Extrai tamanhos/variações do custom_fields do produto.
 */
function extrairTamanhos(customFields: unknown): string[] {
  return extrairVariacoes(customFields)
    .filter((v) => v.ativa && (v.estoque === -1 || v.estoque > 0))
    .map((v) => v.nome)
}

/**
 * Extrai cores do custom_fields do produto.
 * Formato esperado: custom_fields.cores = [{ nome, hex, estoque }]
 */
function extrairCores(customFields: unknown): Array<{ nome: string; hex: string; estoque: number }> {
  if (!customFields || typeof customFields !== 'object') return []
  const cf = customFields as Record<string, unknown>
  const cores = cf.cores as Array<{ nome: string; hex?: string; estoque?: number }> | undefined
  if (!Array.isArray(cores) || cores.length === 0) return []
  return cores
    .filter((c) => c.nome)
    .map((c) => ({ nome: c.nome, hex: c.hex ?? '#888888', estoque: c.estoque ?? 0 }))
}

function produtoTemEstoque(rawStock: unknown, customFields: unknown): boolean {
  const stock = toNumber(rawStock)
  if (stock === -1 || stock > 0) return true

  return extrairVariacoes(customFields).some(
    (variacao) => variacao.ativa && (variacao.estoque === -1 || variacao.estoque > 0)
  )
}

function mapRow(p: Record<string, unknown>, ordem?: number, destaque?: boolean): ProdutoCatalogo {
  const images = Array.isArray(p.images) ? (p.images as string[]).filter(Boolean) : []
  const fotoUrl = (p.image_url as string | null) || images[0] || ''
  const variacoes = extrairVariacoes(p.custom_fields)
  const tamanhos = variacoes
    .filter((v) => v.ativa && (v.estoque === -1 || v.estoque > 0))
    .map((v) => v.nome)

  // Estoque: -1 significa sem controle (tratar como disponível)
  const estoqueVariacoes = variacoes.reduce((acc, variacao) => {
    if (!variacao.ativa) return acc
    if (variacao.estoque === -1) return 9999
    return acc + Math.max(0, variacao.estoque)
  }, 0)
  const estoqueRaw = toNumber(p.stock)
  const estoque = estoqueVariacoes > 0
    ? estoqueVariacoes
    : estoqueRaw === -1
      ? 9999
      : estoqueRaw

  // Normalizer FacilZap: price = preço efetivo (já com desconto se houver),
  // compare_at_price = preço original (mais alto, riscado).
  const price = typeof p.price === 'number' ? p.price : Number(p.price) || 0
  const compareAt =
    typeof p.compare_at_price === 'number' && p.compare_at_price > 0
      ? p.compare_at_price
      : null
  const hasDiscount = compareAt !== null && compareAt > price

  return {
    id: String(p.id),
    sku: (p.sku as string) || String(p.id),
    nome: (p.name as string) || 'Produto',
    descricao: (p.description as string | null) || undefined,
    preco: hasDiscount ? compareAt! : price,
    preco_promocional: hasDiscount ? price : undefined,
    foto_url: fotoUrl,
    fotos_urls: images.length > 1 ? images : undefined,
    categoria: (p.category as string | null) || 'Geral',
    cores: extrairCores(p.custom_fields),
    tamanhos,
    estoque,
    ativo: Boolean(p.is_active),
    destaque: destaque ?? false,
    ordem,
  }
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

    // Verificar se existe curadoria ativa para este tenant
    const { count: curadoriaCount } = await supabase
      .from('catalogo_produtos')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('ativo', true)

    let produtos: ProdutoCatalogo[]

    if (curadoriaCount && curadoriaCount > 0) {
      // === MODO CURADORIA: buscar apenas produtos curados, JOIN com products ===
      const { data: curados, error: curErr } = await supabase
        .from('catalogo_produtos')
        .select('produto_id, ordem, destaque')
        .eq('tenant_id', tenant.id)
        .eq('ativo', true)
        .order('ordem', { ascending: true })

      if (curErr) {
        console.error('[catalogo/produtos] Erro na curadoria:', curErr.message)
        return NextResponse.json({ error: 'Erro ao carregar curadoria' }, { status: 500 })
      }

      const ids = (curados ?? []).map((c) => c.produto_id as string)
      if (ids.length === 0) {
        cache.set(slug, { data: [], ts: Date.now() })
        return NextResponse.json([])
      }

      const { data: rows, error: prodError } = await supabase
        .from('products')
        .select('id, sku, name, description, price, compare_at_price, stock, image_url, images, category, is_active, custom_fields')
        .in('id', ids)
        .eq('is_active', true)

      if (prodError) {
        console.error('[catalogo/produtos] Erro ao buscar produtos curados:', prodError.message)
        return NextResponse.json({ error: 'Erro ao carregar produtos' }, { status: 500 })
      }

      // Preservar ordenação da curadoria
      const ordemMap = new Map(
        (curados ?? []).map((c) => [c.produto_id as string, { ordem: c.ordem as number, destaque: c.destaque as boolean }])
      )

      produtos = (rows ?? [])
        .map((p) => {
          const meta = ordemMap.get(String(p.id))
          return mapRow(p as Record<string, unknown>, meta?.ordem, meta?.destaque)
        })
        .filter((p) => p.estoque > 0)
        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    } else {
      // === MODO CATÁLOGO COMPLETO: todos os produtos ativos do tenant ===
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

      produtos = (rows ?? [])
        .filter((p) => produtoTemEstoque(p.stock, p.custom_fields))
        .map((p) => mapRow(p as Record<string, unknown>))
        .filter((p) => p.estoque > 0)
    }

    // Salvar em cache
    cache.set(slug, { data: produtos, ts: Date.now() })

    return NextResponse.json(produtos)
  } catch (err) {
    console.error('[catalogo/produtos]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
