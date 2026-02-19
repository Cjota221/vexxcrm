'use client';

import { useState, useCallback } from 'react';
import { ConversationSidebar } from '@/components/contact-center/ConversationSidebar';
import { ChatArea } from '@/components/chat/ChatArea';
import { ClientBrainSidebar } from '@/components/crm/ClientBrainSidebar';
import { KanbanDrawer } from '@/components/contact-center/KanbanDrawer';
import { CatalogoDrawer } from '@/components/contact-center/CatalogoDrawer';
import { TransferDialog } from '@/components/contact-center/TransferDialog';
import { EmbeddedCampaignPanel } from '@/components/contact-center/EmbeddedCampaignPanel';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { useChatsStore } from '@/store/chats';
import { useAuthStore } from '@/store/auth';
import { useConnectionStore } from '@/store/connection';
import { getInitials } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import {
  Search,
  Megaphone,
  Kanban,
  Brain,
  BookOpen,
  ArrowLeftRight,
  Bell,
  X,
} from 'lucide-react';

/* ─── Botão do header da Central ─────────────────────────────── */

function NavBtn({
  icon, label, active, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all select-none',
        active
          ? 'bg-crm-primary text-white shadow-sm'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
      )}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

/* ─── Ponto de status de conexão ─────────────────────────────── */

function ConnectionDot() {
  const { whatsappStatus } = useConnectionStore();
  const dotColor = {
    connected: 'bg-emerald-500',
    connecting: 'bg-amber-400 animate-pulse',
    disconnected: 'bg-red-500',
    unknown: 'bg-gray-400 animate-pulse',
  }[whatsappStatus];

  const title = {
    connected: 'WhatsApp conectado',
    connecting: 'Conectando...',
    disconnected: 'Desconectado',
    unknown: 'Verificando conexão...',
  }[whatsappStatus];

  return (
    <span
      title={title}
      className={cn('w-2.5 h-2.5 rounded-full shrink-0', dotColor)}
    />
  );
}

/**
 * Central de Atendimento v6 — Header único completo
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  ● [VX Central] | [🔍 Buscar] [📣 Campanhas] [⎐ Pipeline]  🔔 [CA] │  ← 1 header (h-14)
 * ├──────────────┬──────────────────────────────────────────────────────┤
 * │  Sidebar     │  Chat Workspace (flex-1)           │  Cérebro (w-72) │
 * └──────────────┴──────────────────────────────────────────────────────┘
 */
export default function CentralAtendimentoPage() {
  useRealtimeMessages();

  const { selectedChatId, setSearchQuery } = useChatsStore();
  const { user } = useAuthStore();

  const [kanbanOpen, setKanbanOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [anneEnabled, setAnneEnabled] = useState(true);
  const [brainOpen, setBrainOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _debouncedSearch = useDebounce(globalSearch, 300);

  const handleSearchChange = useCallback((v: string) => {
    setGlobalSearch(v);
    setSearchQuery(v);
  }, [setSearchQuery]);

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false);
    setGlobalSearch('');
    setSearchQuery('');
  }, [setSearchQuery]);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          HEADER ÚNICO — substitui o Header global do layout
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <header className="h-16 shrink-0 bg-white border-b border-gray-200 flex items-center px-4 gap-2 shadow-[0_1px_3px_rgba(0,0,0,0.06)] z-20">

        {/* Ponto de conexão + Marca */}
        <div className="flex items-center gap-2 shrink-0">
          <ConnectionDot />
          <div className="w-7 h-7 rounded-lg bg-crm-primary flex items-center justify-center shadow-sm">
            <span className="text-[10px] font-black text-white tracking-tight">VX</span>
          </div>
          <span className="text-sm font-bold text-gray-800 hidden md:block">Central</span>
        </div>

        <div className="w-px h-5 bg-gray-200 shrink-0 mx-1" />

        {/* Navegação principal — centralizada */}
        <div className="flex items-center gap-1 flex-1 justify-center">
          {searchOpen ? (
            <div className="flex items-center gap-2 w-72 px-3 py-1.5 bg-gray-50 border border-crm-primary/50 rounded-lg">
              <Search size={13} className="text-crm-primary shrink-0" />
              <input
                autoFocus
                value={globalSearch}
                onChange={e => handleSearchChange(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && handleSearchClose()}
                placeholder="Buscar por nome, tag, número..."
                className="flex-1 text-xs bg-transparent outline-none text-gray-800 placeholder:text-gray-400 min-w-0"
              />
              <button onClick={handleSearchClose} className="text-gray-400 hover:text-gray-600 shrink-0">
                <X size={12} />
              </button>
            </div>
          ) : (
            <NavBtn icon={<Search size={14} />} label="Buscar" onClick={() => setSearchOpen(true)} />
          )}

          <NavBtn icon={<Megaphone size={14} />} label="Campanhas" onClick={() => setCampaignOpen(true)} />
          <NavBtn icon={<Kanban size={14} />} label="Pipeline" active={kanbanOpen} onClick={() => setKanbanOpen(v => !v)} />

          {/* Ações contextuais — só com chat aberto */}
          {selectedChatId && (
            <>
              <div className="w-px h-5 bg-gray-200 shrink-0" />
              <NavBtn icon={<BookOpen size={14} />} label="Catálogo" onClick={() => setCatalogOpen(true)} />
              <NavBtn icon={<ArrowLeftRight size={14} />} label="Transferir" onClick={() => setTransferOpen(true)} />
            </>
          )}
        </div>

        {/* Cérebro */}
        <NavBtn icon={<Brain size={14} />} label="Cérebro" active={brainOpen} onClick={() => setBrainOpen(v => !v)} />

        <div className="w-px h-5 bg-gray-200 shrink-0" />

        {/* Notificações */}
        <button className="relative p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors">
          <Bell size={18} />
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            3
          </span>
        </button>

        {/* Avatar + nome */}
        <div className="flex items-center gap-2.5 pl-3 border-l border-gray-200">
          <div className="w-8 h-8 rounded-full bg-crm-primary flex items-center justify-center overflow-hidden shrink-0">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-xs font-semibold">
                {user ? getInitials(user.name) : 'U'}
              </span>
            )}
          </div>
          <div className="hidden md:block leading-tight">
            <p className="text-xs font-semibold text-gray-800 truncate max-w-30">{user?.name ?? '—'}</p>
            <p className="text-[10px] text-gray-400">{user?.role ?? ''}</p>
          </div>
        </div>
      </header>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          CORPO — 3 colunas, edge-to-edge
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── COLUNA 1: Sidebar de Conversas ── */}
        <ConversationSidebar
          anneEnabled={anneEnabled}
          onAnneToggle={setAnneEnabled}
          onOpenCampaign={() => setCampaignOpen(true)}
        />

        {/* ── COLUNA 2: Workspace do Chat ── */}
        <div className="flex-1 flex flex-col min-w-0">
          <KanbanDrawer open={kanbanOpen} onClose={() => setKanbanOpen(false)} />
          <div className="flex-1 overflow-hidden">
            <ChatArea />
          </div>
        </div>

        {/* ── COLUNA 3: Cérebro do Cliente ── */}
        {brainOpen && selectedChatId && (
          <ClientBrainSidebar onClose={() => setBrainOpen(false)} />
        )}
      </div>

      {/* ━━━ OVERLAYS ━━━ */}
      <CatalogoDrawer open={catalogOpen} onClose={() => setCatalogOpen(false)} />
      <TransferDialog open={transferOpen} onClose={() => setTransferOpen(false)} />
      {campaignOpen && <EmbeddedCampaignPanel onClose={() => setCampaignOpen(false)} />}
    </div>
  );
}
