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
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import {
  Search,
  Megaphone,
  Kanban,
  Brain,
  BookOpen,
  ArrowLeftRight,
  X,
} from 'lucide-react';

/* ─── Botão da topbar global ─────────────────────────────────── */

function GlobalBtn({
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

/* ─── Botão contextual (dentro da conversa) ──────────────────── */

function CtxBtn({ icon, label, onClick }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/**
 * Central de Atendimento v5 — Header Global + Templates Multi-Bubble
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  [VX Central]  [🔍 Buscar]  [📣 Campanhas]  [⎐ Pipeline]  │  ← Header Global (44px)
 * ├──────────────┬──────────────────────────────┬──────────────┤
 * │  Sidebar     │  [Catálogo][Transferir] [🧠] │  Cérebro do  │  ← Ctx bar (36px)
 * │  Conversas   ├──────────────────────────────┤  Cliente     │
 * │  280px       │  Chat Workspace (flex-1)     │  320px       │
 * └──────────────┴──────────────────────────────┴──────────────┘
 */
export default function CentralAtendimentoPage() {
  useRealtimeMessages();

  const { selectedChatId, setSearchQuery } = useChatsStore();

  const [kanbanOpen, setKanbanOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [anneEnabled, setAnneEnabled] = useState(true);
  const [brainOpen, setBrainOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  const debouncedSearch = useDebounce(globalSearch, 300);

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

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          HEADER GLOBAL — busca + ações globais
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="h-11 shrink-0 bg-white border-b border-gray-200 flex items-center px-4 gap-2 shadow-[0_1px_3px_rgba(0,0,0,0.06)] z-20">

        {/* Marca */}
        <div className="flex items-center gap-2 shrink-0 mr-1">
          <div className="w-7 h-7 rounded-lg bg-crm-primary flex items-center justify-center shadow-sm">
            <span className="text-[10px] font-black text-white tracking-tight">VX</span>
          </div>
          <span className="text-sm font-bold text-gray-800 hidden md:block">Central</span>
        </div>

        <div className="w-px h-5 bg-gray-200 shrink-0" />

        {/* Busca Global */}
        {searchOpen ? (
          <div className="flex items-center gap-2 flex-1 max-w-sm px-3 py-1.5 bg-gray-50 border border-crm-primary/50 rounded-lg">
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
          <GlobalBtn
            icon={<Search size={14} />}
            label="Buscar"
            onClick={() => setSearchOpen(true)}
          />
        )}

        <GlobalBtn
          icon={<Megaphone size={14} />}
          label="Campanhas"
          onClick={() => setCampaignOpen(true)}
        />

        <GlobalBtn
          icon={<Kanban size={14} />}
          label="Pipeline"
          active={kanbanOpen}
          onClick={() => setKanbanOpen(v => !v)}
        />

        {/* Ações contextuais — visíveis apenas com chat aberto */}
        {selectedChatId && (
          <>
            <div className="w-px h-5 bg-gray-200 shrink-0" />
            <GlobalBtn
              icon={<BookOpen size={14} />}
              label="Catálogo"
              onClick={() => setCatalogOpen(true)}
            />
            <GlobalBtn
              icon={<ArrowLeftRight size={14} />}
              label="Transferir"
              onClick={() => setTransferOpen(true)}
            />
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        <GlobalBtn
          icon={<Brain size={14} />}
          label="Cérebro"
          active={brainOpen}
          onClick={() => setBrainOpen(v => !v)}
        />
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          CORPO — 3 colunas, edge-to-edge (sem espaços laterais)
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── COLUNA 1: Sidebar de Conversas ── */}
        <ConversationSidebar
          anneEnabled={anneEnabled}
          onAnneToggle={setAnneEnabled}
          onOpenCampaign={() => setCampaignOpen(true)}
        />

        {/* ── COLUNA 2: Workspace do Chat ── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Kanban Drawer — desliza do topo */}
          <KanbanDrawer open={kanbanOpen} onClose={() => setKanbanOpen(false)} />

          {/* Área de chat — sem margens, 100% da largura */}
          <div className="flex-1 overflow-hidden">
            <ChatArea />
          </div>
        </div>

        {/* ── COLUNA 3: Cérebro do Cliente (largura reduzida para não espremer) ── */}
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


/* ─── Micro-componentes locais da topbar ─── */

function ActionBtn({ icon, label, onClick }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors font-medium"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
