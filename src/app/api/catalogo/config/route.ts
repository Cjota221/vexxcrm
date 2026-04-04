import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get('slug')
    if (!slug) {
      return NextResponse.json({ error: 'slug obrigatório' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('id, slug, name, config')
      .eq('slug', slug)
      .single()

    if (error || !tenant) {
      return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 })
    }

    const cfg = (tenant.config as Record<string, unknown> | null) ?? {}
    const catalogoCfg = (cfg.catalogo as Record<string, unknown> | null) ?? {}

    return NextResponse.json({
      tenant_slug: tenant.slug,
      nome_loja: (catalogoCfg.nome_loja as string | null) || tenant.name,
      logo_url: (catalogoCfg.logo_url as string | null) ?? null,
      cor_primaria: (catalogoCfg.cor_primaria as string | null) ?? '#dc2ade',
      whatsapp: (catalogoCfg.whatsapp as string | null) ?? '5562981480687',
      banner_url: (catalogoCfg.banner_url as string | null) ?? null,
      descricao_loja: (catalogoCfg.descricao_loja as string | null) ?? null,
    })
  } catch (err) {
    console.error('[catalogo/config]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
