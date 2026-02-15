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
  ShoppingCart,
  Settings,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Save,
  Download,
  Brain,
  FileUp,
  Headset,
  Database,
  Wrench,
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
  { label: 'Central', href: '/central', icon: <Headset size={20} /> },
  { label: 'Atendimento', href: '/atendimento', icon: <MessageCircle size={20} /> },
  { label: 'Clientes', href: '/clientes', icon: <Users size={20} /> },
  { label: 'Campanhas', href: '/campanhas', icon: <Megaphone size={20} /> },
  { label: 'Produtos', href: '/produtos', icon: <ShoppingBag size={20} /> },
  { label: 'Pedidos', href: '/pedidos', icon: <Package size={20} /> },
  { label: 'Inteligência', href: '/intelligence', icon: <Brain size={20} /> },
  { label: 'Importação', href: '/importacao', icon: <FileUp size={20} /> },
  { label: 'Carrinhos', href: '/carrinhos', icon: <ShoppingCart size={20} /> },
  { label: 'Eng. Dados', href: '/engenharia-dados', icon: <Database size={20} /> },
  { label: 'Manutenção', href: '/manutencao', icon: <Wrench size={20} /> },
  { label: 'Configurações', href: '/configuracoes', icon: <Settings size={20} /> },
];

const SYSTEM_ITEMS: NavItem[] = [
  { label: 'Sincronizar', href: '#sync', icon: <RefreshCw size={20} /> },
  { label: 'Salvar', href: '#save', icon: <Save size={20} /> },
  { label: 'Baixar', href: '#download', icon: <Download size={20} /> },
];

/**
 * Sidebar de navegação principal.
 * Full-height com flexbox vertical: Logo → Menu → flex-grow → Sistema → Versão.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { sidebarExpanded, toggleSidebar } = useUIStore();

  return (
    <aside
      className={cn(
        'h-screen bg-white border-r border-surface-border flex flex-col transition-all duration-300 relative shrink-0',
        sidebarExpanded ? 'w-[260px]' : 'w-[72px]'
      )}
    >
      {/* ─── TOPO: Logo ─── */}
      <div className="h-16 flex items-center px-5 border-b border-surface-border shrink-0">
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
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <div className="flex flex-col justify-between h-full">
          {/* Itens de navegação */}
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3.5 rounded-xl text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-crm-primary/10 text-crm-primary'
                      : 'text-txt-secondary hover:bg-slate-50 hover:text-txt-primary'
                  )}
                  title={!sidebarExpanded ? item.label : undefined}
                >
                  <span className={cn('shrink-0', isActive ? 'text-crm-primary' : 'text-txt-muted')}>
                    {item.icon}
                  </span>
                  {sidebarExpanded && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>

          {/* Itens de sistema (na base do menu) */}
          <div className="mt-4">
            {sidebarExpanded && (
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-txt-muted">
                Sistema
              </p>
            )}
            <div className="flex flex-col gap-1">
              {SYSTEM_ITEMS.map((item) => (
                <button
                  key={item.label}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3.5 rounded-xl text-sm font-medium transition-all duration-200 w-full',
                    'text-txt-secondary hover:bg-slate-50 hover:text-txt-primary'
                  )}
                  title={!sidebarExpanded ? item.label : undefined}
                >
                  <span className="shrink-0 text-txt-muted">{item.icon}</span>
                  {sidebarExpanded && <span>{item.label}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      </nav>

      {/* ─── VERSÃO / IDENTIDADE ─── */}
      <div className="px-3 py-4 border-t border-surface-border shrink-0">
        <div className="flex items-center justify-center gap-2">
          <div className="w-7 h-7 rounded-full overflow-hidden shrink-0">
            <Image
              src="/images/logo-icon.png"
              alt="VEXX CRM"
              width={28}
              height={28}
              className="object-contain"
            />
          </div>
          {sidebarExpanded && (
            <span className="text-xs text-txt-muted font-medium">
              VEXX CRM v2.0
            </span>
          )}
        </div>
      </div>

      {/* ─── BOTÃO COLAPSAR ─── */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-20 w-6 h-6 bg-white border border-surface-border rounded-full flex items-center justify-center shadow-sm hover:shadow-md transition-shadow text-txt-muted hover:text-txt-primary z-10"
      >
        {sidebarExpanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>
    </aside>
  );
}
