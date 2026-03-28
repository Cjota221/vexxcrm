'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useConnectionStore } from '@/store/connection';
import { useChatsStore } from '@/store/chats';
import type { NewMessageEvent, MessageStatusEvent, TypingIndicatorEvent, ConnectionUpdateEvent } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

/** Converte timestamp para ms — suporta epoch em segundos da Evolution API */
function tsMs(v: string | number | null | undefined): number {
  if (!v) return 0;
  const n = typeof v === 'string' ? Number(v) : v;
  if (isNaN(n)) return new Date(v as string).getTime();
  return n < 1e10 ? n * 1000 : n;
}

/**
 * Hook para receber atualizações real-time via SSE.
 *
 * Conecta ao endpoint /api/sse e atualiza React Query cache
 * automaticamente ao receber eventos.
 *
 * NOTA: Em ambientes CDN/Netlify, SSE pode ser bloqueado (403/ERR_HTTP2).
 * Nesse caso, a detecção de falha rápida (<2s) desabilita SSE para a sessão
 * inteira — o Supabase Realtime (em useMessages) já cobre as mensagens.
 */
export function useRealtimeMessages() {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isMountedRef = useRef(true);
  // Flag de sessão: SSE bloqueado neste ambiente (CDN/proxy) — não tentar mais
  const sseBlockedRef = useRef(false);
  // Contagem de falhas rápidas consecutivas (< 30s após abrir) para detectar HTTP2 block
  const quickFailCountRef = useRef(0);
  const lastEventTimeRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  // Após 8 falhas rápidas consecutivas (< 30s sem receber evento), bloquear SSE
  // NOTA: No Netlify free o SSE cai periodicamente — não bloquear cedo demais
  const MAX_QUICK_FAILS = 8;
  const { setSSEStatus } = useConnectionStore();
  const { setTyping } = useChatsStore();

  // Obter tenantId da store para filtrar o canal Realtime
  const tenantId = useAuthStore((s) => s.user?.tenant_id ?? null);

  // ─── Canal Supabase Realtime GLOBAL ───────────────────────────────────────
  // Garante que mensagens apareçam mesmo quando o SSE está bloqueado (Netlify
  // serverless usa processos isolados — o eventBus in-memory nunca cruza entre
  // instâncias). Este canal é uma conexão WebSocket direta ao Supabase, não
  // passa pelo Netlify, e funciona em produção sem nenhuma configuração extra.
  //
  // REQUISITO (executar uma vez no Supabase SQL Editor):
  //   ALTER TABLE messages REPLICA IDENTITY FULL;
  //   ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  //   (ver migration 023_enable_realtime_messages.sql)
  //
  // CRÍTICO: O canal precisa do tenant_id no filter para que o Supabase
  // Realtime entregue os eventos mesmo sem RLS configurado para broadcast.
  // Sem o filter, o canal depende 100% de RLS — se get_tenant_id() for
  // lento ou falhar, nenhum evento chega.
  const globalRealtimeChannelRef = useRef<RealtimeChannel | null>(null);
  // Reconexão do canal Realtime com backoff exponencial (internet caiu/voltou)
  const realtimeReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeReconnectAttemptsRef = useRef(0);
  const MAX_REALTIME_RECONNECT = 10; // Para de tentar após ~17 minutos (backoff cap 120s)
  // Debounce para invalidateQueries(['chats']) — evita double-fetch quando o
  // canal global E o canal por-clientId disparam ao mesmo tempo.
  const chatsInvalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedInvalidateChats = useCallback(() => {
    if (chatsInvalidateTimerRef.current) clearTimeout(chatsInvalidateTimerRef.current);
    chatsInvalidateTimerRef.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    }, 300);
  }, [queryClient]);

  // FIX: Usar useState em vez de useRef para realtimeFallback.
  // Refs não causam re-render — quando o canal falha e a flag muda,
  // o useEffect nunca reexecuta e o canal sem filtro nunca é criado.
  const [realtimeFallback, setRealtimeFallback] = useState(false);
  // Contador que incrementa para forçar useEffect a recriar o canal após CHANNEL_ERROR
  const [realtimeVersion, setRealtimeVersion] = useState(0);

  useEffect(() => {
    // Aguardar o tenantId estar disponível antes de subscrever
    if (!tenantId) return;

    // Remover canal anterior se tenant mudou
    if (globalRealtimeChannelRef.current) {
      supabase.removeChannel(globalRealtimeChannelRef.current);
      globalRealtimeChannelRef.current = null;
    }

    // Callback compartilhado para processar mensagem recebida
    const handleNewMessage = (payload: { new: Record<string, unknown> }) => {
      const raw = payload.new;
      const clientId = raw.client_id as string | undefined;

      if (!clientId) {
        debouncedInvalidateChats();
        return;
      }

      const existingCache = queryClient.getQueryData<import('@/types').Message[]>(['messages', clientId]);
      // Se não há cache ainda (conversa aberta mas query ainda não retornou), forçar fetch
      if (!existingCache) {
        queryClient.invalidateQueries({ queryKey: ['messages', clientId] });
        debouncedInvalidateChats();
        return;
      }

      const incoming: import('@/types').Message = {
        id: raw.id as string,
        tenant_id: raw.tenant_id as string,
        client_id: clientId,
        remote_jid: raw.sender_phone ? `${raw.sender_phone}@s.whatsapp.net` : '',
        message_id: (raw.external_id as string) || (raw.id as string),
        from_me: raw.direction === 'outbound',
        content: (raw.content as string) || '',
        type: raw.type as import('@/types').Message['type'],
        media_url: raw.media_url as string | undefined,
        media_type: raw.media_mime_type as string | undefined,
        media_size: raw.media_size as number | undefined,
        timestamp: raw.created_at as string,
        status: raw.status as import('@/types').Message['status'],
        metadata: (raw.metadata as Record<string, unknown>) || {},
        created_at: raw.created_at as string,
      };

      queryClient.setQueryData<import('@/types').Message[]>(
        ['messages', clientId],
        (old = []) => {
          if (old.some(m => m.id === incoming.id)) return old;

          const hasOptimistic = old.some(
            (m) =>
              ((m as any)._optimistic === true || (m as any)._clientId) &&
              m.from_me === incoming.from_me &&
              m.content === incoming.content &&
              Math.abs(
                new Date(m.created_at).getTime() -
                  new Date(incoming.created_at).getTime()
              ) < 30_000
          );

          if (hasOptimistic) {
            return old
              .map((m) =>
                (m as any)._optimistic &&
                m.from_me === incoming.from_me &&
                m.content === incoming.content
                  ? { ...incoming, _optimistic: false }
                  : m
              )
              .sort(
                (a, b) =>
                  tsMs(a.timestamp ?? a.created_at) -
                  tsMs(b.timestamp ?? b.created_at)
              );
          }

          return [...old, incoming].sort(
            (a, b) =>
              tsMs(a.timestamp ?? a.created_at) -
              tsMs(b.timestamp ?? b.created_at)
          );
        }
      );

      debouncedInvalidateChats();
    };

    // Handler para UPDATE em messages: atualiza status (sent→delivered→read) e deleted/edited
    const handleMessageUpdate = (payload: { new: Record<string, unknown> }) => {
      const raw = payload.new;
      const msgId = raw.id as string | undefined;
      if (!msgId) return;

      // client_id pode estar ausente no payload se REPLICA IDENTITY não for FULL.
      // Nesse caso busca em todos os caches de mensagens qual contém essa mensagem.
      let clientId = raw.client_id as string | undefined;

      if (!clientId) {
        // Varrer todos os caches ['messages', *] para encontrar a mensagem por ID
        const allQueries = queryClient.getQueriesData<import('@/types').Message[]>({ queryKey: ['messages'] });
        for (const [queryKey, messages] of allQueries) {
          if (messages?.some(m => m.id === msgId)) {
            clientId = queryKey[1] as string;
            break;
          }
        }
      }

      if (!clientId) return;

      const applyUpdate = (m: import('@/types').Message) => {
        if (m.id !== msgId) return m;
        const newMeta = raw.metadata as Record<string, unknown> | undefined;
        return {
          ...m,
          status: (raw.status as import('@/types').Message['status']) ?? m.status,
          deleted: (raw.deleted as boolean) ?? (m as any).deleted,
          deleted_at: (raw.deleted_at as string) ?? (m as any).deleted_at,
          edited: (raw.edited as boolean) ?? (m as any).edited,
          edited_at: (raw.edited_at as string) ?? (m as any).edited_at,
          content: raw.edited ? ((raw.content as string) ?? m.content) : m.content,
          // Reactions chegam via metadata.reactions quando handleReaction chama sync_message_reactions.
          // Só atualiza metadata se veio no payload (REPLICA IDENTITY FULL) E se reactions mudou.
          // Nunca sobrescreve com undefined para não perder reactions existentes no cache.
          metadata: newMeta?.reactions !== undefined
            ? { ...(m.metadata as Record<string, unknown> || {}), reactions: newMeta.reactions }
            : newMeta
              ? { ...(m.metadata as Record<string, unknown> || {}), ...newMeta }
              : m.metadata,
        };
      };

      queryClient.setQueryData<import('@/types').Message[]>(
        ['messages', clientId],
        (old = []) => old.map(applyUpdate)
      );
    };

    // Usar filtro explícito por tenant_id quando possível.
    // Se migration 025 ainda não foi executada, o Supabase retorna CHANNEL_ERROR
    // com filtro → reconectar sem filtro (RLS cuida do isolamento).
    const usingFilter = !realtimeFallback;
    const channelName = usingFilter
      ? `tenant-messages-${tenantId}`
      : `tenant-messages-nofilter-${tenantId}`;

    const msgConfig = usingFilter
      ? { event: 'INSERT' as const, schema: 'public', table: 'messages', filter: `tenant_id=eq.${tenantId}` }
      : { event: 'INSERT' as const, schema: 'public', table: 'messages' };

    const msgUpdateConfig = usingFilter
      ? { event: 'UPDATE' as const, schema: 'public', table: 'messages', filter: `tenant_id=eq.${tenantId}` }
      : { event: 'UPDATE' as const, schema: 'public', table: 'messages' };

    const convConfig = usingFilter
      ? { event: 'UPDATE' as const, schema: 'public', table: 'conversations', filter: `tenant_id=eq.${tenantId}` }
      : { event: 'UPDATE' as const, schema: 'public', table: 'conversations' };

    const convInsertConfig = usingFilter
      ? { event: 'INSERT' as const, schema: 'public', table: 'conversations', filter: `tenant_id=eq.${tenantId}` }
      : { event: 'INSERT' as const, schema: 'public', table: 'conversations' };

    console.log(`[Realtime] Conectando canal "${channelName}" (filtro=${usingFilter})`);

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', msgConfig, handleNewMessage)
      // ── UPDATE em messages: status (delivered/read) e deleted/edited em tempo real
      .on('postgres_changes', msgUpdateConfig, handleMessageUpdate)
      // ── UPDATE e INSERT em conversations: lista de chats reordena em tempo real
      .on('postgres_changes', convConfig, () => { debouncedInvalidateChats(); })
      .on('postgres_changes', convInsertConfig, () => { debouncedInvalidateChats(); })
      .subscribe((status) => {
        console.log(`[Realtime] ${channelName}: ${status}`);

        if (status === 'CHANNEL_ERROR' && usingFilter && !realtimeFallback) {
          // Filtro rejeitado pelo Supabase (migration 025 não executada ainda)
          // → reconectar SEM filtro, deixando RLS fazer o isolamento
          console.warn('[Realtime] Filtro rejeitado — reconectando sem filtro (fallback RLS)');
          realtimeReconnectAttemptsRef.current = 0; // nova fase, resetar contagem
          setRealtimeFallback(true); // FIX: setState causa re-render → useEffect reexecuta → canal sem filtro é criado
          supabase.removeChannel(channel);
          globalRealtimeChannelRef.current = null;
          // Reagendar reconnect fora do callback de subscribe
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['chats'] });
          }, 100);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Canal nofilter falhou (internet caiu, JWT expirou, etc.)
          // Reconectar com backoff exponencial — cap 120s, máx 10 tentativas
          queryClient.invalidateQueries({ queryKey: ['chats'] });

          if (realtimeReconnectAttemptsRef.current < MAX_REALTIME_RECONNECT) {
            const baseDelay = Math.min(2000 * Math.pow(2, realtimeReconnectAttemptsRef.current), 120_000);
            const jitter = baseDelay * 0.2 * (Math.random() - 0.5);
            const delay = Math.round(baseDelay + jitter);
            console.warn(`[Realtime] Reconectando em ${Math.round(delay / 1000)}s (tentativa ${realtimeReconnectAttemptsRef.current + 1}/${MAX_REALTIME_RECONNECT})`);

            if (realtimeReconnectTimerRef.current) clearTimeout(realtimeReconnectTimerRef.current);
            realtimeReconnectTimerRef.current = setTimeout(() => {
              if (!isMountedRef.current) return;
              supabase.removeChannel(channel);
              globalRealtimeChannelRef.current = null;
              realtimeReconnectAttemptsRef.current++;
              // Incrementar versão → força re-render → useEffect reexecuta → canal recriado
              setRealtimeVersion(v => v + 1);
            }, delay);
          } else {
            console.error('[Realtime] Máximo de tentativas atingido. Canal offline. Recarregue a página para reconectar.');
          }
        } else if (status === 'SUBSCRIBED') {
          // Reconexão bem-sucedida — resetar contagem
          realtimeReconnectAttemptsRef.current = 0;
          if (realtimeReconnectTimerRef.current) {
            clearTimeout(realtimeReconnectTimerRef.current);
            realtimeReconnectTimerRef.current = null;
          }
        }
      });

    globalRealtimeChannelRef.current = channel;

    return () => {
      if (chatsInvalidateTimerRef.current) clearTimeout(chatsInvalidateTimerRef.current);
      if (realtimeReconnectTimerRef.current) {
        clearTimeout(realtimeReconnectTimerRef.current);
        realtimeReconnectTimerRef.current = null;
      }
      if (globalRealtimeChannelRef.current) {
        supabase.removeChannel(globalRealtimeChannelRef.current);
        globalRealtimeChannelRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, queryClient, debouncedInvalidateChats, realtimeFallback, realtimeVersion]);
  // ─── Fim do canal Realtime global ────────────────────────────────────────

  const handleEvent = useCallback(
    (event: MessageEvent) => {
      try {
        const { type, data } = JSON.parse(event.data);

        switch (type) {
          case 'new_message': {
            const payload = data as NewMessageEvent;
            // Injetar mensagem DIRETAMENTE no cache — sem invalidar (sem refetch).
            // Invalidar causaria um fetch que pode apagar mensagens otimistas pendentes.
            queryClient.setQueryData<import('@/types').Message[]>(
              ['messages', payload.client_id],
              (old = []) => {
                // Evitar duplicata se a mensagem já está no cache (ex: chegou pelo Realtime do Supabase)
                if (old.some(m => m.id === payload.message?.id)) return old;
                // Remover otimista confirmado pelo mesmo external_id / content + timestamp próximo
                const without = old.filter(m => {
                  if (!(m as any)._optimistic) return true;
                  const sameContent = m.content === payload.message?.content;
                  const timeDiff = Math.abs(
                    new Date(m.created_at).getTime() - new Date(payload.message?.created_at ?? 0).getTime()
                  );
                  return !(sameContent && timeDiff < 30_000);
                });
                return [...without, payload.message].sort(
                  (a, b) => tsMs(a.timestamp ?? a.created_at) - tsMs(b.timestamp ?? b.created_at)
                );
              }
            );
            // Reordenar lista de chats com debounce para não duplicar requests
            debouncedInvalidateChats();
            break;
          }

          case 'message_status': {
            const payload = data as MessageStatusEvent;
            // Atualizar status CIRURGICAMENTE no cache — sem invalidar (sem refetch)
            queryClient.setQueryData<import('@/types').Message[]>(
              ['messages', payload.client_id],
              (old = []) =>
                old.map(m =>
                  m.id === payload.message_id
                    ? { ...m, status: payload.status }
                    : m
                )
            );
            break;
          }

          case 'typing_indicator': {
            const payload = data as TypingIndicatorEvent;
            setTyping(payload.client_id, payload.is_typing);
            break;
          }

          case 'connection_update': {
            const payload = data as ConnectionUpdateEvent;
            const { setWhatsAppStatus } = useConnectionStore.getState();
            setWhatsAppStatus(
              payload.status === 'open'
                ? 'connected'
                : payload.status === 'connecting'
                  ? 'connecting'
                  : 'disconnected'
            );
            // Invalidar config para refletir novo status
            queryClient.invalidateQueries({ queryKey: ['tenant-config'] });
            queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
            break;
          }

          case 'media_transcription': {
            // IA processou áudio/imagem — recarregar mensagens
            const payload = data as { client_id: string; message_id: string };
            queryClient.invalidateQueries({
              queryKey: ['messages', payload.client_id],
            });
            break;
          }

          case 'anne_notification': {
            // Notificação da Anne (ex: boas-vindas ao conectar, gatilho executado)
            const payload = data as { message: string; type: string; chat_id?: string };
            console.log(`[Anne] ${payload.type}: ${payload.message}`);
            // Propagar para listeners no window (ex: AnneInsightsTab)
            window.dispatchEvent(
              new CustomEvent('sse:anne_notification', { detail: payload })
            );
            break;
          }

          case 'kanban_moved': {
            // Anne moveu um card de pipeline → atualizar KanbanDrawer + BrainSidebar
            const payload = data as {
              client_id: string;
              chat_id: string;
              de_coluna: string | null;
              para_coluna: string;
              motivo: string;
              trigger: string;
              timestamp: string;
            };
            queryClient.invalidateQueries({ queryKey: ['kanban-counts'] });
            queryClient.invalidateQueries({ queryKey: ['kanban-pipeline', payload.client_id] });
            // Propagar como CustomEvent para listeners no window
            window.dispatchEvent(
              new CustomEvent('sse:kanban_moved', { detail: payload })
            );
            break;
          }

          case 'client_updated': {
            // Nome ou dados do cliente foram atualizados automaticamente
            const payload = data as { client_id: string };
            queryClient.invalidateQueries({ queryKey: ['brain-client'] });
            queryClient.invalidateQueries({ queryKey: ['chats'] });
            window.dispatchEvent(
              new CustomEvent('sse:client_updated', { detail: payload })
            );
            break;
          }

          case 'orders_updated': {
            // tracking_code inserido num pedido
            const payload = data as { client_id: string; tracking_code: string };
            queryClient.invalidateQueries({ queryKey: ['brain-client'] });
            window.dispatchEvent(
              new CustomEvent('sse:orders_updated', { detail: payload })
            );
            break;
          }
        }
      } catch {
        // Ignore heartbeats e payloads inválidos
      }
    },
    [queryClient, setTyping, debouncedInvalidateChats]
  );

  const connect = useCallback(async () => {
    // ⚠️ SSE DESATIVADO — O endpoint /api/sse retorna 204 imediatamente.
    // O Supabase Realtime (canal global-new-messages acima) é a fonte de eventos.
    // Não abrimos EventSource para evitar requests desnecessários ao Netlify.
    return;

    // eslint-disable-next-line no-unreachable
    if (sseBlockedRef.current) return;

    // Obter token da sessão para autenticar SSE
    let token = '';
    try {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token || '';
    } catch {
      console.warn('⚠️ SSE: Não foi possível obter token');
    }

    if (!token) {
      reconnectTimeoutRef.current = setTimeout(() => { connect(); }, 3000);
      return;
    }

    const connectTime = Date.now();
    const eventSource = new EventSource(`/api/sse?token=${encodeURIComponent(token)}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setSSEStatus('connected');
      reconnectAttemptsRef.current = 0;
      lastEventTimeRef.current = Date.now();
    };

    eventSource.onmessage = (ev) => {
      lastEventTimeRef.current = Date.now(); // registrar quando chegou o último evento
      quickFailCountRef.current = 0;          // conexão estável — zerar contador de falhas rápidas
      handleEvent(ev);
    };

    eventSource.onerror = () => {
      setSSEStatus('disconnected');
      eventSource.close();

      const elapsed = Date.now() - connectTime;
      const timeSinceLastEvent = Date.now() - (lastEventTimeRef.current || connectTime);

      // Caso 1: Bloqueio imediato de CDN (< 500ms para falhar) — Auth 403, CORS, etc.
      // Caso 2: ERR_HTTP2_PROTOCOL_ERROR — abre com 200, cai em < 30s SEM nenhum evento
      //         (o Netlify free aceita a conexão mas quebra o stream HTTP/2 logo depois)
      //
      // IMPORTANTE: elapsed < 500 NÃO bloqueia sozinho — no Netlify free é muito comum
      // o SSE abrir e fechar em < 500ms sem ser um bloqueio permanente de CDN.
      // Só bloqueamos se falhou MUITAS vezes (>= MAX_QUICK_FAILS), o que indica
      // que o ambiente realmente não suporta SSE.
      const isQuickFail = elapsed < 2_000 || (timeSinceLastEvent < 30_000 && lastEventTimeRef.current === 0);
      if (isQuickFail) {
        quickFailCountRef.current++;
      }

      if (quickFailCountRef.current >= MAX_QUICK_FAILS) {
        // Bloquear SSE para a sessão — Supabase Realtime cobre as mensagens
        sseBlockedRef.current = true;
        setSSEStatus('disconnected');
        return;
      }

      // Backoff exponencial: 1s, 2s, 4s, 8s, 16s, 30s (cap)
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        const baseDelay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30_000);
        const jitter = baseDelay * 0.2 * (Math.random() - 0.5);
        const delay = Math.round(baseDelay + jitter);
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) connect();
        }, delay);
      } else {
        setSSEStatus('disconnected');
      }
    };
  }, [handleEvent, setSSEStatus]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    // Reconectar silenciosamente quando o Supabase renova o JWT
    // Isso evita o loop de 401 → onerror → backoff → 401 → ...
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (!isMountedRef.current) return;
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        reconnectAttemptsRef.current = 0; // reset backoff
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        connect();
      }
    });

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      setSSEStatus('disconnected');
    };
  }, [connect, setSSEStatus]);
}
