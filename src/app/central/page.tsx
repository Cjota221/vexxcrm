'use client';

import { useState } from 'react';
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
import {
  BookOpen,
  ArrowLeftRight,
  Kanban,
  Brain,
} from 'lucide-react';

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

function PanelToggleBtn({ icon, label, active, onClick }: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
        active
          ? 'bg-crm-primary text-white shadow-sm'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/**
 * Central de Atendimento v4 — Refactoring UI/UX Completo
 *
 * ┌──────────────┬──────────────────────────────┬──────────────┐
 * │  Sidebar     │     Chat Workspace           │  Cérebro do  │
 * │  Conversas   │  (área nobre — flex-1)       │  Cliente     │
 * │  280px       │                              │  320px       │
 * └──────────────┴──────────────────────────────┴──────────────┘
 *
 * Kanban Pipeline = Drawer deslizante no TOPO do workspace
 * (não bloqueia a conversa, pode ser lido em paralelo)
 */
export default function CentralAtendimentoPage() {
  useRealtimeMessages();

  const { selectedChatId } = useChatsStore();
  const [kanbanOpen, setKanbanOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [anneEnabled, setAnneEnabled] = useState(true);
  const [brainOpen, setBrainOpen] = useState(true);

  return (
    <div className="flex h-full bg-[#f0f2f5] overflow-hidden">

      {/* ━━━ COLUNA 1 — 280px — Sidebar de Conversas ━━━ */}
      <ConversationSidebar
        anneEnabled={anneEnabled}
        onAnneToggle={setAnneEnabled}
        onOpenCampaign={() => setCampaignOpen(true)}
      />

      {/* ━━━ COLUNA 2 — flex-1 — Workspace Central ━━━ */}
      <div className="flex-1 flex flex-col min-w-0 relative">

        {/* Topbar contextual — aparece só quando há conversa ativa */}
        <div className={cn(
          'flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shrink-0 transition-all duration-200',
          selectedChatId ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}>
          {/* Esquerda: ações da conversa */}
          <div className="flex items-center gap-1">
            <ActionBtn
              icon={<BookOpen size={14} />}
              label="Catálogo"
              onClick={() => setCatalogOpen(true)}
            />
            <ActionBtn
              icon={<ArrowLeftRight size={14} />}
              label="Transferir"
              onClick={() => setTransferOpen(true)}
            />
          </div>

          {/* Direita: toggles de painel */}
          <div className="flex items-center gap-1">
            <PanelToggleBtn
              icon={<Kanban size={14} />}
              label="Pipeline"
              active={kanbanOpen}
              onClick={() => setKanbanOpen(v => !v)}
            />
            <PanelToggleBtn
              icon={<Brain size={14} />}
              label="Cérebro"
              active={brainOpen}
              onClick={() => setBrainOpen(v => !v)}
            />
          </div>
        </div>

        {/* Kanban Drawer — desliza do topo, não bloqueia o chat */}
        <KanbanDrawer open={kanbanOpen} onClose={() => setKanbanOpen(false)} />

        {/* Área de chat — ocupa todo o espaço restante */}
        <div className="flex-1 overflow-hidden">
          <ChatArea />
        </div>
      </div>

      {/* ━━━ COLUNA 3 — 320px — Cérebro do Cliente ━━━ */}
      {brainOpen && selectedChatId && (
        <ClientBrainSidebar onClose={() => setBrainOpen(false)} />
      )}

      {/* ━━━ OVERLAYS ━━━ */}
      <CatalogoDrawer open={catalogOpen} onClose={() => setCatalogOpen(false)} />
      <TransferDialog open={transferOpen} onClose={() => setTransferOpen(false)} />

      {campaignOpen && (
        <EmbeddedCampaignPanel onClose={() => setCampaignOpen(false)} />
      )}
    </div>
  );
}

