'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  User,
  ShoppingBag,
  StickyNote,
  Phone,
  Mail,
  Calendar,
  TrendingUp,
  Star,
  ExternalLink,
  Loader2,
  Plus,
  Trash2,
  MapPin,
  RefreshCw,
  Pencil,
  Check,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useChatsStore } from '@/store/chats';
import { useUIStore } from '@/store/ui';
import { OrderHistory } from './OrderHistory';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, formatRelativeTime, getInitials, getAvatarColor, cn } from '@/lib/utils';
import type { Order } from '@/types';

type Tab = 'client' | 'orders' | 'notes';

const STATUS_MAP: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  novo: { label: 'Novo', variant: 'info' },
  ativo: { label: 'Ativo', variant: 'success' },
  active: { label: 'Ativo', variant: 'success' },
  vip: { label: 'VIP', variant: 'warning' },
  risco: { label: 'Em risco', variant: 'danger' },
  inativo: { label: 'Inativo', variant: 'neutral' },
  inactive: { label: 'Inativo', variant: 'neutral' },
  blocked: { label: 'Bloqueado', variant: 'danger' },
};

interface ClientNote {
  id: string;
  content: string;
  type: string;
  created_by: string | null;
  created_at: string;
}

/**
 * Sidebar CRM — exibe dados REAIS do cliente selecionado, pedidos e notas.
 * Auto-abre ao selecionar chat e recarrega dados em tempo real.
 */
export function CRMSidebar() {
  const { selectedChatId } = useChatsStore();
  const { crmSidebarOpen, setCrmSidebarOpen } = useUIStore();
  const [activeTab, setActiveTab] = useState<Tab>('client');
  const queryClient = useQueryClient();
  const prevChatRef = useRef<string | null>(null);

  // Auto-abrir sidebar e resetar tab quando um chat é selecionado
  useEffect(() => {
    if (selectedChatId && selectedChatId !== prevChatRef.current) {
      setCrmSidebarOpen(true);
      setActiveTab('client');

      // Invalidar cache do cliente anterior para garantir dados frescos
      if (prevChatRef.current) {
        queryClient.removeQueries({ queryKey: ['client', prevChatRef.current] });
        queryClient.removeQueries({ queryKey: ['client-notes', prevChatRef.current] });
      }

      prevChatRef.current = selectedChatId;
    }
  }, [selectedChatId, setCrmSidebarOpen, queryClient]);

  const {
    data: clientData,
    isLoading: isLoadingClient,
    refetch: refetchClient,
    isFetching: isFetchingClient,
  } = useQuery({
    queryKey: ['client', selectedChatId],
    queryFn: async () => {
      if (!selectedChatId) return null;
      const response = await api.get(`/api/clients/${selectedChatId}`);
      if (response.error) throw new Error(response.error);
      const raw = response.data as any;
      return raw?.data || raw;
    },
    enabled: !!selectedChatId && crmSidebarOpen,
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const { data: notesData, isLoading: isLoadingNotes } = useQuery({
    queryKey: ['client-notes', selectedChatId],
    queryFn: async () => {
      if (!selectedChatId) return [];
      const response = await api.get(`/api/clients/${selectedChatId}/notes`);
      if (response.error) throw new Error(response.error);
      const raw = response.data as any;
      return raw?.data || [];
    },
    enabled: !!selectedChatId && crmSidebarOpen && activeTab === 'notes',
    staleTime: 30_000,
  });

  if (!crmSidebarOpen || !selectedChatId) return null;

  const client = clientData as any;
  const orders: Order[] = client?.recent_orders || [];
  const notes: ClientNote[] = (notesData as ClientNote[]) || [];
  const status = STATUS_MAP[client?.status] || { label: client?.status || 'Ativo', variant: 'success' as const };

  const TABS: { key: Tab; label: string; icon: typeof User; count?: number }[] = [
    { key: 'client', label: 'Cliente', icon: User },
    { key: 'orders', label: 'Pedidos', icon: ShoppingBag, count: orders.length },
    { key: 'notes', label: 'Notas', icon: StickyNote, count: notes.length },
  ];

  return (
    <aside className="w-80 bg-white border-l border-surface-200 flex flex-col h-full overflow-hidden">
      <div className="h-16 flex items-center justify-between px-4 border-b border-surface-200 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-txt-primary">Painel CRM</h3>
          {isFetchingClient && (
            <Loader2 size={12} className="animate-spin text-crm-primary" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => refetchClient()}
            title="Recarregar dados"
            className="p-1.5 rounded-lg text-txt-secondary hover:text-txt-primary hover:bg-surface-100 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setCrmSidebarOpen(false)}
            className="p-1.5 rounded-lg text-txt-secondary hover:text-txt-primary hover:bg-surface-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex border-b border-surface-200 shrink-0">
        {TABS.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors border-b-2',
              activeTab === key
                ? 'text-crm-primary border-crm-primary'
                : 'text-txt-secondary border-transparent hover:text-txt-primary'
            )}
          >
            <Icon size={14} />
            {label}
            {count != null && count > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 text-[10px] bg-surface-100 rounded-full">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoadingClient ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={24} className="animate-spin text-crm-primary" />
          </div>
        ) : !client ? (
          <div className="text-center py-10">
            <User size={32} className="mx-auto text-txt-secondary mb-2" />
            <p className="text-sm text-txt-secondary">Cliente não encontrado</p>
            <p className="text-xs text-txt-muted mt-1">Sincronize os dados primeiro</p>
          </div>
        ) : (
          <>
            {activeTab === 'client' && (
              <ClientTab
                client={client}
                status={status}
                orders={orders}
                clientId={client.id || selectedChatId!}
                onNameSaved={() => {
                  queryClient.invalidateQueries({ queryKey: ['client', selectedChatId] });
                  queryClient.invalidateQueries({ queryKey: ['chats'] });
                }}
              />
            )}
            {activeTab === 'orders' && (
              <OrderHistory orders={orders} isLoading={isLoadingClient} />
            )}
            {activeTab === 'notes' && (
              <NotesTab clientId={client.id || selectedChatId} notes={notes} isLoading={isLoadingNotes} />
            )}
          </>
        )}
      </div>

      {client && (
        <div className="border-t border-surface-200 p-3 shrink-0">
          <a
            href={`/clientes/${selectedChatId}`}
            className="w-full btn btn-secondary text-xs py-2 flex items-center justify-center gap-1.5"
          >
            <ExternalLink size={12} />
            Ver perfil completo
          </a>
        </div>
      )}
    </aside>
  );
}

function ClientTab({ client, status, orders, clientId, onNameSaved }: {
  client: any;
  status: { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' };
  orders: Order[];
  clientId: string;
  onNameSaved: () => void;
}) {
  const c = client;
  const isVirtual = c.is_virtual === true;

  // Estado de edição inline do nome
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setNameInput(c.name || '');
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const cancelEdit = () => {
    setEditingName(false);
    setNameInput('');
  };

  const saveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === c.name) { cancelEdit(); return; }
    setSavingName(true);
    try {
      const response = await api.patch(`/api/clients/${clientId}`, { name: trimmed });
      if (response.error) throw new Error(response.error);
      onNameSaved();
      setEditingName(false);
    } catch (err) {
      console.error('[CRMSidebar] Erro ao salvar nome:', err);
    } finally {
      setSavingName(false);
    }
  };

  // Extrair endereço: prioridade = dados do cliente, fallback = metadata do último pedido
  const address = useMemo(() => {
    // 1. Endereço do cliente diretamente
    if (c.address_city || c.address_state || c.address_street) {
      return {
        street: c.address_street,
        number: c.address_number,
        complement: c.address_complement,
        neighborhood: c.address_neighborhood,
        city: c.address_city,
        state: c.address_state,
        zip: c.address_zip,
        source: 'cadastro',
      };
    }

    // 2. Fallback: extrair do metadata do último pedido
    if (orders.length > 0) {
      for (const order of orders) {
        const raw = (order as any).metadata;
        const meta = typeof raw === 'string'
          ? (() => { try { return JSON.parse(raw); } catch { return {}; } })()
          : (raw || {});

        const addr = meta.endereco || meta.address || meta.shipping_address || meta.entrega;
        if (addr && (addr.cidade || addr.city || addr.uf || addr.state)) {
          return {
            street: addr.rua || addr.logradouro || addr.street || '',
            number: addr.numero || addr.number || '',
            complement: addr.complemento || addr.complement || '',
            neighborhood: addr.bairro || addr.neighborhood || '',
            city: addr.cidade || addr.city || '',
            state: addr.uf || addr.estado || addr.state || '',
            zip: addr.cep || addr.zip || addr.zipcode || '',
            source: 'pedido',
          };
        }
      }
    }

    return null;
  }, [c, orders]);
  
  return (
    <div className="space-y-4">
      {/* Aviso de cliente virtual (sem cadastro) */}
      {isVirtual && (
        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-700 font-medium">👤 Contato sem cadastro</p>
          <p className="text-[10px] text-amber-600 mt-0.5">Sincronize o FacilZap para vincular este contato a um cliente existente.</p>
        </div>
      )}
      
      <div className="flex items-start gap-3">
        {c.avatar_url && !avatarError ? (
          <img src={c.avatar_url} alt={c.name} className="w-14 h-14 rounded-full object-cover shrink-0 border-2 border-surface-200" onError={() => setAvatarError(true)} />
        ) : (
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white font-semibold text-lg shrink-0"
            style={{ backgroundColor: getAvatarColor(c.name || c.id) }}
          >
            {getInitials(c.name || '?')}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {editingName ? (
              <div className="flex items-center gap-1.5 w-full">
                <input
                  ref={nameInputRef}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveName();
                    if (e.key === 'Escape') cancelEdit();
                  }}
                  className="flex-1 min-w-0 px-2 py-1 text-sm border border-crm-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
                  placeholder="Nome do contato..."
                  disabled={savingName}
                />
                <button
                  onClick={saveName}
                  disabled={savingName || !nameInput.trim()}
                  className="p-1.5 rounded-lg bg-crm-primary text-white hover:bg-crm-primary/90 disabled:opacity-50 transition-colors"
                  title="Salvar (Enter)"
                >
                  {savingName ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                </button>
                <button
                  onClick={cancelEdit}
                  className="p-1.5 rounded-lg text-txt-secondary hover:bg-surface-100 transition-colors"
                  title="Cancelar (Esc)"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-txt-primary truncate">{c.name || 'Sem nome'}</h3>
                <button
                  onClick={startEdit}
                  className="p-1 rounded hover:bg-surface-100 text-txt-muted hover:text-crm-primary transition-colors"
                  title="Editar nome do contato"
                >
                  <Pencil size={12} />
                </button>
                <Badge variant={status.variant}>{status.label}</Badge>
                {isVirtual && <Badge variant="warning">Visitante</Badge>}
                {c.name_manual && (
                  <span className="text-[10px] text-crm-primary font-medium" title="Nome editado manualmente">✎ manual</span>
                )}
              </>
            )}
          </div>
          <div className="mt-1 space-y-0.5">
            <p className="text-xs text-txt-secondary flex items-center gap-1">
              <Phone size={11} /> {c.phone || c.phone_normalized || '—'}
            </p>
            {c.email && (
              <p className="text-xs text-txt-secondary flex items-center gap-1 truncate">
                <Mail size={11} /> {c.email}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-surface-50 rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-txt-muted flex items-center justify-center gap-1"><TrendingUp size={10} /> LTV</p>
          <p className="text-sm font-bold text-crm-primary">{formatCurrency(c.ltv || 0)}</p>
        </div>
        <div className="bg-surface-50 rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-txt-muted flex items-center justify-center gap-1"><Star size={10} /> Ticket</p>
          <p className="text-sm font-bold text-txt-primary">{formatCurrency(c.avg_ticket || c.ticket_medio || 0)}</p>
        </div>
        <div className="bg-surface-50 rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-txt-muted flex items-center justify-center gap-1"><ShoppingBag size={10} /> Pedidos</p>
          <p className="text-sm font-bold text-txt-primary">{c.total_orders || c.total_pedidos || orders.length || 0}</p>
        </div>
      </div>

      {Array.isArray(c.tags) && c.tags.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-txt-muted uppercase tracking-wider font-medium">Tags</p>
          <div className="flex flex-wrap gap-1">
            {c.tags.map((tag: string) => (
              <span key={tag} className="px-2 py-0.5 bg-crm-primary/10 text-crm-primary text-xs rounded-full">{tag}</span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5 border-t border-surface-100 pt-3">
        {(c.last_order_at || c.ultima_compra) && (
          <p className="text-xs text-txt-secondary flex items-center gap-1.5">
            <Calendar size={11} /> \u00daltima compra: {formatRelativeTime(c.last_order_at || c.ultima_compra)}
          </p>
        )}
        {c.birthday && (
          <p className="text-xs text-txt-secondary flex items-center gap-1.5">
            <Calendar size={11} /> Anivers\u00e1rio: {formatDate(c.birthday)}
          </p>
        )}
        <p className="text-xs text-txt-secondary flex items-center gap-1.5">
          <Calendar size={11} /> Cliente desde: {formatDate(c.created_at)}
        </p>
      </div>

      {address && (
        <div className="border-t border-surface-100 pt-3">
          <div className="flex items-center gap-1.5 mb-1">
            <MapPin size={11} className="text-txt-muted" />
            <p className="text-[10px] text-txt-muted uppercase tracking-wider font-medium">
              Endereço {address.source === 'pedido' && '(do pedido)'}
            </p>
          </div>
          {(address.street || address.number) && (
            <p className="text-xs text-txt-secondary">
              {[address.street, address.number, address.complement].filter(Boolean).join(', ')}
            </p>
          )}
          {address.neighborhood && (
            <p className="text-xs text-txt-secondary">{address.neighborhood}</p>
          )}
          <p className="text-xs text-txt-secondary">
            {[address.city, address.state].filter(Boolean).join(' - ')}
            {address.zip && ` · ${address.zip}`}
          </p>
        </div>
      )}

      {c.cpf && (
        <div className="border-t border-surface-100 pt-3">
          <p className="text-xs text-txt-secondary"><span className="text-txt-muted">CPF:</span> {c.cpf}</p>
        </div>
      )}
    </div>
  );
}

function NotesTab({ clientId, notes, isLoading }: {
  clientId: string;
  notes: ClientNote[];
  isLoading: boolean;
}) {
  const [newNote, setNewNote] = useState('');
  const queryClient = useQueryClient();

  const createNote = useMutation({
    mutationFn: async (content: string) => {
      const response = await api.post(`/api/clients/${clientId}/notes`, { content, type: 'note' });
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-notes', clientId] });
      setNewNote('');
    },
  });

  const deleteNote = useMutation({
    mutationFn: async (noteId: string) => {
      const response = await api.delete(`/api/clients/${clientId}/notes?noteId=${noteId}`);
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-notes', clientId] });
    },
  });

  const handleSubmit = () => {
    const trimmed = newNote.trim();
    if (!trimmed || createNote.isPending) return;
    createNote.mutate(trimmed);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Adicione uma anota\u00e7\u00e3o sobre este cliente..."
          className="w-full h-24 p-3 text-sm border border-surface-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-crm-primary/30 focus:border-crm-primary transition-all"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={!newNote.trim() || createNote.isPending}
          className={cn(
            'w-full btn btn-primary text-sm flex items-center justify-center gap-1.5',
            (!newNote.trim() || createNote.isPending) && 'opacity-50 cursor-not-allowed'
          )}
        >
          {createNote.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          {createNote.isPending ? 'Salvando...' : 'Adicionar nota'}
        </button>
        <p className="text-[10px] text-txt-muted text-center">Ctrl+Enter para salvar</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={20} className="animate-spin text-crm-primary" />
        </div>
      ) : notes.length === 0 ? (
        <div className="text-center py-6">
          <StickyNote size={24} className="mx-auto text-txt-secondary mb-2" />
          <p className="text-sm text-txt-secondary">Nenhuma nota ainda</p>
          <p className="text-xs text-txt-muted">Adicione anota\u00e7\u00f5es para acompanhar o atendimento</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="bg-surface-50 rounded-lg p-3 group relative">
              <p className="text-sm text-txt-primary whitespace-pre-wrap pr-6">{note.content}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-txt-muted">{formatRelativeTime(note.created_at)}</span>
                <button
                  onClick={() => {
                    if (confirm('Excluir esta nota?')) {
                      deleteNote.mutate(note.id);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
