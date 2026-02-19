'use client';

import { useState } from 'react';
import { ChatList } from '@/components/chat/ChatList';
import { ChatArea } from '@/components/chat/ChatArea';
import { CRMSidebar } from '@/components/crm/CRMSidebar';
import { KanbanBoard } from '@/components/contact-center/KanbanBoard';
import { CatalogoDrawer } from '@/components/contact-center/CatalogoDrawer';
import { TransferDialog } from '@/components/contact-center/TransferDialog';
import { CentralToolbar } from '@/components/contact-center/CentralToolbar';
import { EmbeddedCampaignPanel } from '@/components/contact-center/EmbeddedCampaignPanel';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { useChatsStore } from '@/store/chats';
import { cn } from '@/lib/utils';

type RightPanel = 'crm' | 'kanban' | null;

/**
 * Central de Atendimento v3 — Layout Widescreen 3 colunas
 *
 * Col1 22%  — Toolbar (F1–F4) + Lista de conversas
 * Col2 48%  — Área de chat (nobre)
 * Col3 30%  — CRM expandido / Kanban de Pipeline
 */
export default function CentralAtendimentoPage() {
  useRealtimeMessages();

  const { selectedChatId } = useChatsStore();
  const [rightPanel, setRightPanel] = useState<RightPanel>('crm');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [anneEnabled, setAnneEnabled] = useState(true);

  return (
    <div className="flex h-full bg-wa-bg-app overflow-hidden">

      {/* ━━━ COLUNA 1 — 22% — Toolbar + ChatList ━━━ */}
      <div className="w-[22%] min-w-64 max-w-80 shrink-0 border-r border-wa-border flex flex-col">
        {/* F1–F4 Toolbar */}
        <CentralToolbar
          anneEnabled={anneEnabled}
          onAnneToggle={setAnneEnabled}
          onOpenCampaign={() => setCampaignOpen(true)}
        />

        {/* Lista de conversas */}
        <div className="flex-1 overflow-hidden">
          <ChatList />
        </div>
      </div>

      {/* ━━━ COLUNA 2 — 48% — Chat Area ━━━ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mini-toolbar de ações da conversa ativa */}
        {selectedChatId && (
          <div className="flex items-center justify-end gap-1 px-3 py-1.5 bg-wa-bg-panel border-b border-wa-border shrink-0">
            <button
              onClick={() => setCatalogOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-txt-secondary hover:bg-surface-100 transition-colors"
            >
              Catálogo
            </button>
            <button
              onClick={() => setTransferOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-txt-secondary hover:bg-surface-100 transition-colors"
            >
              Transferir
            </button>
            <div className="w-px h-5 bg-surface-200 mx-1" />
            <button
              onClick={() => setRightPanel(p => p === 'kanban' ? 'crm' : 'kanban')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                rightPanel === 'kanban'
                  ? 'bg-crm-primary text-white'
                  : 'text-txt-secondary hover:bg-surface-100'
              )}
            >
              Pipeline
            </button>
            <button
              onClick={() => setRightPanel(p => p === 'crm' ? null : 'crm')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                rightPanel === 'crm'
                  ? 'bg-crm-primary text-white'
                  : 'text-txt-secondary hover:bg-surface-100'
              )}
            >
              CRM
            </button>
          </div>
        )}

        {/* Área de chat */}
        <div className="flex-1 overflow-hidden">
          <ChatArea />
        </div>
      </div>

      {/* ━━━ COLUNA 3 — 30% — CRM ou Kanban ━━━ */}
      {rightPanel === 'crm' && (
        <div className="w-[30%] min-w-72 max-w-96 shrink-0 border-l border-surface-200 overflow-hidden">
          <CRMSidebar />
        </div>
      )}
      {rightPanel === 'kanban' && (
        <div className="w-[30%] min-w-72 max-w-96 shrink-0 border-l border-surface-200 overflow-hidden">
          <KanbanBoard />
        </div>
      )}

      {/* ━━━ OVERLAYS ━━━ */}
      <CatalogoDrawer open={catalogOpen} onClose={() => setCatalogOpen(false)} />
      <TransferDialog open={transferOpen} onClose={() => setTransferOpen(false)} />

      {/* Painel de Campanha Embarcada (drawer sobre tudo) */}
      {campaignOpen && (
        <EmbeddedCampaignPanel onClose={() => setCampaignOpen(false)} />
      )}
    </div>
  );
}

