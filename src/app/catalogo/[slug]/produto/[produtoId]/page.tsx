import { Suspense } from 'react'
import type { Metadata } from 'next'
import ProdutoDetalheCliente from './ProdutoDetalheCliente'

interface Props {
  params: Promise<{ slug: string; produtoId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  return {
    title: 'Produto | Catálogo',
    description: 'Detalhes do produto',
    openGraph: {
      title: 'Produto | Catálogo',
      type: 'website',
    },
    alternates: {
      canonical: `/catalogo/${slug}`,
    },
  }
}

export default async function ProdutoDetalhePage({ params }: Props) {
  const { slug, produtoId } = await params

  return (
    <main className="min-h-screen bg-gray-50">
      <Suspense fallback={<ProdutoDetalheSkeleton />}>
        <ProdutoDetalheCliente slug={slug} produtoId={produtoId} />
      </Suspense>
    </main>
  )
}

function ProdutoDetalheSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header skeleton */}
      <div className="h-14 bg-white border-b border-gray-200 animate-pulse" />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="aspect-square rounded-2xl bg-gray-200 animate-pulse" />
          <div className="space-y-4">
            <div className="h-6 bg-gray-200 rounded-lg animate-pulse w-3/4" />
            <div className="h-10 bg-gray-200 rounded-lg animate-pulse w-1/2" />
            <div className="h-4 bg-gray-200 rounded-lg animate-pulse" />
            <div className="h-4 bg-gray-200 rounded-lg animate-pulse w-5/6" />
            <div className="h-12 bg-gray-200 rounded-xl animate-pulse mt-8" />
          </div>
        </div>
      </div>
    </div>
  )
}
