import Link from 'next/link'
import { Instagram, MessageCircle } from 'lucide-react'

export default function LojaFooter() {
  return (
    <footer className="mt-24 border-t border-white/5 bg-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div>
            <span className="text-2xl font-black uppercase text-white"
                  style={{ fontFamily: 'League Spartan, sans-serif' }}>
              CJ<span className="text-[#dc2ade]">ota</span>
            </span>
            <p className="text-sm text-white/30 mt-2 leading-relaxed">
              Sandálias e rasteirinhas direto da fábrica.<br />
              Pedido mínimo 5 peças.
            </p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-4"
               style={{ fontFamily: 'League Spartan, sans-serif' }}>
              Atacado
            </p>
            <div className="space-y-2">
              {[
                { href: '/loja/catalogo', label: 'Ver catálogo' },
                { href: '/loja/carrinho', label: 'Meu carrinho' },
              ].map(({ href, label }) => (
                <Link key={href} href={href}
                  className="block text-sm text-white/40 hover:text-white transition-colors">
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-4"
               style={{ fontFamily: 'League Spartan, sans-serif' }}>
              Contato
            </p>
            <div className="space-y-3">
              <a href="https://wa.me/5562981480687" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-white/40 hover:text-[#25D366] transition-colors">
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </a>
              <a href="https://instagram.com/cjotarasteirinhas" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-white/40 hover:text-[#dc2ade] transition-colors">
                <Instagram className="w-4 h-4" />
                @cjotarasteirinhas
              </a>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-2">
          <p className="text-xs text-white/20">
            © {new Date().getFullYear()} CJ Rasteirinhas · Todos os direitos reservados
          </p>
          <p className="text-xs text-white/10">Goiânia, GO</p>
        </div>
      </div>
    </footer>
  )
}
