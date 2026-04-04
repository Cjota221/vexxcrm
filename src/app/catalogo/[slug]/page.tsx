import { Suspense } from 'react'
import type { Metadata } from 'next'
import CatalogoCliente from './CatalogoCliente'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await params
  return {
    title: 'Catálogo',
    description: 'Conheça nossos produtos',
    openGraph: {
      title: 'Catálogo',
      type: 'website',
    },
  }
}

export default async function CatalogoPage({ params }: Props) {
  const { slug } = await params

  return (
    <main className="min-h-screen bg-gray-50">
      <Suspense fallback={<CatalogoSkeleton />}>
        <CatalogoCliente slug={slug} whatsapp="" />
      </Suspense>
    </main>
  )
}

function CatalogoSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header skeleton */}
      <div className="h-14 bg-white border-b border-gray-200 animate-pulse" />
      {/* Grid skeleton */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-gray-200 animate-pulse aspect-[3/4]" />
          ))}
        </div>
      </div>
    </div>
  )
}
