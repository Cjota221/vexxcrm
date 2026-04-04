import { Suspense } from 'react'
import LojaHeader from '../../LojaHeader'
import LojaFooter from '../../LojaFooter'
import ProdutoLojaCliente from './ProdutoLojaCliente'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ProdutoLojaPage({ params }: Props) {
  const { id } = await params

  return (
    <>
      <LojaHeader />
      <main className="min-h-screen">
        <Suspense fallback={
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 rounded-full border-2 border-[#dc2ade] border-t-transparent animate-spin" />
          </div>
        }>
          <ProdutoLojaCliente produtoId={id} />
        </Suspense>
      </main>
      <LojaFooter />
    </>
  )
}
