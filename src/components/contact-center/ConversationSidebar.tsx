'use client';

/**
 * ConversationSidebar — Sidebar esquerda da Central de Atendimento v4
 *
 * Estrutura:
 *  ┌──────────────────────────────────────┐
 *  │  [Logo VEXX]  [Busca] [⚡] [📣] [🧠] │  ← ActionBar compacta
 *  ├──────────────────────────────────────┤
 *  │  [Todas] [Não lidas] [Aguardando]... │  ← Filtros pill
 *  ├──────────────────────────────────────┤
 *  │  ▼ Lista de conversas (100% do espaço│
 *  │    sem obstáculo nenhum)             │
 *  └──────────────────────────────────────┘
 */

import { useState, useMemo, useRef, useCallback, useEffect, memo } from 'react';
import {
  Search,
  MessageSquarePlus,
  Megaphone,
  Brain,
  X,
  RefreshCw,
  Loader2,
  Power,
  PowerOff,
  ChevronDown,
  Plus,
  Trash2,
  GripVertical,
  Link2,
  MousePointerClick,
  Image as ImageIcon,
  Type,
  AlertCircle,
  Activity,
  MoreVertical,
  UserCheck,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { formatRelativeTime, truncate, getInitials, getAvatarColor } from '@/lib/utils';
import { useChatsStore } from '@/store/chats';
import { useAuthStore } from '@/store/auth';
import { useConnectionStore } from '@/store/connection';
import { useInfiniteChats, useRefreshChats } from '@/hooks/useChats';
import { useDebounce } from '@/hooks/useDebounce';
import { api } from '@/lib/api';
import type { Chat, ChatFilter } from '@/types';
import type { TemplateBlock, TemplateBlockType } from '@/types';

/* ─── Props ─────────────────────────────────────────────────── */

interface ConversationSidebarProps {
  anneEnabled: boolean;
  onAnneToggle: (enabled: boolean) => void;
  onOpenCampaign: () => void;
  /** Mobile: chamado quando o usuário toca num chat para abrir a tela do chat */
  onMobileChatOpen?: () => void;
}

/* ─── Filtros disponíveis ────────────────────────────────────── */

const FILTERS: { label: string; value: ChatFilter; badge?: boolean }[] = [
  { label: 'Todas', value: 'all' },
  { label: 'Não lidas', value: 'unread', badge: true },
  { label: 'Aguardando', value: 'waiting', badge: true },
  { label: 'Minhas', value: 'mine' },
  { label: 'Arquivadas', value: 'archived' },
];

/* ─── Tipos de painel ativo ──────────────────────────────────── */

type ActivePanel = 'anne' | null;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ACTION BAR — barra de ações compacta no topo
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function ActionBar({
  anneEnabled,
  onAnneToggle,
  onOpenCampaign,
  activePanel,
  onTogglePanel,
  totalUnread,
}: {
  anneEnabled: boolean;
  onAnneToggle: (v: boolean) => void;
  onOpenCampaign: () => void;
  activePanel: ActivePanel;
  onTogglePanel: (p: ActivePanel) => void;
  totalUnread: number;
}) {
  // Badge de gatilhos 24h para Anne
  const { data: anneBadge } = useQuery({
    queryKey: ['anne-badge'],
    queryFn: async () => {
      const res = await api.get<{ stats: { gatilhos_24h: number } }>('/api/v2/anne/log?dias=1');
      return res.data?.stats?.gatilhos_24h ?? 0;
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  return (
    <div className="flex items-center justify-between h-14 px-3 bg-white border-b border-gray-100 shrink-0">
      {/* Marca */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-crm-primary flex items-center justify-center shrink-0">
          <span className="text-[10px] font-black text-white tracking-tight">VX</span>
        </div>
        <span className="text-sm font-bold text-gray-800 hidden sm:block">Central</span>
        {totalUnread > 0 && (
          <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-5 text-center">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </div>

      {/* Ações */}
      <div className="flex items-center gap-0.5">
        {/* Anne Monitor */}
        <div className="relative">
          <ActionIconBtn
            icon={<Brain size={15} />}
            label="Anne (F4)"
            active={activePanel === 'anne'}
            onClick={() => onTogglePanel('anne')}
            accent={anneEnabled ? 'green' : undefined}
          />
          {/* Dot de status */}
          <span className={cn(
            'absolute bottom-1 right-1 w-2 h-2 rounded-full border-2 border-white pointer-events-none',
            anneEnabled ? 'bg-emerald-500' : 'bg-gray-400'
          )} />
          {/* Badge gatilhos */}
          {anneBadge != null && anneBadge > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center pointer-events-none">
              {anneBadge > 99 ? '99+' : anneBadge}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Botão de ação com ícone ─────────────────────────────────── */

function ActionIconBtn({
  icon, label, active, onClick, accent,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  accent?: 'amber' | 'green';
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        'relative w-8 h-8 flex items-center justify-center rounded-lg transition-all',
        active
          ? 'bg-crm-primary text-white shadow-sm'
          : accent === 'amber'
            ? 'text-amber-500 hover:bg-amber-50'
            : accent === 'green'
              ? 'text-emerald-600 hover:bg-emerald-50'
              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
      )}
    >
      {icon}
    </button>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   PAINEL DE BUSCA
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function SearchPanelInline({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const debouncedQ = useDebounce(query, 300);
  const { setSearchQuery } = useChatsStore();

  useEffect(() => {
    setSearchQuery(debouncedQ);
    if (debouncedQ) onClose();
  }, [debouncedQ, setSearchQuery, onClose]);

  const QUICK = [
    { label: 'tag:pago', desc: 'Pagos' },
    { label: 'tag:risco_churn', desc: 'Em risco' },
    { label: 'tag:lead_quente', desc: 'Lead quente' },
    { label: 'tag:inativo', desc: 'Inativos' },
  ];

  return (
    <div className="px-3 pb-3 space-y-2 bg-white border-b border-gray-100">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 focus-within:border-crm-primary transition-colors">
        <Search size={13} className="text-gray-400 shrink-0" />
        <input
          autoFocus
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400 text-gray-800"
          placeholder="nome, tag, número..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && onClose()}
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600">
            <X size={11} />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {QUICK.map(f => (
          <button
            key={f.label}
            onClick={() => { setSearchQuery(f.label); onClose(); }}
            className="px-2 py-1 text-[10px] font-mono bg-crm-primary/5 text-crm-primary rounded-lg hover:bg-crm-primary/15 transition-colors"
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   PAINEL ANNE — toggle + stats
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function AnnePanelInline({
  anneEnabled,
  onAnneToggle,
  onClose,
}: {
  anneEnabled: boolean;
  onAnneToggle: (v: boolean) => void;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['anne-log-stats'],
    queryFn: async () => {
      const res = await api.get<{
        stats: {
          gatilhos_24h: number;
          executados_24h: number;
          escalados_24h: number;
          taxa_automacao: string;
        };
      }>('/api/v2/anne/log?dias=1');
      return res.data;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const stats = data?.stats;

  return (
    <div className="px-3 pb-3 space-y-2 bg-white border-b border-gray-100">
      {/* Toggle */}
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <span className={cn(
            'w-2 h-2 rounded-full',
            anneEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'
          )} />
          <span className="text-xs font-medium text-gray-700">
            Anne {anneEnabled ? 'ativada' : 'pausada'}
          </span>
        </div>
        <button
          onClick={() => onAnneToggle(!anneEnabled)}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
            anneEnabled
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          )}
        >
          {anneEnabled ? <Power size={11} /> : <PowerOff size={11} />}
          {anneEnabled ? 'Pausar' : 'Ativar'}
        </button>
      </div>

      {/* Stats grid */}
      {isLoading ? (
        <div className="flex justify-center py-1"><Loader2 size={12} className="animate-spin text-gray-400" /></div>
      ) : stats ? (
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { label: 'Gatilhos', v: stats.gatilhos_24h },
            { label: 'Exec.', v: stats.executados_24h },
            { label: 'Escal.', v: stats.escalados_24h },
            { label: 'Auto.', v: stats.taxa_automacao },
          ].map(s => (
            <div key={s.label} className="bg-gray-50 rounded-lg p-1.5 text-center border border-gray-100">
              <p className="text-[9px] text-gray-400">{s.label}</p>
              <p className="text-xs font-bold text-gray-700">{String(s.v)}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ITEM DA LISTA DE CHATS — limpo, sem obstrução
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ChatListItem = memo(function ChatListItem({
  chat,
  isSelected,
  onSelect,
}: {
  chat: Chat;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const hasUnread = chat.unread_count > 0;
  // "Fila" badge: exibido apenas para conversas não lidas com assignee vazio
  const showQueueBadge = hasUnread && !chat.assigned_to;
  // Fallback para iniciais quando a URL do avatar falha (ex: domínio morto)
  const [avatarError, setAvatarError] = useState(false);

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-gray-100',
        'border-b border-gray-100/80',
        isSelected
          ? 'bg-crm-primary/5 border-l-2 border-l-crm-primary'
          : 'hover:bg-gray-50 border-l-2 border-l-transparent'
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        {chat.client.avatar_url && !avatarError ? (
          <img
            src={chat.client.avatar_url}
            alt={chat.client.name}
            className="w-11 h-11 rounded-full object-cover"
            onError={() => setAvatarError(true)}
          />
        ) : (
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-semibold"
            style={{ backgroundColor: getAvatarColor(chat.client.name) }}
          >
            {getInitials(chat.client.name)}
          </div>
        )}
        {/* Dot de status online */}
        {hasUnread && (
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        {/* Linha 1: nome + hora */}
        <div className="flex items-center justify-between gap-2">
          <p className={cn(
            'text-sm truncate leading-tight',
            hasUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'
          )}>
            {chat.client.name}
          </p>
          <span className={cn(
            'text-[11px] shrink-0',
            hasUnread ? 'text-crm-primary font-semibold' : 'text-gray-400'
          )}>
            {chat.last_message?.timestamp
              ? formatRelativeTime(chat.last_message.timestamp)
              : ''}
          </span>
        </div>

        {/* Linha 2: preview + badges */}
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className={cn(
            'text-xs truncate flex-1',
            hasUnread ? 'text-gray-600' : 'text-gray-400'
          )}>
            {chat.last_message
              ? truncate(chat.last_message.content || '📷 Mídia', 38)
              : 'Sem mensagens'}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            {/* Badge Aguardando */}
            {showQueueBadge && (
              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-semibold rounded-md">
                Fila
              </span>
            )}
            {/* Contador não lidas */}
            {hasUnread && (
              <span className="min-w-5 h-5 px-1 bg-[#25d366] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {chat.unread_count > 9 ? '9+' : chat.unread_count}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HEADER MOBILE — estilo WhatsApp (oculto em md+)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function MobileListHeader({
  totalUnread,
  onOpenCampaign,
  onRefresh,
}: {
  totalUnread: number;
  onOpenCampaign: () => void;
  onRefresh: () => void;
}) {
  const { user } = useAuthStore();
  const { whatsappStatus } = useConnectionStore();
  const queryClient = useQueryClient();
  const [syncingAvatars, setSyncingAvatars] = useState(false);
  const [syncDone, setSyncDone] = useState(false);

  const dotCls = {
    connected:    'bg-[#25d366]',
    connecting:   'bg-amber-400 animate-pulse',
    disconnected: 'bg-red-500',
    unknown:      'bg-gray-400 animate-pulse',
  }[whatsappStatus];

  const handleSyncAvatars = async () => {
    if (syncingAvatars) return;
    setSyncingAvatars(true);
    setSyncDone(false);
    try {
      const res = await api.post<{ updated: number }>('/api/whatsapp/sync-avatars?limit=100');
      console.log(`[SyncAvatars] ${res.data?.updated ?? 0} fotos atualizadas`);
      // Invalidar cache de chats para exibir as novas fotos
      await queryClient.invalidateQueries({ queryKey: ['chats'] });
      setSyncDone(true);
      setTimeout(() => setSyncDone(false), 3000);
    } catch (err) {
      console.error('[SyncAvatars]', err);
    } finally {
      setSyncingAvatars(false);
    }
  };

  return (
    <div className="md:hidden flex items-center justify-between h-14 px-4 bg-crm-primary shrink-0">
      {/* Esquerda: avatar + nome */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center overflow-hidden shrink-0">
            {user?.avatar_url
              ? <img src={user.avatar_url} alt={user?.name} className="w-full h-full object-cover" />
              : <span className="text-white text-sm font-bold">{user ? getInitials(user.name) : 'U'}</span>
            }
          </div>
          {/* Dot conexão WhatsApp */}
          <span className={cn('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-crm-primary', dotCls)} />
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-tight">Conversas</p>
          {totalUnread > 0 && (
            <p className="text-[11px] text-white/60">{totalUnread} não lida{totalUnread > 1 ? 's' : ''}</p>
          )}
        </div>
      </div>
      {/* Direita: ações */}
      <div className="flex items-center gap-1">
        {/* Sincronizar fotos de perfil */}
        <button
          onClick={handleSyncAvatars}
          disabled={syncingAvatars}
          className="w-9 h-9 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10 active:bg-white/20 transition-colors disabled:opacity-50"
          title="Sincronizar fotos de perfil"
        >
          {syncingAvatars
            ? <Loader2 size={16} className="animate-spin" />
            : syncDone
              ? <UserCheck size={18} className="text-[#25d366]" />
              : <UserCheck size={18} />
          }
        </button>
        <button
          onClick={onOpenCampaign}
          className="w-9 h-9 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10 active:bg-white/20 transition-colors"
          title="Campanhas"
        >
          <Megaphone size={18} />
        </button>
        <button
          onClick={onRefresh}
          className="w-9 h-9 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10 active:bg-white/20 transition-colors"
          title="Atualizar"
        >
          <RefreshCw size={16} />
        </button>
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   COMPONENTE PRINCIPAL
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function ConversationSidebar({
  anneEnabled,
  onAnneToggle,
  onOpenCampaign,
  onMobileChatOpen,
}: ConversationSidebarProps) {
  const { selectedChatId, selectChat, activeFilter, setFilter, searchQuery, setSearchQuery } =
    useChatsStore();

  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const debouncedSearch = useDebounce(searchQuery, 300);

  // Badge Anne — exibido no botão da sidebar
  const { data: anneBadge } = useQuery({
    queryKey: ['anne-badge'],
    queryFn: async () => {
      const res = await api.get<{ stats: { gatilhos_24h: number } }>('/api/v2/anne/log?dias=1');
      return res.data?.stats?.gatilhos_24h ?? 0;
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteChats(activeFilter, debouncedSearch);

  const chats = useMemo(() => data?.pages.flatMap(p => p.data) ?? [], [data]);
  const totalCount = data?.pages[0]?.pagination?.total || chats.length;
  const totalUnread = chats.reduce((s, c) => s + (c.unread_count || 0), 0);

  // Forçar refetch ao montar
  useEffect(() => { refetch(); }, []);

  // Infinite scroll
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [e] = entries;
      if (e.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  useEffect(() => {
    observerRef.current = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: '100px',
      threshold: 0,
    });
    if (loadMoreRef.current) observerRef.current.observe(loadMoreRef.current);
    return () => observerRef.current?.disconnect();
  }, [handleObserver]);

  // Fechar painel ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setActivePanel(null);
      }
    };
    if (activePanel) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activePanel]);

  // Atalhos F1-F4
  useEffect(() => {
    const map: Record<string, ActivePanel | 'campaign'> = {
      F4: 'anne',
    };
    const handler = (e: KeyboardEvent) => {
      const action = map[e.key];
      if (!action) return;
      e.preventDefault();
      if (action === 'campaign') { onOpenCampaign(); return; }
      setActivePanel(p => (p === action ? null : action));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpenCampaign]);

  const togglePanel = useCallback((p: ActivePanel) => {
    setActivePanel(prev => (prev === p ? null : p));
  }, []);

  return (
    <div
      ref={sidebarRef}
      className="flex flex-col bg-white border-r border-gray-200 h-full overflow-hidden w-full"
    >
      {/* ━━━ HEADER MOBILE — WhatsApp style, oculto em desktop ━━━ */}
      <MobileListHeader
        totalUnread={totalUnread}
        onOpenCampaign={onOpenCampaign}
        onRefresh={() => refetch()}
      />

      {/* ── Barra de busca inline (desktop + mobile) ── */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 shrink-0 bg-white">
        <div className="flex items-center gap-2 flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus-within:border-crm-primary/60 transition-colors">
          <Search size={13} className="text-gray-400 shrink-0" />
          <input
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400 text-gray-800 min-w-0"
            placeholder="Buscar conversa..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); }}
            onKeyDown={e => e.key === 'Escape' && setSearchQuery('')}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600 shrink-0">
              <X size={11} />
            </button>
          )}
        </div>
        {/* Botão Anne compacto */}
        <div className="relative shrink-0">
          <button
            onClick={() => togglePanel('anne')}
            title="Anne (F4)"
            className={cn(
              'w-9 h-9 flex items-center justify-center rounded-xl transition-all',
              activePanel === 'anne'
                ? 'bg-crm-primary text-white shadow-sm'
                : anneEnabled
                  ? 'text-emerald-600 hover:bg-emerald-50'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
            )}
          >
            <Brain size={16} />
          </button>
          {/* Dot de status */}
          <span className={cn(
            'absolute bottom-1 right-1 w-2 h-2 rounded-full border-2 border-white pointer-events-none',
            anneEnabled ? 'bg-emerald-500' : 'bg-gray-300'
          )} />
          {anneBadge != null && anneBadge > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center pointer-events-none">
              {anneBadge > 99 ? '99+' : anneBadge}
            </span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          title="Atualizar lista"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* ── Painel Anne inline ── */}
      {activePanel === 'anne' && (
        <AnnePanelInline
          anneEnabled={anneEnabled}
          onAnneToggle={onAnneToggle}
          onClose={() => setActivePanel(null)}
        />
      )}

      {/* ── Filtros pill ── */}
      <div className="flex gap-1.5 px-3 pb-2 overflow-x-auto shrink-0">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all',
              activeFilter === f.value
                ? 'bg-crm-primary text-white shadow-sm'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200 border border-transparent'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Contador ── */}
      <div className="flex items-center justify-between px-4 pb-1 shrink-0">
        <span className="text-[11px] font-medium text-gray-400">
          {totalCount > 0 ? `${totalCount} conversa${totalCount !== 1 ? 's' : ''}` : 'Nenhuma conversa'}
        </span>
        {totalUnread > 0 && (
          <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-5 text-center">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </div>

      {/* ── Lista de conversas — 100% do espaço ── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-3 px-4 py-3">
                <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3 w-28 bg-gray-200 animate-pulse rounded" />
                  <div className="h-2 w-36 bg-gray-100 animate-pulse rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <Search size={20} className="text-gray-300" />
            </div>
            <p className="text-sm text-gray-500 font-medium">Nenhuma conversa</p>
            <p className="text-xs text-gray-400 mt-1">Tente mudar o filtro ou atualizar</p>
            <button
              onClick={() => refetch()}
              className="mt-3 text-xs text-crm-primary hover:underline font-medium"
            >
              Recarregar
            </button>
          </div>
        ) : (
          <>
            {chats.map(chat => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                isSelected={selectedChatId === chat.client.id}
                onSelect={() => {
                  selectChat(chat.client.id);
                  onMobileChatOpen?.();
                }}
              />
            ))}
            <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
              {isFetchingNextPage && (
                <Loader2 size={14} className="animate-spin text-crm-primary" />
              )}
              {!hasNextPage && chats.length > 25 && (
                <span className="text-[11px] text-gray-400">Fim da lista</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TEMPLATES QUICK PANEL — versão simplificada inline
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function TemplatesQuickPanel({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [text, setText] = useState('Olá {{nome}}! ');

  const vars = [...text.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]);

  return (
    <div className="px-3 pb-3 space-y-2 bg-white border-b border-gray-100">
      <input
        autoFocus
        className="w-full text-xs px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-crm-primary placeholder:text-gray-400"
        placeholder="Nome do template..."
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <textarea
        className="w-full text-xs px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-crm-primary resize-none placeholder:text-gray-400 h-20"
        placeholder="Mensagem... use {{nome}}, {{produto}}, etc."
        value={text}
        onChange={e => setText(e.target.value)}
      />
      {vars.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {vars.map((v, i) => (
            <span key={i} className="px-1.5 py-0.5 bg-crm-primary/10 text-crm-primary text-[9px] font-mono rounded">
              {`{{${v}}}`}
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <button
          onClick={onClose}
          className="flex-1 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          disabled={!name.trim() || !text.trim()}
          onClick={async () => {
            if (!name.trim()) return;
            await api.post('/api/templates', { name, blocks: [{ id: '1', type: 'text', order: 0, content: text }] });
            onClose();
          }}
          className="flex-1 py-1.5 text-xs font-semibold text-white bg-crm-primary rounded-lg hover:bg-crm-primary/90 disabled:opacity-40"
        >
          Salvar
        </button>
      </div>
    </div>
  );
}
