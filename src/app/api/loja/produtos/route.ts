import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { mapProdutoRow } from '@/app/loja/loja-mapper'
import type { ProdutoLoja } from '@/app/loja/loja.types'

const cache = new Map<string, { data: ProdutoLoja[]; ts: number }>()
const CACHE_TTL = 60_000

export async function GET(req: NextRequest) {
  try {
    const categoria = req.nextUrl.searchParams.get('categoria') ?? ''
    const cacheKey = `loja_${categoria}`

    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(cached.data)
    }

    const supabase = createServerSupabaseClient()

    // Buscar tenant principal da loja pelo slug (configurável via env)
    const tenantSlug = process.env.LOJA_TENANT_SLUG ?? 'cj-rasteirinhas'
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .single()

    if (tenantError || !tenant) {
      console.error('[loja/produtos] Tenant não encontrado:', tenantSlug)
      return NextResponse.json({ error: 'Loja não configurada' }, { status: 404 })
    }

    let query = supabase
      .from('products')
      .select('id, sku, name, description, price, compare_at_price, stock, image_url, images, category, is_active, custom_fields')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(500)

    if (categoria && categoria !== 'todas') {
      query = query.eq('category', categoria)
    }

    const { data: rows, error } = await query

    if (error) {
      console.error('[loja/produtos] Erro ao buscar produtos:', error.message)
      return NextResponse.json({ error: 'Erro ao carregar produtos' }, { status: 500 })
    }

    const produtos = (rows ?? []).map((r) => mapProdutoRow(r as Record<string, unknown>))

    cache.set(cacheKey, { data: produtos, ts: Date.now() })
    return NextResponse.json(produtos)
  } catch (err) {
    console.error('[loja/produtos]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
