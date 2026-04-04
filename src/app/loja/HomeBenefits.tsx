import { Truck, Layers, Zap, ShieldCheck } from 'lucide-react'

const beneficios = [
  {
    icon: Layers,
    titulo: 'Mix livre',
    desc: 'Monte seu pedido com qualquer combinação de modelos, cores e tamanhos.',
  },
  {
    icon: Zap,
    titulo: 'Pedido rápido',
    desc: 'Selecione, adicione ao carrinho e pague via PIX ou cartão em minutos.',
  },
  {
    icon: Truck,
    titulo: 'Entrega para todo o Brasil',
    desc: 'Frete calculado na hora pelo seu CEP. PAC e SEDEX disponíveis.',
  },
  {
    icon: ShieldCheck,
    titulo: 'Direto da fábrica',
    desc: 'Sem intermediários. Qualidade CJ Rasteirinhas com preço de atacado.',
  },
]

export default function HomeBenefits() {
  return (
    <section className="py-20 bg-[#111111] border-y border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {beneficios.map(({ icon: Icon, titulo, desc }) => (
            <div key={titulo} className="flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#dc2ade]/10 border border-[#dc2ade]/20 flex items-center justify-center">
                <Icon className="w-5 h-5 text-[#dc2ade]" />
              </div>
              <h3 className="text-base font-bold uppercase text-white"
                  style={{ fontFamily: 'League Spartan, sans-serif' }}>
                {titulo}
              </h3>
              <p className="text-sm text-white/40 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
