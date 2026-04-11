'use client';

import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Image as ImageIcon,
  BarChart3,
  MoreHorizontal,
  Bot,
  CheckSquare,
  Library,
  ShoppingBag,
  FileText,
  TrendingUp,
  GitCompare,
  Globe,
  FileEdit,
  UserCheck,
  Zap,
  Settings,
  X,
  Menu,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/ui';

/* ─── Tipos ──────────────────────────────────────────────────────────────── */

type Tab =
  | 'campanhas'
  | 'criativos'
  | 'publicos'
  | 'textos'
  | 'analise'
  | 'relatorio'
  | 'config'
  | 'agente'
  | 'aprovacoes'
  | 'leads'
  | 'regras'
  | 'consolidado'
  | 'abtest'
  | 'catalogo'
  | 'biblioteca';

interface SubTab {
  key: Tab;
  label: string;
  icon: React.ReactNode;
}

interface NavGroup {
  key: string;
  label: string;
  icon: React.ReactNode;
  tabs: SubTab[];
}

/* ─── Grupos do Bottom Nav (mobile) ──────────────────────────────────────── */

const NAV_GROUPS: NavGroup[] = [
  {
    key: 'campanhas',
    label: 'Campanhas',
    icon: <LayoutDashboard size={20} />,
    tabs: [
      { key: 'campanhas',  label: 'Campanhas',  icon: <LayoutDashboard size={16} /> },
      { key: 'agente',     label: 'Jarvis',     icon: <Bot size={16} /> },
      { key: 'aprovacoes', label: 'Aprovações', icon: <CheckSquare size={16} /> },
    ],
  },
  {
    key: 'publicos',
    label: 'Públicos',
    icon: <Users size={20} />,
    tabs: [
      { key: 'publicos',   label: 'Públicos',   icon: <Users size={16} /> },
      { key: 'biblioteca', label: 'Biblioteca', icon: <Library size={16} /> },
    ],
  },
  {
    key: 'criativos',
    label: 'Criativos',
    icon: <ImageIcon size={20} />,
    tabs: [
      { key: 'criativos', label: 'Criativos', icon: <ImageIcon size={16} /> },
      { key: 'catalogo',  label: 'Catálogo',  icon: <ShoppingBag size={16} /> },
    ],
  },
  {
    key: 'analise',
    label: 'Análise',
    icon: <BarChart3 size={20} />,
    tabs: [
      { key: 'analise',     label: 'Análise',    icon: <TrendingUp size={16} /> },
      { key: 'relatorio',   label: 'Relatório',  icon: <FileText size={16} /> },
      { key: 'abtest',      label: 'A/B Test',   icon: <GitCompare size={16} /> },
      { key: 'consolidado', label: 'Multi-conta', icon: <Globe size={16} /> },
    ],
  },
  {
    key: 'mais',
    label: 'Mais',
    icon: <MoreHorizontal size={20} />,
    tabs: [
      { key: 'textos', label: 'Textos', icon: <FileEdit size={16} /> },
      { key: 'leads',  label: 'Leads',  icon: <UserCheck size={16} /> },
      { key: 'regras', label: 'Regras', icon: <Zap size={16} /> },
      { key: 'config', label: 'Config', icon: <Settings size={16} /> },
    ],
  },
];

/* ─── Lista plana para a sidebar desktop ─────────────────────────────────── */

const DESKTOP_MODULES: {
  key: Tab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { key: 'campanhas',   label: 'Campanhas',     icon: LayoutDashboard },
  { key: 'criativos',   label: 'Criativos',     icon: ImageIcon },
  { key: 'publicos',    label: 'Públicos',      icon: Users },
  { key: 'textos',      label: 'Textos',        icon: FileEdit },
  { key: 'analise',     label: 'Análise',       icon: TrendingUp },
  { key: 'relatorio',   label: 'Relatório',     icon: BarChart3 },
  { key: 'agente',      label: 'Jarvis',        icon: Bot },
  { key: 'aprovacoes',  label: 'Aprovações',    icon: CheckSquare },
  { key: 'leads',       label: 'Leads',         icon: UserCheck },
  { key: 'config',      label: 'Configurações', icon: Settings },
  { key: 'regras',      label: 'Regras',        icon: Zap },
  { key: 'consolidado', label: 'Multi-conta',   icon: Globe },
  { key: 'abtest',      label: 'A/B Test',      icon: GitCompare },
  { key: 'catalogo',    label: 'Catálogo',      icon: ShoppingBag },
  { key: 'biblioteca',  label: 'Biblioteca',    icon: Library },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function getGroupForTab(tab: Tab): string {
  for (const group of NAV_GROUPS) {
    if (group.tabs.some((t) => t.key === tab)) return group.key;
  }
  return 'campanhas';
}

/* ─── Componente ─────────────────────────────────────────────────────────── */

/**
 * Menu contextual do módulo de Tráfego Pago.
 *
 * Desktop (≥ md): sidebar branca de duplo nível (Nível 2) com todos os módulos.
 * Mobile (< md): bottom navigation fixo com 5 grupos + strip de sub-abas
 *                + drawer de seleção ao retap no grupo ativo.
 */
export function TrafegoContextMenu() {
  const {
    trafegoTab,
    setTrafegoTab,
    trafegoPendentes,
    sidebarExpanded,
    toggleSidebar,
    mobileSidebarOpen,
  } = useUIStore();

  const [activeGroup, setActiveGroup] = useState<string>(() =>
    getGroupForTab(trafegoTab as Tab)
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerGroup, setDrawerGroup] = useState<NavGroup | null>(null);

  // Sincroniza o grupo ativo quando a aba muda externamente
  useEffect(() => {
    setActiveGroup(getGroupForTab(trafegoTab as Tab));
  }, [trafegoTab]);

  function handleGroupTap(group: NavGroup) {
    // Grupo com uma única aba → vai direto
    if (group.tabs.length === 1) {
      setTrafegoTab(group.tabs[0].key);
      setActiveGroup(group.key);
      setDrawerOpen(false);
      return;
    }
    // Retap no grupo ativo → abre o drawer
    if (activeGroup === group.key) {
      setDrawerGroup(group);
      setDrawerOpen(true);
      return;
    }
    // Primeiro tap → vai para a 1ª aba do grupo
    setTrafegoTab(group.tabs[0].key);
    setActiveGroup(group.key);
    setDrawerOpen(false);
  }

  function handleSubTabSelect(subTab: SubTab) {
    setTrafegoTab(subTab.key);
    setDrawerOpen(false);
  }

  const currentGroup = NAV_GROUPS.find((g) => g.key === activeGroup);
  const currentSubTabs = currentGroup?.tabs ?? [];
  const hasMultipleSubs = currentSubTabs.length > 1;

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════
          DESKTOP — Sidebar branca (Nível 2)
          Oculta em mobile, visível em md+
      ═══════════════════════════════════════════════════════════════ */}
      <aside className="hidden md:flex h-full w-52 shrink-0 bg-white border-r border-gray-200 flex-col overflow-hidden">

        {/* Cabeçalho: título + hamburguer */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[#1e293b] flex items-center justify-center shrink-0">
              <TrendingUp size={14} className="text-white" />
            </div>
            <span className="text-sm font-bold text-gray-800 truncate">Tráfego Pago</span>
          </div>
          <button
            onClick={toggleSidebar}
            title={sidebarExpanded ? 'Recolher menu global' : 'Expandir menu global'}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all shrink-0"
          >
            {sidebarExpanded ? <ChevronLeft size={16} /> : <Menu size={16} />}
          </button>
        </div>

        {/* Label de seção */}
        <div className="px-4 pt-5 pb-2 shrink-0">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            Módulos
          </p>
        </div>

        {/* Navegação */}
        <nav className="flex-1 px-2 pb-2 overflow-y-auto">
          <div className="space-y-0.5">
            {DESKTOP_MODULES.map((item) => {
              const ativo = trafegoTab === item.key;
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  onClick={() => setTrafegoTab(item.key)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150',
                    ativo
                      ? 'bg-[#1e293b]/10 text-[#1e293b]'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  )}
                >
                  <Icon
                    size={16}
                    className={cn(
                      'shrink-0 transition-colors',
                      ativo ? 'text-[#1e293b]' : 'text-gray-400'
                    )}
                  />
                  <span className="text-sm font-medium">{item.label}</span>

                  {/* Badge de pendências em Aprovações */}
                  {item.key === 'aprovacoes' && trafegoPendentes > 0 && (
                    <span className="ml-auto w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                      {trafegoPendentes > 9 ? '9+' : trafegoPendentes}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Rodapé */}
        <div className="px-4 py-3 border-t border-gray-100 shrink-0">
          <p className="text-[10px] text-gray-400 font-medium">Tráfego v2.0</p>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════════════
          MOBILE — Bottom Navigation fixo
          Visível apenas abaixo de md
      ═══════════════════════════════════════════════════════════════ */}
      <nav className={cn(
        "md:hidden fixed bottom-0 left-0 right-0 z-[45] bg-[#0d1117] border-t border-[#1c2333]",
        mobileSidebarOpen && "hidden"
      )}>

        {/* Strip de sub-abas — aparece quando o grupo ativo tem > 1 aba */}
        {hasMultipleSubs && (
          <div className="flex items-center gap-1 px-3 pt-2 pb-1 overflow-x-auto border-b border-[#1c2333]"
            style={{ scrollbarWidth: 'none' }}>
            {currentSubTabs.map((sub) => {
              const isActive = trafegoTab === sub.key;
              return (
                <button
                  key={sub.key}
                  onClick={() => handleSubTabSelect(sub)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-shrink-0',
                    isActive
                      ? 'bg-[#1e3a5f] text-white'
                      : 'text-[#64748b] hover:text-[#94a3b8]'
                  )}
                >
                  {sub.icon}
                  {sub.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Linha principal dos grupos */}
        <div className="flex items-center justify-around px-2 py-2">
          {NAV_GROUPS.map((group) => {
            const isGroupActive = activeGroup === group.key;
            return (
              <button
                key={group.key}
                onClick={() => handleGroupTap(group)}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-[56px]',
                  isGroupActive ? 'text-white' : 'text-[#475569]'
                )}
              >
                {/* Ícone + dot indicator se há sub-abas */}
                <div className="relative">
                  <span
                    className={cn(
                      'transition-colors',
                      isGroupActive ? 'text-[#3b82f6]' : 'text-[#475569]'
                    )}
                  >
                    {group.icon}
                  </span>
                  {isGroupActive && group.tabs.length > 1 && (
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
                  )}
                </div>
                <span
                  className={cn(
                    'text-[10px] font-medium leading-none',
                    isGroupActive ? 'text-[#3b82f6]' : 'text-[#475569]'
                  )}
                >
                  {group.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════════════
          MOBILE — Drawer de sub-abas (retap no grupo ativo)
      ═══════════════════════════════════════════════════════════════ */}
      {drawerOpen && drawerGroup && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Painel do drawer */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-[70] bg-[#111827] rounded-t-2xl border-t border-[#1c2333] p-4 pb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span className="text-[#3b82f6]">{drawerGroup.icon}</span>
                {drawerGroup.label}
              </h3>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-lg bg-[#1c2333] text-[#64748b] hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {drawerGroup.tabs.map((sub) => {
                const isActive = trafegoTab === sub.key;
                return (
                  <button
                    key={sub.key}
                    onClick={() => handleSubTabSelect(sub)}
                    className={cn(
                      'flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium text-left transition-all border',
                      isActive
                        ? 'bg-[#1e3a5f] text-white border-[#2563eb]/30'
                        : 'bg-[#1c2333] text-[#94a3b8] hover:bg-[#242d40] hover:text-white border-transparent'
                    )}
                  >
                    <span className={isActive ? 'text-[#60a5fa]' : 'text-[#64748b]'}>
                      {sub.icon}
                    </span>
                    {sub.label}
                    {isActive && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
