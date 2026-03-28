'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  MessageCircle,
  Users,
  Megaphone,
  ShoppingBag,
  Package,
  Settings,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  Brain,
  Headset,
  Bot,
  Tag,
  Sparkles,
  TrendingUp,
  Share2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/ui';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: <LayoutDashboard size={20} /> },
  { label: 'Central de Atendimento', href: '/central', icon: <Headset size={20} /> },
  { label: 'Clientes', href: '/clientes', icon: <Users size={20} /> },
  { label: 'Pedidos', href: '/pedidos', icon: <Package size={20} /> },
  { label: 'Produtos', href: '/produtos', icon: <ShoppingBag size={20} /> },
  { label: 'Campanhas', href: '/campanhas', icon: <Megaphone size={20} /> },
  { label: 'Etiquetas', href: '/etiquetas', icon: <Tag size={20} /> },
  { label: 'Tráfego Pago', href: '/trafego', icon: <TrendingUp size={20} /> },
  { label: 'Social Mídia', href: '/social', icon: <Share2 size={20} /> },
  { label: 'Inteligência', href: '/intelligence', icon: <Brain size={20} /> },
  { label: 'Anne IA', href: '/configuracoes/anne', icon: <Bot size={20} /> },
  { label: 'Time de IAs', href: '/time-ia', icon: <Sparkles size={20} /> },
  { label: 'Configurações', href: '/configuracoes', icon: <Settings size={20} /> },
];

/**
 * Sidebar de navegação principal.
 * Full-height com flexbox vertical: Logo → Menu → flex-grow → Versão.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { sidebarExpanded, toggleSidebar, mobileSidebarOpen, setMobileSidebarOpen } = useUIStore();

  // Fecha o drawer quando navega em telas mobile
  const handleNavClick = () => setMobileSidebarOpen(false);

  return (
    <>
      {/* Backdrop mobile — visível apenas quando drawer aberto */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

    <aside
      className={cn(
        'h-screen flex flex-col transition-all duration-300 bg-crm-primary',
        // Mobile: drawer fixed da esquerda (fora do fluxo, não empurra conteúdo)
        'fixed inset-y-0 left-0 z-50 w-72',
        mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full',
        // Desktop: posição estática no fluxo flex, largura dinâmica, sempre visível
        'md:static md:z-auto md:translate-x-0 md:relative md:shrink-0',
        sidebarExpanded ? 'md:w-65' : 'md:w-18',
      )}
    >
      {/* ─── TOPO: Logo ─── */}
      <div className="h-16 flex items-center px-5 border-b border-white/10 shrink-0">
        {sidebarExpanded ? (
          <div className="flex items-center justify-center w-full">
            <Image
              src="/images/logo-icon.png"
              alt="VEXX CRM"
              width={160}
              height={44}
              className="object-contain h-11 w-auto"
              priority
            />
          </div>
        ) : (
          <div className="flex items-center justify-center mx-auto">
            <Image
              src="/images/logo-icon.png"
              alt="VEXX CRM"
              width={40}
              height={40}
              className="object-contain h-10 w-10"
              priority
            />
          </div>
        )}
      </div>

      {/* ─── MENU PRINCIPAL (expande para preencher o espaço) ─── */}
      <nav className="flex-1 px-3 py-5 overflow-y-auto">
        <div className="flex flex-col justify-between h-full">
          {/* Itens de navegação */}
          <div className="flex flex-col gap-1.5">
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleNavClick}
                  className={cn(
                    'flex items-center gap-3 px-3 py-4 rounded-xl text-[15px] font-semibold transition-all duration-200',
                    isActive
                      ? 'bg-white/20 text-white shadow-sm'
                      : 'text-white/75 hover:bg-white/10 hover:text-white'
                  )}
                  title={!sidebarExpanded ? item.label : undefined}
                >
                  <span className={cn('shrink-0', isActive ? 'text-white' : 'text-white/70')}>
                    {item.icon}
                  </span>
                  {sidebarExpanded && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* ─── VERSÃO / IDENTIDADE ─── */}
      <div className="px-3 py-4 border-t border-white/10 shrink-0">
        <div className="flex items-center justify-center gap-2">
          <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-white/20">
            <Image
              src="/images/logo-icon.png"
              alt="VEXX CRM"
              width={28}
              height={28}
              className="object-contain"
            />
          </div>
          {sidebarExpanded && (
            <span className="text-xs text-white/60 font-medium">
              VEXX CRM v2.0
            </span>
          )}
        </div>
      </div>

      {/* ─── BOTÃO COLAPSAR — apenas no desktop ─── */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-20 w-6 h-6 bg-crm-primary border border-white/20 rounded-full hidden md:flex items-center justify-center shadow-sm hover:shadow-md transition-shadow text-white/70 hover:text-white z-10"
      >
        {sidebarExpanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>
    </aside>
    </>
  );
}
