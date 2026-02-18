'use client';

import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { MessageCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMessages, useSendMessage } from '@/hooks/useWhatsApp';
import { useChatsStore } from '@/store/chats';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { getInitials, getAvatarColor } from '@/lib/utils';
import type { Chat } from '@/types';

/**
 * Área principal do chat — mensagens + input.
 */
export function ChatArea() {
  const { selectedChatId, activeFilter } = useChatsStore();
  const { data: messages = [], isLoading } = useMessages(selectedChatId);
  const { mutate: sendMessage, isPending: isSending } = useSendMessage();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Acessar chats do cache do React Query para pegar dados do cliente selecionado
  const { data: chats = [] } = useQuery<Chat[]>({
    queryKey: ['chats', activeFilter],
    enabled: false, // Não refetch — usa cache do ChatList
  });

  // Encontrar o chat selecionado para exibir nome e enviar para telefone correto
  const selectedChat = useMemo(
    () => chats.find((c) => c.client.id === selectedChatId),
    [chats, selectedChatId]
  );

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (content: string) => {
    if (!selectedChatId || !selectedChat) return;
    sendMessage({
      to: selectedChat.client.phone, // Telefone real do cliente (não UUID)
      content,
      type: 'text',
    });
  };

  const handleSendMedia = useCallback(async (file: File, caption: string) => {
    if (!selectedChatId || !selectedChat) return;

    try {
      // 1. Upload para Supabase Storage
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro no upload');
      }

      const { url, mimeType } = await res.json();

      // 2. Determinar tipo de mídia
      let mediaType = 'document';
      if (mimeType.startsWith('image/')) mediaType = 'image';
      else if (mimeType.startsWith('video/')) mediaType = 'video';
      else if (mimeType.startsWith('audio/')) mediaType = 'audio';

      // 3. Enviar via WhatsApp
      sendMessage({
        to: selectedChat.client.phone,
        content: caption || file.name,
        type: mediaType,
        mediaUrl: url,
        caption: caption || undefined,
      });
    } catch (err) {
      console.error('[ChatArea] Erro ao enviar mídia:', err);
      alert('Erro ao enviar arquivo. Tente novamente.');
    }
  }, [selectedChatId, selectedChat, sendMessage]);

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
        {selectedChat?.client.avatar_url ? (
          <img
            src={selectedChat.client.avatar_url}
            alt={selectedChat.client.name}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold"
            style={{ backgroundColor: getAvatarColor(selectedChat?.client.name || selectedChatId || '') }}
          >
            {getInitials(selectedChat?.client.name || '?')}
          </div>
        )}
        <div>
          <p className="text-sm font-medium text-wa-text-primary">
            {selectedChat?.client.name || 'Cliente'}
          </p>
          <p className="text-xs text-wa-text-secondary">
            {selectedChat?.client.phone || ''}
          </p>
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
      <MessageInput onSend={handleSend} onSendMedia={handleSendMedia} isLoading={isSending} />
    </div>
  );
}
