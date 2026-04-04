import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { ProdutoLoja } from './loja.types'
import { mapProdutoRow } from './loja-mapper'

async function getProdutosDestaque(): Promise<ProdutoLoja[]> {
  try {
    const supabase = createServerSupabaseClient()

    // Buscar tenant principal pelo slug da loja
    const tenantSlug = process.env.LOJA_TENANT_SLUG ?? 'cj-rasteirinhas'
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .single()

    if (!tenant) return []

    const { data: rows } = await supabase
      .from('products')
      .select('id, sku, name, description, price, compare_at_price, stock, image_url, images, category, is_active, custom_fields')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .limit(4)

    return (rows ?? []).map((r) => mapProdutoRow(r as Record<string, unknown>))
  } catch {
    return []
  }
}

export default async function HomeDestaquesServer() {
  const produtos = await getProdutosDestaque()

  return (
    <section className="py-24 max-w-7xl mx-auto px-4 sm:px-6">
      <div className="flex items-end justify-between mb-10">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#dc2ade] mb-2"
             style={{ fontFamily: 'League Spartan, sans-serif' }}>
            Coleção
          </p>
          <h2 className="text-4xl sm:text-5xl font-black uppercase text-white"
              style={{ fontFamily: 'League Spartan, sans-serif' }}>
            Destaques
          </h2>
        </div>
        <Link href="/loja/catalogo"
          className="hidden sm:flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white/40 hover:text-white transition-colors"
          style={{ fontFamily: 'League Spartan, sans-serif' }}>
          Ver todos <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {produtos.length > 0
          ? produtos.map((produto) => (
              <Link key={produto.id} href={`/loja/produto/${produto.id}`}
                className="group aspect-[3/4] rounded-lg overflow-hidden bg-[#111111] border border-white/5 hover:border-[#dc2ade]/30 transition-all relative">
                {produto.foto_url ? (
                  <img src={produto.foto_url} alt={produto.nome}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                    <p className="text-xs text-white/20 uppercase tracking-wider text-center px-2"
                       style={{ fontFamily: 'League Spartan, sans-serif' }}>
                      {produto.nome}
                    </p>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-xs font-bold uppercase text-white truncate"
                     style={{ fontFamily: 'League Spartan, sans-serif' }}>
                    {produto.nome}
                  </p>
                  <p className="text-sm font-black text-[#dc2ade]"
                     style={{ fontFamily: 'League Spartan, sans-serif' }}>
                    R$ {produto.preco_atacado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </Link>
            ))
          : Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-lg bg-[#111111] border border-white/5 flex items-center justify-center">
                <p className="text-xs text-white/10 uppercase tracking-wider"
                   style={{ fontFamily: 'League Spartan, sans-serif' }}>
                  Em breve
                </p>
              </div>
            ))}
      </div>

      <div className="mt-8 text-center sm:hidden">
        <Link href="/loja/catalogo"
          className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#dc2ade]"
          style={{ fontFamily: 'League Spartan, sans-serif' }}>
          Ver catálogo completo <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  )
}
