'use client';

import { useState } from 'react';
import {
  Brain,
  ShoppingBag,
  ArrowRightLeft,
  PanelRightOpen,
  PanelRightClose,
} from 'lucide-react';
import { ChatList } from '@/components/chat/ChatList';
import { ChatArea } from '@/components/chat/ChatArea';
import { CRMSidebar } from '@/components/crm/CRMSidebar';
import { QueuePanel } from '@/components/contact-center/QueuePanel';
import { QuickActionsBar } from '@/components/contact-center/QuickActionsBar';
import { SentinelaAnnePanel } from '@/components/contact-center/SentinelaAnnePanel';
import { CatalogoDrawer } from '@/components/contact-center/CatalogoDrawer';
import { TransferDialog } from '@/components/contact-center/TransferDialog';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { useChatsStore } from '@/store/chats';
import { cn } from '@/lib/utils';

type RightPanel = 'crm' | 'sentinela' | null;

/**
 * Central de Atendimento v2 — layout 4 colunas com Contact Center + Sentinela.
 * [QueuePanel+ChatList | ChatArea+QuickActions | CRM / Sentinela]
 */
export default function CentralAtendimentoPage() {
  useRealtimeMessages();

  const { selectedChatId } = useChatsStore();
  const [rightPanel, setRightPanel] = useState<RightPanel>('crm');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const togglePanel = (panel: RightPanel) => {
    setRightPanel((current) => (current === panel ? null : panel));
  };

  return (
    <div className="flex h-full bg-wa-bg-app overflow-hidden">
      {/* ━━━ Coluna 1: Filas + Lista de chats ━━━ */}
      <div className="w-90 shrink-0 border-r border-wa-border flex flex-col">
        {/* Queue panel */}
        <div className="shrink-0 p-2 border-b border-surface-200">
          <QueuePanel />
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-hidden">
          <ChatList />
        </div>
      </div>

      {/* ━━━ Coluna 2: Chat + Quick Actions ━━━ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar de ações (acima do chat) */}
        {selectedChatId && (
          <div className="flex items-center justify-end gap-1 px-3 py-1.5 bg-wa-bg-panel border-b border-wa-border shrink-0">
            <button
              onClick={() => setCatalogOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-txt-secondary hover:bg-surface-100 transition-colors"
            >
              <ShoppingBag size={13} />
              Catálogo
            </button>
            <button
              onClick={() => setTransferOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-txt-secondary hover:bg-surface-100 transition-colors"
            >
              <ArrowRightLeft size={13} />
              Transferir
            </button>
            <div className="w-px h-5 bg-surface-200 mx-1" />
            <button
              onClick={() => togglePanel('sentinela')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors',
                rightPanel === 'sentinela'
                  ? 'bg-crm-primary text-white'
                  : 'text-txt-secondary hover:bg-surface-100'
              )}
            >
              <Brain size={13} />
              Anne
            </button>
            <button
              onClick={() => togglePanel('crm')}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                rightPanel === 'crm'
                  ? 'bg-crm-primary text-white'
                  : 'text-txt-secondary hover:bg-surface-100'
              )}
            >
              {rightPanel ? (
                <PanelRightClose size={15} />
              ) : (
                <PanelRightOpen size={15} />
              )}
            </button>
          </div>
        )}

        {/* Chat area */}
        <div className="flex-1 overflow-hidden">
          <ChatArea />
        </div>

        {/* Quick actions bar */}
        <QuickActionsBar />
      </div>

      {/* ━━━ Coluna 3: CRM Sidebar ou Sentinela Panel ━━━ */}
      {rightPanel === 'crm' && <CRMSidebar />}
      {rightPanel === 'sentinela' && (
        <aside className="w-80 border-l border-surface-200 shrink-0 overflow-hidden">
          <SentinelaAnnePanel />
        </aside>
      )}

      {/* ━━━ Overlays ━━━ */}
      <CatalogoDrawer open={catalogOpen} onClose={() => setCatalogOpen(false)} />
      <TransferDialog open={transferOpen} onClose={() => setTransferOpen(false)} />
    </div>
  );
}
