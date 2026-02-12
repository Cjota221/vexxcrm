'use client';

import { ChatList } from '@/components/chat/ChatList';
import { ChatArea } from '@/components/chat/ChatArea';
import { CRMSidebar } from '@/components/crm/CRMSidebar';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';

/**
 * Central de Atendimento — layout 3 colunas
 * [ChatList | ChatArea | CRMSidebar]
 */
export default function AtendimentoPage() {
  // Ativa SSE para recebimento em tempo real
  useRealtimeMessages();

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-wa-bg-app overflow-hidden rounded-xl border border-surface-200">
      {/* Coluna 1: Lista de chats */}
      <div className="w-[360px] shrink-0 border-r border-wa-border">
        <ChatList />
      </div>

      {/* Coluna 2: Área de chat */}
      <ChatArea />

      {/* Coluna 3: Sidebar CRM */}
      <CRMSidebar />
    </div>
  );
}
