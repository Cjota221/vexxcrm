'use client';

import {
  Target,
  Image as ImageIcon,
  Users,
  FileText,
  Zap,
  BarChart3,
  Bot,
  CheckCircle,
  CloudDownload,
  Settings,
  Menu,
  ChevronLeft,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/ui';

const TRAFEGO_MODULES = [
  { key: 'campanhas',  label: 'Campanhas',     icon: Target },
  { key: 'criativos',  label: 'Criativos',     icon: ImageIcon },
  { key: 'publicos',   label: 'Públicos',      icon: Users },
  { key: 'textos',     label: 'Textos',        icon: FileText },
  { key: 'analise',    label: 'Análise',       icon: Zap },
  { key: 'relatorio',  label: 'Relatório',     icon: BarChart3 },
  { key: 'agente',     label: 'Agente',        icon: Bot },
  { key: 'aprovacoes', label: 'Aprovações',    icon: CheckCircle },
  { key: 'leads',      label: 'Leads',         icon: CloudDownload },
  { key: 'config',     label: 'Configurações', icon: Settings },
] as const;

/**
 * Menu contextual (Nível 2) do módulo de Tráfego Pago.
 *
 * Fica colado à direita do Menu Global (Nível 1), formando o padrão
 * de Navegação de Duplo Nível. O botão de hamburguer no topo alterna
 * a expansão do Menu Global sem sair do módulo.
 */
export function TrafegoContextMenu() {
  const {
    trafegoTab,
    setTrafegoTab,
    trafegoPendentes,
    sidebarExpanded,
    toggleSidebar,
  } = useUIStore();

  return (
    <aside className="h-full w-52 shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">

      {/* ─── Cabeçalho: título do módulo + botão hamburguer ─── */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[#1e293b] flex items-center justify-center shrink-0">
            <TrendingUp size={14} className="text-white" />
          </div>
          <span className="text-sm font-bold text-gray-800 truncate">Tráfego Pago</span>
        </div>

        {/* Hamburguer: expande/colapsa o Menu Global temporariamente */}
        <button
          onClick={toggleSidebar}
          title={sidebarExpanded ? 'Recolher menu global' : 'Expandir menu global'}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all shrink-0"
        >
          {sidebarExpanded ? <ChevronLeft size={16} /> : <Menu size={16} />}
        </button>
      </div>

      {/* ─── Label de seção ─── */}
      <div className="px-4 pt-5 pb-2 shrink-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Módulos</p>
      </div>

      {/* ─── Navegação dos módulos ─── */}
      <nav className="flex-1 px-2 pb-2 overflow-y-auto">
        <div className="space-y-0.5">
          {TRAFEGO_MODULES.map((item) => {
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

                {/* Badge de pendências para Aprovações */}
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

      {/* ─── Rodapé ─── */}
      <div className="px-4 py-3 border-t border-gray-100 shrink-0">
        <p className="text-[10px] text-gray-400 font-medium">Tráfego v2.0</p>
      </div>
    </aside>
  );
}
