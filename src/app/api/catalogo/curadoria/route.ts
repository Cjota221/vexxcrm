import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getTenantFromRequest } from '@/lib/auth-helpers'

/**
 * GET /api/catalogo/curadoria
 * Lista todos os produtos curados do tenant autenticado.
 */
export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(req)
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('catalogo_produtos')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('ordem', { ascending: true })

    if (error) {
      console.error('[curadoria GET]', error.message)
      return NextResponse.json({ error: 'Erro ao buscar curadoria' }, { status: 500 })
    }

    return NextResponse.json(data ?? [])
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Não autorizado'
    return NextResponse.json({ error: msg }, { status: 401 })
  }
}

/**
 * POST /api/catalogo/curadoria
 * Adiciona ou atualiza um produto curado (upsert por tenant_id + produto_id).
 * Body: { produto_id, produto_sku?, produto_nome?, produto_foto_url?, produto_preco?, ordem?, destaque?, ativo? }
 */
export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(req)
    const body = await req.json()

    const { produto_id, produto_sku, produto_nome, produto_foto_url, produto_preco, ordem, destaque, ativo } = body

    if (!produto_id) {
      return NextResponse.json({ error: 'produto_id obrigatório' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('catalogo_produtos')
      .upsert(
        {
          tenant_id: tenantId,
          produto_id,
          produto_sku: produto_sku ?? null,
          produto_nome: produto_nome ?? null,
          produto_foto_url: produto_foto_url ?? null,
          produto_preco: produto_preco ?? null,
          ordem: ordem ?? 0,
          destaque: destaque ?? false,
          ativo: ativo !== undefined ? ativo : true,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,produto_id' }
      )
      .select()
      .single()

    if (error) {
      console.error('[curadoria POST]', error.message)
      return NextResponse.json({ error: 'Erro ao salvar produto curado' }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Não autorizado'
    return NextResponse.json({ error: msg }, { status: 401 })
  }
}

/**
 * DELETE /api/catalogo/curadoria?produto_id=xxx
 * Remove um produto da curadoria do tenant.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(req)
    const produtoId = req.nextUrl.searchParams.get('produto_id')

    if (!produtoId) {
      return NextResponse.json({ error: 'produto_id obrigatório' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
      .from('catalogo_produtos')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('produto_id', produtoId)

    if (error) {
      console.error('[curadoria DELETE]', error.message)
      return NextResponse.json({ error: 'Erro ao remover produto' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Não autorizado'
    return NextResponse.json({ error: msg }, { status: 401 })
  }
}

/**
 * PATCH /api/catalogo/curadoria
 * Atualiza ordem de múltiplos produtos de uma vez.
 * Body: { itens: Array<{ produto_id: string; ordem: number }> }
 */
export async function PATCH(req: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(req)
    const body = await req.json()
    const itens: Array<{ produto_id: string; ordem: number }> = body.itens ?? []

    if (!Array.isArray(itens) || itens.length === 0) {
      return NextResponse.json({ error: 'itens obrigatório' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Atualizar cada item individualmente (Supabase não suporta bulk update diretamente)
    const updates = itens.map(({ produto_id, ordem }) =>
      supabase
        .from('catalogo_produtos')
        .update({ ordem, atualizado_em: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('produto_id', produto_id)
    )

    await Promise.all(updates)

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Não autorizado'
    return NextResponse.json({ error: msg }, { status: 401 })
  }
}
