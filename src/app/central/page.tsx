'use client';

import { useState, useCallback, useEffect } from 'react';
import { ConversationSidebar } from '@/components/contact-center/ConversationSidebar';
import { ChatArea } from '@/components/chat/ChatArea';
import { ClientBrainSidebar } from '@/components/crm/ClientBrainSidebar';
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
  const [mobileAnneOpen, setMobileAnneOpen] = useState(false);
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

      {/* ━━━ ANNE MOBILE — bolinha flutuante (só aparece quando há chat aberto no mobile) ━━━ */}
      {selectedChatId && mobileView === 'chat' && (
        <div className="md:hidden">
          {/* Botão flutuante — bolinha da Anne */}
          <button
            onClick={() => setMobileAnneOpen(true)}
            className={cn(
              'fixed bottom-20 right-4 z-40',
              'w-12 h-12 rounded-full bg-crm-primary shadow-lg',
              'flex items-center justify-center',
              'active:scale-95 transition-transform',
              'ring-2 ring-white',
            )}
            title="Cérebro do Cliente"
            aria-label="Abrir Cérebro do Cliente"
          >
            <Brain size={20} className="text-white" />
          </button>

          {/* Drawer da Anne — slide-up ao clicar na bolinha */}
          {mobileAnneOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
                onClick={() => setMobileAnneOpen(false)}
              />
              {/* Painel deslizante */}
              <div className="fixed bottom-0 left-0 right-0 z-51 bg-white rounded-t-2xl shadow-2xl max-h-[85dvh] flex flex-col animate-in slide-in-from-bottom duration-300">
                {/* Alça visual */}
                <div className="flex justify-center pt-3 pb-1 shrink-0">
                  <div className="w-10 h-1 rounded-full bg-gray-200" />
                </div>
                {/* Cabeçalho */}
                <div className="flex items-center justify-between px-4 pb-3 pt-1 shrink-0 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <Brain size={16} className="text-crm-primary" />
                    <span className="text-sm font-bold text-gray-800">Cérebro do Cliente</span>
                  </div>
                  <button
                    onClick={() => setMobileAnneOpen(false)}
                    className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 active:bg-gray-300"
                    aria-label="Fechar"
                  >
                    <X size={15} />
                  </button>
                </div>
                {/* Conteúdo rolável */}
                <div className="flex-1 overflow-y-auto overscroll-contain">
                  <ClientBrainSidebar onClose={() => setMobileAnneOpen(false)} />
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
