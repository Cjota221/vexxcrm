'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { ConversationSidebar } from '@/components/contact-center/ConversationSidebar';
import { ChatArea } from '@/components/chat/ChatArea';
import { ClientBrainSidebar } from '@/components/crm/ClientBrainSidebar';
import { QuickMessagesSidebar } from '@/components/contact-center/QuickMessagesSidebar';
import { AnnePanel } from '@/components/anne/AnnePanel';
import { KanbanModal } from '@/components/crm/KanbanModal';
import { CatalogoDrawer } from '@/components/contact-center/CatalogoDrawer';
import { TransferDialog } from '@/components/contact-center/TransferDialog';
import { EmbeddedCampaignPanel } from '@/components/contact-center/EmbeddedCampaignPanel';
import { StatusPanel } from '@/components/contact-center/StatusPanel';
import { SentinelaAnnePanel } from '@/components/contact-center/SentinelaAnnePanel';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { useWhatsAppConnection } from '@/hooks/useWhatsApp';
import { useChatsStore } from '@/store/chats';
import { useAuthStore } from '@/store/auth';
import { useConnectionStore } from '@/store/connection';
import { useQueryClient } from '@tanstack/react-query';
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
  Zap,
  Shield,
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
        // Compacto em md–lg, espaçoso em lg+
        'flex items-center gap-1.5 px-2.5 py-1.5 lg:px-4 lg:py-2 rounded-lg text-sm font-medium transition-all select-none shrink-0',
        active
          ? 'bg-crm-primary text-white shadow-sm'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
      )}
    >
      {icon}
      {/* Label oculta em md, visível em lg+ */}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

/* ─── Dot de conexão WhatsApp — indicador sobreposto ao logo ─── */

function ConnectionDot() {
  const { whatsappStatus } = useConnectionStore();
  const cfg = {
    connected:    { dot: 'bg-emerald-500',              title: 'WhatsApp conectado' },
    connecting:   { dot: 'bg-amber-400 animate-pulse',  title: 'Conectando...' },
    disconnected: { dot: 'bg-red-500 animate-pulse',    title: 'WhatsApp desconectado' },
    unknown:      { dot: 'bg-gray-400 animate-pulse',   title: 'Verificando conexão...' },
  }[whatsappStatus];

  return (
    <span
      title={cfg.title}
      className={cn(
        'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white shrink-0',
        cfg.dot
      )}
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
  useWhatsAppConnection(); // mantém whatsappStatus atualizado (connected/disconnected)

  const { selectedChatId, setSearchQuery, selectChat } = useChatsStore();
  const { user } = useAuthStore();

  const [kanbanOpen, setKanbanOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [anneEnabled, setAnneEnabled] = useState(true);
  // Desktop: qual aba está aberta no sidebar direito (Cérebro, Mensagens Rápidas, Sentinela, ou nenhuma)
  const [rightSidebarTab, setRightSidebarTab] = useState<'brain' | 'quick-messages' | 'sentinela' | null>('brain');
  // Painel lateral direito mobile: null = fechado, 'brain', 'anne', 'quick-messages' ou 'sentinela'
  const [mobileSidePanel, setMobileSidePanel] = useState<'brain' | 'anne' | 'quick-messages' | 'sentinela' | null>(null);
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

  // ── Navegação por teclado entre conversas ──────────────────────────
  const queryClient = useQueryClient();
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;

      // Ctrl+K — abrir busca (qualquer contexto)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }

      // Escape — fechar painéis / busca
      if (e.key === 'Escape') {
        if (searchOpen) { handleSearchClose(); return; }
        if (kanbanOpen) { setKanbanOpen(false); return; }
        if (catalogOpen) { setCatalogOpen(false); return; }
        if (transferOpen) { setTransferOpen(false); return; }
        if (campaignOpen) { setCampaignOpen(false); return; }
        if (statusOpen) { setStatusOpen(false); return; }
        return;
      }

      // J/K — navegar entre conversas (só fora de input)
      if (!isInput && (e.key === 'j' || e.key === 'k')) {
        // Ler IDs do cache do React Query (não dispara fetch)
        const cached = queryClient.getQueryData<{ pages: { data: { client?: { id?: string } }[] }[] }>(
          ['chats', 'all', undefined]
        );
        const ids = cached?.pages.flatMap(p => p.data ?? [])
          .map(c => c.client?.id)
          .filter(Boolean) as string[] | undefined;
        if (!ids || ids.length === 0) return;
        e.preventDefault();
        const cur = ids.indexOf(selectedChatId ?? '');
        const next = e.key === 'j'
          ? Math.min(cur + 1, ids.length - 1)
          : Math.max(cur - 1, 0);
        const nextId = ids[next];
        if (nextId && nextId !== selectedChatId) {
          selectChat(nextId);
          setMobileView('chat');
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    searchOpen, handleSearchClose,
    kanbanOpen, catalogOpen, transferOpen, campaignOpen, statusOpen,
    selectedChatId, selectChat, queryClient,
  ]);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden max-w-[100vw]">

      {/* ━━━ HEADER DESKTOP — oculto em mobile ━━━ */}
      <header className="hidden md:flex h-14 shrink-0 bg-white border-b border-gray-100 items-center px-4 z-20 gap-3">

        {/* ZONA ESQUERDA */}
        <div className="flex items-center gap-2.5 shrink-0 min-w-0">
          <div className="relative">
            <div className="w-8 h-8 rounded-xl bg-crm-primary flex items-center justify-center shadow-sm shrink-0">
              <span className="text-[11px] font-black text-white tracking-tight">VX</span>
            </div>
            <ConnectionDot />
          </div>
          <div className="hidden lg:block leading-tight">
            <p className="text-xs font-bold text-gray-900 tracking-tight">Central de Atendimento</p>
            <p className="text-[10px] text-gray-400">VEXX CRM</p>
          </div>
          <span className="text-xs font-bold text-gray-900 lg:hidden">Central</span>
        </div>

        <div className="w-px h-6 bg-gray-100 shrink-0" />

        {/* ZONA CENTRAL */}
        <nav className="flex items-center gap-0.5 flex-1 justify-start overflow-x-auto scrollbar-none min-w-0">
          {searchOpen ? (
            <div className="flex items-center gap-2 w-56 lg:w-72 px-3 py-1.5 bg-gray-50 border border-crm-primary/40 rounded-xl shadow-sm shrink-0">
              <Search size={13} className="text-crm-primary shrink-0" />
              <input
                autoFocus
                value={globalSearch}
                onChange={e => handleSearchChange(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && handleSearchClose()}
                placeholder="Nome, telefone ou tag..."
                className="flex-1 text-sm bg-transparent outline-none text-gray-800 placeholder:text-gray-400 min-w-0"
              />
              <div className="flex items-center gap-1 shrink-0">
                <kbd className="hidden lg:block px-1 py-0.5 bg-gray-200 text-gray-500 text-[9px] rounded font-mono">Esc</kbd>
                <button onClick={handleSearchClose} className="text-gray-400 hover:text-gray-600 p-0.5">
                  <X size={13} />
                </button>
              </div>
            </div>
          ) : (
            <NavBtn
              icon={<Search size={15} />}
              label="Buscar"
              onClick={() => setSearchOpen(true)}
            />
          )}

          <NavBtn icon={<Megaphone size={15} />} label="Campanhas" onClick={() => setCampaignOpen(true)} />
          <NavBtn icon={<Kanban size={15} />} label="Pipeline" active={kanbanOpen} onClick={() => setKanbanOpen(v => !v)} />
          <NavBtn icon={<BookOpen size={15} />} label="Catálogo" onClick={() => setCatalogOpen(true)} />
          <NavBtn icon={<Zap size={15} />} label="Rápidas" active={rightSidebarTab === 'quick-messages'} onClick={() => setRightSidebarTab(v => v === 'quick-messages' ? null : 'quick-messages')} />
          <NavBtn icon={<Shield size={15} />} label="Sentinela" active={rightSidebarTab === 'sentinela'} onClick={() => setRightSidebarTab(v => v === 'sentinela' ? null : 'sentinela')} />

          {selectedChatId && (
            <>
              <div className="w-px h-5 bg-gray-200 shrink-0 mx-1" />
              <NavBtn icon={<ArrowLeftRight size={15} />} label="Transferir" onClick={() => setTransferOpen(true)} />
            </>
          )}
        </nav>

        {/* ZONA DIREITA */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Cérebro */}
          <NavBtn icon={<Brain size={15} />} label="Cérebro" active={rightSidebarTab === 'brain'} onClick={() => setRightSidebarTab(v => v === 'brain' ? null : 'brain')} />

          <div className="w-px h-5 bg-gray-100" />

          {/* Perfil do usuário */}
          <button
            onClick={() => setStatusOpen(true)}
            className="flex items-center gap-2 pl-2 hover:bg-gray-50 rounded-xl px-2 py-1.5 transition-colors group"
            title="Meu status"
          >
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-crm-primary flex items-center justify-center overflow-hidden shrink-0 ring-2 ring-crm-primary/15">
                {user?.avatar_url
                  ? <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
                  : <span className="text-white text-xs font-bold">{user ? getInitials(user.name) : 'U'}</span>
                }
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
            </div>
            <div className="hidden lg:block leading-tight text-left">
              <p className="text-xs font-semibold text-gray-900 truncate max-w-24">{user?.name ?? '—'}</p>
              <p className="text-[10px] text-emerald-600 font-medium capitalize">online</p>
            </div>
          </button>
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
            onToggleQuickMessages={() => setRightSidebarTab(v => v === 'quick-messages' ? null : 'quick-messages')}
            onToggleAnne={() => setMobileSidePanel(p => p === 'anne' ? null : 'anne')}
            onToggleSentinela={() => setRightSidebarTab(v => v === 'sentinela' ? null : 'sentinela')}
          />
        </div>

        {/* ── COLUNA 3: Sidebar Direito — somente desktop ── */}
        {(selectedChatId || rightSidebarTab === 'sentinela') && rightSidebarTab && (
          <div className="hidden md:flex">
            {rightSidebarTab === 'brain' && selectedChatId && <ClientBrainSidebar onClose={() => setRightSidebarTab(null)} />}
            {rightSidebarTab === 'quick-messages' && selectedChatId && (
              <QuickMessagesSidebar
                recipientPhone=""
                clientId={selectedChatId}
                onClose={() => setRightSidebarTab(null)}
              />
            )}
            {rightSidebarTab === 'sentinela' && <SentinelaAnnePanel />}
          </div>
        )}
      </div>

      {/* ━━━ ABA LATERAL DIREITA — Cérebro + Anne (mobile, quando chat aberto) ━━━
          Dois ícones empilhados colados na borda direita.
          Clicou → painel desliza da direita para a esquerda.
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {selectedChatId && mobileView === 'chat' && (
        <div className="md:hidden">
          {/* Aba colada na borda direita — botões compactos com ícone apenas */}
          <div className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-1 p-1 bg-white/95 backdrop-blur-sm rounded-l-2xl shadow-lg border border-gray-100">
            {(
              [
                { key: 'brain',         icon: <Brain size={18} />,  label: 'Cérebro'  },
                { key: 'quick-messages', icon: <Zap size={18} />,    label: 'Rápidas'  },
                { key: 'anne',          icon: <Bot size={18} />,    label: 'Anne'     },
                { key: 'sentinela',     icon: <Shield size={18} />, label: 'Sentinela'},
              ] as const
            ).map(({ key, icon, label }) => (
              <button
                key={key}
                onClick={() => setMobileSidePanel(p => p === key ? null : key)}
                title={label}
                aria-label={label}
                className={cn(
                  'w-10 h-10 flex items-center justify-center rounded-xl transition-all active:scale-95',
                  mobileSidePanel === key
                    ? 'bg-crm-primary text-white shadow-sm'
                    : 'text-crm-primary hover:bg-crm-primary/10',
                )}
              >
                {icon}
              </button>
            ))}
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
                      : mobileSidePanel === 'quick-messages'
                      ? <Zap size={16} className="text-white" />
                      : mobileSidePanel === 'sentinela'
                      ? <Shield size={16} className="text-white" />
                      : <Bot size={16} className="text-white" />
                    }
                    <span className="text-sm font-bold text-white">
                      {mobileSidePanel === 'brain'
                        ? 'Cérebro do Cliente'
                        : mobileSidePanel === 'quick-messages'
                        ? 'Respostas Rápidas'
                        : mobileSidePanel === 'sentinela'
                        ? 'Sentinela Anne'
                        : 'Anne — IA'}
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
                    : mobileSidePanel === 'quick-messages'
                    ? <QuickMessagesSidebar recipientPhone="" clientId={selectedChatId} onClose={() => setMobileSidePanel(null)} />
                    : mobileSidePanel === 'sentinela'
                    ? <SentinelaAnnePanel />
                    : <AnnePanel clientId={selectedChatId} />
                  }
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ━━━ SENTINELA MOBILE — botão flutuante na lista de conversas ━━━ */}
      {mobileView === 'list' && (
        <div className="md:hidden">
          <button
            onClick={() => setMobileSidePanel(p => p === 'sentinela' ? null : 'sentinela')}
            className="fixed bottom-6 right-4 z-40 flex items-center gap-2 px-4 py-2.5 bg-crm-primary text-white rounded-full shadow-lg text-sm font-semibold"
          >
            <Shield size={16} />
            Sentinela
          </button>
          {mobileSidePanel === 'sentinela' && (
            <>
              <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setMobileSidePanel(null)} />
              <div className="fixed top-0 right-0 bottom-0 z-51 bg-white w-[88vw] max-w-sm shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-crm-primary shrink-0">
                  <div className="flex items-center gap-2">
                    <Shield size={16} className="text-white" />
                    <span className="text-sm font-bold text-white">Sentinela Anne</span>
                  </div>
                  <button onClick={() => setMobileSidePanel(null)} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30">
                    <X size={15} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain">
                  <SentinelaAnnePanel />
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
