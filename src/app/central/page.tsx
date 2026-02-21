'use client';

import { useState, useCallback, useEffect } from 'react';
import { ConversationSidebar } from '@/components/contact-center/ConversationSidebar';
import { ChatArea } from '@/components/chat/ChatArea';
import { ClientBrainSidebar } from '@/components/crm/ClientBrainSidebar';
import { AnnePanel } from '@/components/anne/AnnePanel';
import { KanbanModal } from '@/components/crm/KanbanModal';
import { CatalogoDrawer } from '@/components/contact-center/CatalogoDrawer';
import { TransferDialog } from '@/components/contact-center/TransferDialog';
import { EmbeddedCampaignPanel } from '@/components/contact-center/EmbeddedCampaignPanel';
import { StatusPanel } from '@/components/contact-center/StatusPanel';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { useWhatsAppConnection } from '@/hooks/useWhatsApp';
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
  Eye,
  Bot,
} from 'lucide-react';

/* Tipo da view mobile */
type MobileView = 'list' | 'chat';

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
  useWhatsAppConnection(); // mantém whatsappStatus atualizado (connected/disconnected)

  const { selectedChatId, setSearchQuery } = useChatsStore();
  const { user } = useAuthStore();

  const [kanbanOpen, setKanbanOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [anneEnabled, setAnneEnabled] = useState(true);
  const [brainOpen, setBrainOpen] = useState(true);
  // Painel lateral direito mobile: null = fechado, 'brain' ou 'anne'
  const [mobileSidePanel, setMobileSidePanel] = useState<'brain' | 'anne' | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  /* ── Mobile: controla qual tela está visível ── */
  const [mobileView, setMobileView] = useState<MobileView>('list');

  // Quando seleciona um chat no mobile → navegar para o chat
  const handleMobileChatOpen = useCallback(() => {
    setMobileView('chat');
  }, []);

  // Back button no chat → volta para a lista
  const handleMobileBack = useCallback(() => {
    setMobileView('list');
  }, []);

  // Se o chat foi desmarcado (ex: novo chat), garantir que volta pra lista no mobile
  useEffect(() => {
    if (!selectedChatId) setMobileView('list');
  }, [selectedChatId]);

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
    <div className="flex flex-col h-full bg-white overflow-hidden max-w-[100vw]">

      {/* ━━━ HEADER DESKTOP — oculto em mobile ━━━ */}
      <header className="hidden md:flex h-14 shrink-0 bg-white border-b border-gray-100 items-center px-5 z-20" style={{ boxShadow: '0 1px 0 #e5e7eb' }}>

        {/* ZONA ESQUERDA — marca */}
        <div className="flex items-center gap-3 w-64 shrink-0">
          <ConnectionDot />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-crm-primary flex items-center justify-center shadow-sm">
              <span className="text-[11px] font-black text-white tracking-tight">VX</span>
            </div>
            <span className="text-sm font-bold text-gray-900">Central de Atendimento</span>
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
          <NavBtn icon={<Eye size={15} />} label="Status" onClick={() => setStatusOpen(true)} />
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
          CORPO
          Desktop: 3 colunas lado a lado
          Mobile:  uma tela por vez (lista OU chat) — igual WhatsApp
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── COLUNA 1: Sidebar de Conversas ──
            Desktop: sempre visível (w-280px)
            Mobile:  tela cheia quando mobileView==='list', oculta quando ==='chat' */}
        <div className={cn(
          'flex flex-col',
          // Desktop: fixed width sidebar
          'md:w-70 md:min-w-65 md:max-w-xs md:shrink-0 md:flex',
          // Mobile: full screen ou oculto
          mobileView === 'list' ? 'flex w-full' : 'hidden md:flex',
        )}>
          <ConversationSidebar
            anneEnabled={anneEnabled}
            onAnneToggle={setAnneEnabled}
            onOpenCampaign={() => setCampaignOpen(true)}
            onMobileChatOpen={handleMobileChatOpen}
          />
        </div>

        {/* ── COLUNA 2: Workspace do Chat ──
            Desktop: flex-1
            Mobile:  tela cheia quando mobileView==='chat', oculto quando ==='list' */}
        <div className={cn(
          'flex flex-col min-w-0',
          // Desktop: sempre visível, ocupa espaço restante
          'md:flex md:flex-1',
          // Mobile: full screen ou oculto
          mobileView === 'chat' ? 'flex flex-1 w-full' : 'hidden md:flex',
        )}>
          <ChatArea
            onMobileBack={handleMobileBack}
            onOpenCatalog={() => setCatalogOpen(true)}
            onOpenTransfer={() => setTransferOpen(true)}
          />
        </div>

        {/* ── COLUNA 3: Cérebro do Cliente — somente desktop ── */}
        {brainOpen && selectedChatId && (
          <div className="hidden md:flex">
            <ClientBrainSidebar onClose={() => setBrainOpen(false)} />
          </div>
        )}
      </div>

      {/* ━━━ ABA LATERAL DIREITA — Cérebro + Anne (mobile, quando chat aberto) ━━━
          Dois ícones empilhados colados na borda direita.
          Clicou → painel desliza da direita para a esquerda.
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {selectedChatId && mobileView === 'chat' && (
        <div className="md:hidden">
          {/* Aba colada na borda direita */}
          <div className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-0 overflow-hidden rounded-l-2xl shadow-lg">
            {/* Botão Cérebro */}
            <button
              onClick={() => setMobileSidePanel(p => p === 'brain' ? null : 'brain')}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-2.5 py-3 transition-colors',
                mobileSidePanel === 'brain'
                  ? 'bg-crm-primary text-white'
                  : 'bg-white/95 text-crm-primary border-b border-gray-100',
              )}
              title="Cérebro do Cliente"
            >
              <Brain size={18} />
              <span className="text-[9px] font-bold leading-none tracking-wide" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                Cérebro
              </span>
            </button>
            {/* Botão Anne */}
            <button
              onClick={() => setMobileSidePanel(p => p === 'anne' ? null : 'anne')}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-2.5 py-3 transition-colors',
                mobileSidePanel === 'anne'
                  ? 'bg-crm-primary text-white'
                  : 'bg-white/95 text-crm-primary',
              )}
              title="Anne — IA"
            >
              <Bot size={18} />
              <span className="text-[9px] font-bold leading-none tracking-wide" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                Anne
              </span>
            </button>
          </div>

          {/* Drawer lateral — desliza da direita */}
          {mobileSidePanel && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
                onClick={() => setMobileSidePanel(null)}
              />
              {/* Painel */}
              <div className="fixed top-0 right-0 bottom-0 z-51 bg-white w-[88vw] max-w-sm shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                {/* Cabeçalho */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-crm-primary shrink-0">
                  <div className="flex items-center gap-2">
                    {mobileSidePanel === 'brain'
                      ? <Brain size={16} className="text-white" />
                      : <Bot size={16} className="text-white" />
                    }
                    <span className="text-sm font-bold text-white">
                      {mobileSidePanel === 'brain' ? 'Cérebro do Cliente' : 'Anne — IA'}
                    </span>
                  </div>
                  <button
                    onClick={() => setMobileSidePanel(null)}
                    className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 active:bg-white/40"
                  >
                    <X size={15} />
                  </button>
                </div>
                {/* Conteúdo rolável */}
                <div className="flex-1 overflow-y-auto overscroll-contain">
                  {mobileSidePanel === 'brain'
                    ? <ClientBrainSidebar onClose={() => setMobileSidePanel(null)} />
                    : <AnnePanel clientId={selectedChatId} />
                  }
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ━━━ OVERLAYS ━━━ */}
      <KanbanModal open={kanbanOpen} onClose={() => setKanbanOpen(false)} />
      <CatalogoDrawer open={catalogOpen} onClose={() => setCatalogOpen(false)} />
      <TransferDialog open={transferOpen} onClose={() => setTransferOpen(false)} />
      <StatusPanel open={statusOpen} onClose={() => setStatusOpen(false)} />
      {campaignOpen && <EmbeddedCampaignPanel onClose={() => setCampaignOpen(false)} />}
    </div>
  );
}
