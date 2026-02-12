'use client';

import { useRef, useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import { useMessages, useSendMessage } from '@/hooks/useWhatsApp';
import { useChatsStore } from '@/store/chats';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { getInitials, getAvatarColor } from '@/lib/utils';

/**
 * Área principal do chat — mensagens + input.
 */
export function ChatArea() {
  const { selectedChatId } = useChatsStore();
  const { data: messages = [], isLoading } = useMessages(selectedChatId);
  const { mutate: sendMessage, isPending: isSending } = useSendMessage();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (content: string) => {
    if (!selectedChatId) return;
    sendMessage({
      client_id: selectedChatId,
      remote_jid: '', // TODO: resolver JID real do cliente
      content,
      type: 'text',
    });
  };

  // Estado vazio — nenhum chat selecionado
  if (!selectedChatId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-wa-bg-conversation">
        <div className="w-20 h-20 rounded-full bg-wa-bg-panel flex items-center justify-center mb-4">
          <MessageCircle size={36} className="text-wa-text-secondary" />
        </div>
        <h3 className="text-xl font-medium text-wa-text-primary mb-2">VEXX CRM 2.0</h3>
        <p className="text-sm text-wa-text-secondary text-center max-w-md">
          Selecione uma conversa para começar a atender seus clientes.
          <br />
          Use <kbd className="px-1.5 py-0.5 bg-wa-bg-panel rounded text-xs">Ctrl+K</kbd> para buscar.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Chat header */}
      <div className="h-16 bg-wa-bg-panel border-b border-wa-border flex items-center px-4 gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold"
          style={{ backgroundColor: getAvatarColor(selectedChatId) }}
        >
          {getInitials(selectedChatId)}
        </div>
        <div>
          <p className="text-sm font-medium text-wa-text-primary">Cliente</p>
          <p className="text-xs text-wa-text-secondary">Online</p>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto wa-chat-bg wa-scrollbar px-4 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin-slow w-8 h-8 border-2 border-wa-accent-green border-t-transparent rounded-full" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-wa-text-secondary bg-wa-bg-panel/80 px-4 py-2 rounded-lg">
              Início da conversa
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Message input */}
      <MessageInput onSend={handleSend} isLoading={isSending} />
    </div>
  );
}
