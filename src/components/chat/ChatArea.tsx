'use client';

import { useMemo, useState, useCallback } from 'react';
import { MessageCircle, Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMessages, useSendMessage } from '@/hooks/useWhatsApp';
import { useChatsStore } from '@/store/chats';
import { VirtualizedMessageList } from './VirtualizedMessageList';
import { MessageInput } from './MessageInput';
import { AvatarImage } from '@/components/ui/AvatarImage';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { Chat } from '@/types';
import type { MessageType } from '@/types';

/**
 * Área principal do chat — mensagens + input.
 * Resolve identidade do cliente via API + cache.
 */
export function ChatArea() {
  const { selectedChatId } = useChatsStore();
  const { data: messages = [], isLoading, isFetching } = useMessages(selectedChatId);
  const { mutate: sendMessage, isPending: isSending } = useSendMessage();
  const queryClient = useQueryClient();
  const [isSyncing] = useState(false);

  // Buscar dados do cliente selecionado via API (resolve por ID, telefone ou conversa)
  const { data: clientInfo } = useQuery({
    queryKey: ['client-info', selectedChatId],
    queryFn: async () => {
      if (!selectedChatId) return null;
      const res = await api.get(`/api/clients/${selectedChatId}`);
      if (res.error) return null;
      const raw = res.data as any;
      return raw?.data || raw || null;
    },
    enabled: !!selectedChatId,
    staleTime: 60_000,
  });

  // Tentar achar o chat no cache das infinite queries (para phone)
  const cachedChat = useMemo(() => {
    if (!selectedChatId) return null;

    // Tentar no cache de chats infinitos
    const cacheEntries = queryClient.getQueriesData<any>({ queryKey: ['chats'] });
    for (const [, data] of cacheEntries) {
      if (data?.pages) {
        for (const page of data.pages) {
          const found = page?.data?.find((c: Chat) => c.client?.id === selectedChatId);
          if (found) return found;
        }
      }
      if (Array.isArray(data)) {
        const found = data.find((c: Chat) => c.client?.id === selectedChatId);
        if (found) return found;
      }
    }
    return null;
  }, [selectedChatId, queryClient]);

  // Montar dados do cliente: prioridade clientInfo (API) > cachedChat > fallback
  const clientData = useMemo(() => {
    const c = clientInfo || cachedChat?.client;
    if (!c) return null;
    return {
      name: c.name || c.contact_name || 'Cliente',
      phone: c.phone || c.phone_normalized || '',
      avatar_url: c.avatar_url || null,
    };
  }, [clientInfo, cachedChat]);

  // Resolver o telefone do cliente com fallback: clientData > cachedChat > selectedChatId
  const resolvedPhone = clientData?.phone
    || cachedChat?.client?.phone
    || cachedChat?.client?.phone_normalized
    || (selectedChatId?.includes('@') ? selectedChatId.split('@')[0] : selectedChatId)
    || '';

  const handleSend = (content: string) => {
    if (!selectedChatId) return;

    if (!resolvedPhone) {
      alert('Número do cliente ainda não carregado. Aguarde um momento e tente novamente.');
      return;
    }

    sendMessage({
      to: resolvedPhone,
      content,
      type: 'text',
      _queryClientId: selectedChatId, // UUID real — garante optimistic na query certa
      clientId: selectedChatId,       // UUID passado ao send/route.ts para salvar na conversa certa
    });
  };

  const handleSendMedia = useCallback(async (file: File, caption: string) => {
    if (!selectedChatId) return;

    if (!resolvedPhone) {
      alert('Número do cliente ainda não carregado. Aguarde um momento e tente novamente.');
      return;
    }

    try {
      // 1. Upload para Supabase Storage (com auth)
      const formData = new FormData();
      formData.append('file', file);

      // Obter token de auth
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        headers,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro no upload');
      }

      const { url, mimeType } = await res.json();

      // 2. Determinar tipo de mídia
      let mediaType: MessageType = 'document';
      if (mimeType.startsWith('image/')) mediaType = 'image';
      else if (mimeType.startsWith('video/')) mediaType = 'video';
      else if (mimeType.startsWith('audio/')) mediaType = 'audio';

      // 3. Enviar via WhatsApp (useSendMessage faz o optimistic UI)
      sendMessage({
        to: resolvedPhone,
        content: caption || file.name,
        type: mediaType,
        mediaUrl: url,
        caption: caption || undefined,
        _queryClientId: selectedChatId, // UUID real — garante optimistic na query certa
        clientId: selectedChatId,       // UUID passado ao send/route.ts para salvar na conversa certa
      });
    } catch (err) {
      console.error('[ChatArea] Erro ao enviar mídia:', err);
      alert('Erro ao enviar arquivo. Tente novamente.');
    }
  }, [selectedChatId, resolvedPhone, sendMessage]);

  // Estado vazio — nenhum chat selecionado
  if (!selectedChatId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-wa-bg-conversation gap-3">
        <div className="w-16 h-16 rounded-full bg-wa-bg-panel flex items-center justify-center">
          <MessageCircle size={28} className="text-wa-text-secondary" />
        </div>
        <p className="text-sm text-wa-text-secondary text-center max-w-xs leading-relaxed">
          Selecione uma conversa para começar a atender seus clientes.
        </p>
        <p className="text-xs text-wa-text-secondary/60">
          Use <kbd className="px-1.5 py-0.5 bg-wa-bg-panel rounded text-xs">Ctrl+K</kbd> para buscar
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Chat header */}
      <div className="h-14 bg-wa-bg-panel border-b border-wa-border flex items-center px-4 gap-3 shrink-0">
        <AvatarImage
          src={clientData?.avatar_url}
          name={clientData?.name || selectedChatId || '?'}
          size={40}
          rounded="full"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-wa-text-primary truncate">
            {clientData?.name || 'Cliente'}
          </p>
          <p className="text-xs text-wa-text-secondary truncate">
            {clientData?.phone || ''}
          </p>
        </div>
        {/* Indicador de sincronização discreto */}
        {(isSyncing || (isFetching && !isLoading)) && (
          <div className="flex items-center gap-1.5 text-xs text-wa-text-secondary shrink-0">
            <Loader2 size={12} className="animate-spin text-wa-accent-green" />
            <span className="hidden sm:inline text-[10px]">sincronizando</span>
          </div>
        )}
      </div>

      {/* Messages area — virtualizada */}
      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-wa-bg-conversation gap-3">
          <Loader2 size={28} className="animate-spin text-wa-accent-green/60" />
          <p className="text-xs text-wa-text-secondary">Carregando mensagens…</p>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center bg-wa-bg-conversation">
          <p className="text-sm text-wa-text-secondary bg-wa-bg-panel/80 px-4 py-2 rounded-lg">
            Início da conversa
          </p>
        </div>
      ) : (
        <VirtualizedMessageList messages={messages} autoScroll />
      )}

      {/* Message input */}
      <MessageInput onSend={handleSend} onSendMedia={handleSendMedia} isLoading={isSending} disabled={!resolvedPhone} recipientPhone={resolvedPhone || undefined} />
    </div>
  );
}
