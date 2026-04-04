import Link from 'next/link'
import { ArrowRight, Package } from 'lucide-react'

export default function HomeHero() {
  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden bg-[#0a0a0a]">
      {/* Fundo — glow rosa + neon + grain */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full opacity-10"
             style={{ background: 'radial-gradient(circle, #dc2ade 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] rounded-full opacity-5"
             style={{ background: 'radial-gradient(circle, #e8f044 0%, transparent 70%)' }} />
        <div className="absolute inset-0 opacity-[0.15]"
             style={{
               backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.4'/%3E%3C/svg%3E")`,
               backgroundRepeat: 'repeat',
               backgroundSize: '128px',
             }} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 w-full py-20">
        <div className="max-w-3xl">
          {/* Tag */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#dc2ade]/30 bg-[#dc2ade]/5 mb-8">
            <Package className="w-3.5 h-3.5 text-[#dc2ade]" />
            <span className="text-xs font-bold uppercase tracking-widest text-[#dc2ade]"
                  style={{ fontFamily: 'League Spartan, sans-serif' }}>
              Atacado · Mín. 5 peças
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black uppercase leading-none tracking-tight text-white mb-6"
              style={{ fontFamily: 'League Spartan, sans-serif' }}>
            Rasteirinhas
            <br />
            <span className="text-[#dc2ade]">direto</span>
            <br />
            da fábrica.
          </h1>

          <p className="text-lg sm:text-xl text-white/50 max-w-xl leading-relaxed mb-10">
            Sandálias e rasteirinhas femininas no atacado.
            Monte seu pedido com qualquer mix de modelos, cores e tamanhos.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/loja/catalogo"
              className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl bg-[#dc2ade] hover:bg-[#c41fc7] text-white font-bold text-base uppercase tracking-wider transition-all shadow-2xl shadow-[#dc2ade]/30 active:scale-95"
              style={{ fontFamily: 'League Spartan, sans-serif' }}>
              Ver catálogo
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a href="https://wa.me/5562981480687?text=Olá! Quero saber mais sobre o atacado CJ Rasteirinhas"
               target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl border border-white/10 text-white/70 hover:text-white hover:border-white/30 font-bold text-base uppercase tracking-wider transition-all"
               style={{ fontFamily: 'League Spartan, sans-serif' }}>
              Falar no WhatsApp
            </a>
          </div>

          {/* Mini stats */}
          <div className="mt-16 flex flex-wrap gap-8">
            {[
              { valor: '5 peças', label: 'pedido mínimo' },
              { valor: 'Mix livre', label: 'modelos, cores e tamanhos' },
              { valor: 'Goiânia', label: 'direto da fábrica' },
            ].map(({ valor, label }) => (
              <div key={label}>
                <p className="text-2xl font-black text-white uppercase"
                   style={{ fontFamily: 'League Spartan, sans-serif' }}>
                  {valor}
                </p>
                <p className="text-xs text-white/30 uppercase tracking-wider mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
