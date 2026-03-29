'use client';

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { MessageCircle, Loader2, ArrowLeft, BookOpen, ArrowLeftRight, MoreVertical, History, Phone, User, Tag, StickyNote } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMessages, useSendMessage } from '@/hooks/useWhatsApp';
import { useChatsStore } from '@/store/chats';
import { usePresence } from '@/hooks/usePresence';
import { VirtualizedMessageList } from './VirtualizedMessageList';
import { MessageInput } from './MessageInput';
import { AnneSuggestionCard } from './AnneSuggestionCard';
import { AvatarImage } from '@/components/ui/AvatarImage';
import { useAnneSuggestion } from '@/hooks/useAnneSuggestion';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/ui';
import type { Chat } from '@/types';
import type { MessageType } from '@/types';

/**
 * Área principal do chat — mensagens + input.
 * Resolve identidade do cliente via API + cache.
 */
export function ChatArea({
  onMobileBack,
  onOpenCatalog,
  onOpenTransfer,
}: {
  /** Mobile: callback para voltar à lista de conversas */
  onMobileBack?: () => void;
  /** Mobile: callback para abrir catálogo */
  onOpenCatalog?: () => void;
  /** Mobile: callback para abrir transferir */
  onOpenTransfer?: () => void;
}) {
  const { selectedChatId } = useChatsStore();
  const { data: messages = [], isLoading, isFetching } = useMessages(selectedChatId);
  const { mutate: sendMessage, isPending: isSending } = useSendMessage();
  const queryClient = useQueryClient();
  const { addToast } = useUIStore();
  const [isSyncing] = useState(false);

  // ── Anne Suggestion Card ──────────────────────────────────────────────────
  const { suggestion, updateStatus } = useAnneSuggestion(selectedChatId);
  const [fillText, setFillText] = useState<{ text: string; seq: number } | undefined>();

  // ── Lazy History Loading ──────────────────────────────────────────────────
  // Guarda quais clientIds já tiveram o histórico solicitado nesta sessão
  const historyRequestedRef = useRef<Set<string>>(new Set());
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (!selectedChatId) return;
    if (historyRequestedRef.current.has(selectedChatId)) return;

    // Marca imediatamente para evitar chamadas paralelas
    historyRequestedRef.current.add(selectedChatId);
    setIsLoadingHistory(true);

    api.post<{ loaded?: boolean; inserted?: number }>('/api/whatsapp/load-history', { clientId: selectedChatId })
      .then(res => {
        const d = res.data;
        // Se chegaram mensagens novas, invalida o cache para recarregar
        if (d?.inserted && d.inserted > 0) {
          queryClient.invalidateQueries({ queryKey: ['messages', selectedChatId] });
        }
      })
      .catch((e) => { console.warn('[ChatArea] load-history erro (silencioso):', e?.message); })
      .finally(() => setIsLoadingHistory(false));
  }, [selectedChatId, queryClient]);

  // ── Paginação regressiva ("Carregar mais") ────────────────────────────────
  // cursor = created_at da mensagem mais antiga carregada
  const [beforeCursor, setBeforeCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Resetar cursor quando muda de conversa
  useEffect(() => {
    setBeforeCursor(null);
    setHasMore(true);
  }, [selectedChatId]);

  const handleLoadMore = useCallback(async () => {
    if (!selectedChatId || isLoadingMore || !hasMore) return;

    // Cursor: created_at da mensagem mais antiga já exibida
    const oldestMsg = messages[0];
    const cursor = beforeCursor ?? oldestMsg?.created_at ?? null;
    if (!cursor) return;

    setIsLoadingMore(true);
    try {
      const res = await api.get<{ data: any[] }>(
        `/api/messages/${selectedChatId}?limit=50&before=${encodeURIComponent(cursor)}`,
      );
      if (res.error) throw new Error(res.error);
      const older: any[] = (res.data as any)?.data ?? [];

      if (older.length === 0) {
        setHasMore(false);
        return;
      }

      // Atualiza o cursor para a mensagem mais antiga deste lote
      const newCursor = older[0]?.created_at ?? cursor;
      setBeforeCursor(newCursor);

      // Mescla com o cache do React Query preservando ordem cronológica
      queryClient.setQueryData(
        ['messages', selectedChatId],
        (prev: any[] = []) => {
          const existingIds = new Set(prev.map((m: any) => m.id));
          const fresh = older.filter((m: any) => !existingIds.has(m.id));
          return [...fresh, ...prev];
        },
      );
    } catch {
      /* silencioso */
    } finally {
      setIsLoadingMore(false);
    }
  }, [selectedChatId, isLoadingMore, hasMore, messages, beforeCursor, queryClient]);

  // Buscar dados do cliente selecionado via API (resolve por ID, telefone ou conversa)
  // IMPORTANTE: queryKey=['client', selectedChatId] — mesma chave usada em CRMSidebar e ClientBrainSidebar
  // para que o React Query deduplicar a request e compartilhar o cache entre os 3 componentes.
  const { data: clientInfo } = useQuery({
    queryKey: ['client', selectedChatId],
    queryFn: async () => {
      if (!selectedChatId) return null;
      // Grupos (@g.us) não têm entrada na tabela clients — skip
      if (selectedChatId.includes('@g.us')) return null;
      const res = await api.get(`/api/clients/${selectedChatId}`);
      if (res.error) return null;
      const raw = res.data as any;
      return raw?.data || raw || null;
    },
    enabled: !!selectedChatId && !selectedChatId.includes('@g.us'),
    staleTime: 60_000,
  });

  // Tentar achar o chat no cache das infinite queries (para phone)
  // Lookup O(1) direto por chave — evita iterar todo o cache a cada render
  const cachedChat = useMemo(() => {
    if (!selectedChatId) return null;

    // 1. Tentar cache direto de chats flat
    const flat = queryClient.getQueryData<Chat[]>(['chats']);
    if (flat) {
      const found = flat.find((c: Chat) => c.client?.id === selectedChatId);
      if (found) return found;
    }

    // 2. Fallback: infinite query (páginas)
    const infinite = queryClient.getQueryData<any>(['chats', 'infinite']);
    if (infinite?.pages) {
      for (const page of infinite.pages) {
        const found = page?.data?.find((c: Chat) => c.client?.id === selectedChatId);
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

  // Presença do contato (online / digitando / gravando)
  const { label: presenceLabel, status: presenceStatus } = usePresence(resolvedPhone);

  // presenceSubscribe removido — endpoint 404 nesta versão da Evolution API (v2.3.7).
  // PRESENCE_UPDATE chega automaticamente via webhook quando o contato digita.

  const handleSend = (content: string) => {
    if (!selectedChatId) return;

    if (!resolvedPhone) {
      addToast({ type: 'warning', title: 'Aguarde', message: 'Número do cliente ainda não carregado. Tente novamente em instantes.' });
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
      addToast({ type: 'warning', title: 'Aguarde', message: 'Número do cliente ainda não carregado. Tente novamente em instantes.' });
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
      addToast({ type: 'error', title: 'Erro no envio', message: 'Não foi possível enviar o arquivo. Tente novamente.' });
    }
  }, [selectedChatId, resolvedPhone, sendMessage]);

  // Estado vazio — nenhum chat selecionado
  if (!selectedChatId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-wa-bg-conversation gap-4 p-8">
        <div className="w-20 h-20 rounded-2xl bg-wa-bg-panel flex items-center justify-center shadow-sm">
          <MessageCircle size={32} className="text-crm-primary/40" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-wa-text-primary">Nenhuma conversa selecionada</p>
          <p className="text-xs text-wa-text-secondary max-w-xs leading-relaxed">
            Escolha uma conversa na lista ao lado para começar a atender.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-3 mt-2">
          <kbd className="px-2 py-1 bg-wa-bg-panel border border-wa-border rounded-lg text-[11px] text-wa-text-secondary font-mono shadow-sm">Ctrl+K</kbd>
          <span className="text-xs text-wa-text-secondary">buscar conversa</span>
          <span className="text-wa-border">·</span>
          <kbd className="px-2 py-1 bg-wa-bg-panel border border-wa-border rounded-lg text-[11px] text-wa-text-secondary font-mono shadow-sm">J / K</kbd>
          <span className="text-xs text-wa-text-secondary">navegar</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col h-full min-h-0 overflow-x-hidden">
      {/* ━━━ HEADER MOBILE — WhatsApp style (md: hidden, usa header desktop) ━━━ */}
      <div className="md:hidden flex items-center h-14 px-2 bg-crm-primary gap-2 shrink-0">
        {/* Back button */}
        <button
          onClick={onMobileBack}
          className="w-9 h-9 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10 active:bg-white/20 transition-colors shrink-0"
          aria-label="Voltar"
        >
          <ArrowLeft size={20} />
        </button>

        {/* Avatar */}
        <div className="relative shrink-0">
          <AvatarImage
            src={clientData?.avatar_url}
            name={clientData?.name || selectedChatId || '?'}
            size={36}
            rounded="full"
          />
          {presenceStatus === 'online' && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#25d366] rounded-full border-2 border-crm-primary" />
          )}
        </div>

        {/* Nome + presença */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate leading-tight">
            {clientData?.name || 'Cliente'}
          </p>
          {presenceLabel ? (
            <p className={cn(
              'text-xs truncate',
              presenceStatus === 'typing' || presenceStatus === 'recording'
                ? 'text-[#25d366]'
                : 'text-white/60'
            )}>
              {presenceLabel}
            </p>
          ) : clientData?.phone ? (
            <p className="text-xs text-white/60 truncate">{clientData.phone}</p>
          ) : null}
        </div>

        {/* Ações rápidas mobile */}
        <div className="flex items-center gap-1 shrink-0">
          {onOpenCatalog && (
            <button
              onClick={onOpenCatalog}
              className="w-9 h-9 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10 active:bg-white/20 transition-colors"
              title="Catálogo"
            >
              <BookOpen size={18} />
            </button>
          )}
          {onOpenTransfer && (
            <button
              onClick={onOpenTransfer}
              className="w-9 h-9 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10 active:bg-white/20 transition-colors"
              title="Transferir"
            >
              <ArrowLeftRight size={18} />
            </button>
          )}
        </div>
      </div>

      {/* ━━━ HEADER DESKTOP ━━━ */}
      <div className="hidden md:flex h-14 bg-wa-bg-panel border-b border-wa-border items-center px-4 gap-3 shrink-0">
        <div className="relative shrink-0">
          <AvatarImage
            src={clientData?.avatar_url}
            name={clientData?.name || selectedChatId || '?'}
            size={40}
            rounded="full"
          />
          {presenceStatus === 'online' && (
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-[#25d366] rounded-full border-2 border-wa-bg-panel" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-wa-text-primary truncate leading-tight">
            {clientData?.name || 'Cliente'}
          </p>
          {presenceLabel ? (
            <p className={cn(
              'text-xs truncate',
              presenceStatus === 'typing' || presenceStatus === 'recording'
                ? 'text-[#25d366] animate-pulse font-medium'
                : 'text-wa-text-secondary'
            )}>
              {presenceLabel}
            </p>
          ) : clientData?.phone ? (
            <p className="text-xs text-wa-text-secondary truncate flex items-center gap-1">
              <Phone size={10} className="shrink-0" />
              {clientData.phone}
            </p>
          ) : null}
        </div>

        {/* Indicadores de estado discretos */}
        <div className="flex items-center gap-2 shrink-0">
          {(isSyncing || (isFetching && !isLoading)) && (
            <div className="flex items-center gap-1 text-[10px] text-wa-text-secondary">
              <Loader2 size={11} className="animate-spin text-wa-accent-green" />
              <span className="hidden lg:inline">sincronizando</span>
            </div>
          )}
          {isLoadingHistory && (
            <div className="flex items-center gap-1 text-[10px] text-wa-text-secondary">
              <History size={11} className="animate-pulse" />
              <span className="hidden lg:inline">histórico</span>
            </div>
          )}
        </div>

        {/* Ações rápidas */}
        <div className="flex items-center gap-0.5 shrink-0">
          {onOpenCatalog && (
            <button
              onClick={onOpenCatalog}
              title="Catálogo de produtos"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-wa-text-secondary hover:text-wa-text-primary hover:bg-wa-bg-conversation transition-colors"
            >
              <BookOpen size={16} />
            </button>
          )}
          {onOpenTransfer && (
            <button
              onClick={onOpenTransfer}
              title="Transferir conversa"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-wa-text-secondary hover:text-wa-text-primary hover:bg-wa-bg-conversation transition-colors"
            >
              <ArrowLeftRight size={16} />
            </button>
          )}
          <button
            title="Ver perfil do cliente"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-wa-text-secondary hover:text-wa-text-primary hover:bg-wa-bg-conversation transition-colors"
          >
            <User size={16} />
          </button>
        </div>
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
        <VirtualizedMessageList
          messages={messages}
          autoScroll
          isLoadingMore={isLoadingMore}
          onLoadMore={hasMore ? handleLoadMore : undefined}
        />
      )}

      {/* Anne Suggestion Card — exibido quando send_mode='suggest' */}
      {suggestion && (
        <AnneSuggestionCard
          suggestion={suggestion}
          onSend={(text) => {
            handleSend(text);
            void updateStatus({ id: suggestion.id, status: 'sent' });
          }}
          onEdit={(text) => {
            setFillText(prev => ({ text, seq: (prev?.seq ?? 0) + 1 }));
            void updateStatus({ id: suggestion.id, status: 'dismissed' });
          }}
          onDismiss={() => void updateStatus({ id: suggestion.id, status: 'dismissed' })}
        />
      )}

      {/* Message input */}
      <MessageInput onSend={handleSend} onSendMedia={handleSendMedia} isLoading={isSending} disabled={!resolvedPhone} recipientPhone={resolvedPhone || undefined} recipientName={clientData?.name || undefined} clientId={selectedChatId || undefined} fillText={fillText} />
    </div>
  );
}
