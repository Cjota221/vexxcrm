'use client';

import { useState, useCallback } from 'react';
import { ConversationSidebar } from '@/components/contact-center/ConversationSidebar';
import { ChatArea } from '@/components/chat/ChatArea';
import { ClientBrainSidebar } from '@/components/crm/ClientBrainSidebar';
import { KanbanModal } from '@/components/crm/KanbanModal';
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

/* ─── Botão de navegação do header ───────────────────────────── */

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
        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all select-none',
        active
          ? 'bg-crm-primary text-white shadow-sm'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/* ─── Dot de conexão WhatsApp ─────────────────────────────────── */

function ConnectionDot() {
  const { whatsappStatus } = useConnectionStore();
  const cfg = {
    connected:    { dot: 'bg-emerald-500',              title: 'WhatsApp conectado' },
    connecting:   { dot: 'bg-amber-400 animate-pulse',  title: 'Conectando...' },
    disconnected: { dot: 'bg-red-500',                  title: 'Desconectado' },
    unknown:      { dot: 'bg-gray-400 animate-pulse',   title: 'Verificando...' },
  }[whatsappStatus];

  return <span title={cfg.title} className={cn('w-2.5 h-2.5 rounded-full shrink-0', cfg.dot)} />;
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

      {/* ━━━ HEADER — 3 ZONAS: marca | nav | perfil ━━━ */}
      <header className="h-14 shrink-0 bg-white border-b border-gray-100 flex items-center px-5 z-20" style={{ boxShadow: '0 1px 0 #e5e7eb' }}>

        {/* ZONA ESQUERDA — marca */}
        <div className="flex items-center gap-3 w-64 shrink-0">
          <ConnectionDot />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-crm-primary flex items-center justify-center shadow-sm">
              <span className="text-[11px] font-black text-white tracking-tight">VX</span>
            </div>
            <span className="text-sm font-bold text-gray-900">Central</span>
          </div>
        </div>

        {/* ZONA CENTRAL — navegação principal */}
        <nav className="flex items-center gap-1 flex-1 justify-center">
          {searchOpen ? (
            <div className="flex items-center gap-2 w-80 px-3 py-2 bg-gray-50 border border-crm-primary/40 rounded-xl shadow-sm">
              <Search size={14} className="text-crm-primary shrink-0" />
              <input
                autoFocus
                value={globalSearch}
                onChange={e => handleSearchChange(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && handleSearchClose()}
                placeholder="Nome, telefone, tag..."
                className="flex-1 text-sm bg-transparent outline-none text-gray-800 placeholder:text-gray-400 min-w-0"
              />
              <button onClick={handleSearchClose} className="text-gray-400 hover:text-gray-600 shrink-0 p-0.5">
                <X size={13} />
              </button>
            </div>
          ) : (
            <NavBtn icon={<Search size={15} />} label="Buscar" onClick={() => setSearchOpen(true)} />
          )}

          <NavBtn icon={<Megaphone size={15} />} label="Campanhas" onClick={() => setCampaignOpen(true)} />
          <NavBtn icon={<Kanban size={15} />} label="Pipeline" active={kanbanOpen} onClick={() => setKanbanOpen(v => !v)} />

          {selectedChatId && (
            <>
              <div className="w-px h-5 bg-gray-200 shrink-0 mx-1" />
              <NavBtn icon={<BookOpen size={15} />} label="Catálogo" onClick={() => setCatalogOpen(true)} />
              <NavBtn icon={<ArrowLeftRight size={15} />} label="Transferir" onClick={() => setTransferOpen(true)} />
            </>
          )}
        </nav>

        {/* ZONA DIREITA — ações + perfil */}
        <div className="flex items-center gap-2 w-64 justify-end shrink-0">
          <NavBtn icon={<Brain size={15} />} label="Cérebro" active={brainOpen} onClick={() => setBrainOpen(v => !v)} />

          <div className="w-px h-5 bg-gray-200 mx-1" />

          <button className="relative p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <Bell size={17} />
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">3</span>
          </button>

          <div className="flex items-center gap-2.5 pl-2 border-l border-gray-100">
            <div className="w-8 h-8 rounded-full bg-crm-primary flex items-center justify-center overflow-hidden shrink-0 ring-2 ring-crm-primary/10">
              {user?.avatar_url
                ? <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
                : <span className="text-white text-xs font-bold">{user ? getInitials(user.name) : 'U'}</span>
              }
            </div>
            <div className="hidden lg:block leading-tight">
              <p className="text-xs font-semibold text-gray-900 truncate max-w-28">{user?.name ?? '—'}</p>
              <p className="text-[10px] text-gray-400 capitalize">{user?.role ?? ''}</p>
            </div>
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
      <KanbanModal open={kanbanOpen} onClose={() => setKanbanOpen(false)} />
      <CatalogoDrawer open={catalogOpen} onClose={() => setCatalogOpen(false)} />
      <TransferDialog open={transferOpen} onClose={() => setTransferOpen(false)} />
      {campaignOpen && <EmbeddedCampaignPanel onClose={() => setCampaignOpen(false)} />}
    </div>
  );
}
