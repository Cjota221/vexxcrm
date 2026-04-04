import { Suspense } from 'react'
import type { Metadata } from 'next'
import CatalogoCliente from './CatalogoCliente'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  return {
    title: 'Catálogo | CJ Rasteirinhas',
    description: 'Conheça nossa coleção de rasteirinhas e sandálias',
    openGraph: {
      title: 'Catálogo | CJ Rasteirinhas',
      type: 'website',
    },
    other: { slug },
  }
}

export default async function CatalogoPage({ params }: Props) {
  const { slug } = await params

  return (
    <main className="min-h-screen bg-[#0d1117]">
      <Suspense fallback={<CatalogoSkeleton />}>
        <CatalogoCliente slug={slug} whatsapp="5562981480687" />
      </Suspense>
    </main>
  )
}

function CatalogoSkeleton() {
  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-2 border-[#dc2ade] border-t-transparent animate-spin" />
        <p className="text-white/40 text-sm font-medium">Carregando catálogo...</p>
      </div>
    </div>
  )
}
