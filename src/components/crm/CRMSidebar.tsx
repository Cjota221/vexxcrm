'use client';

import { useState } from 'react';
import {
  X,
  User,
  ShoppingBag,
  MessageSquare,
  Send,
  StickyNote,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useChatsStore } from '@/store/chats';
import { useUIStore } from '@/store/ui';
import { ClientCard } from './ClientCard';
import { OrderHistory } from './OrderHistory';
import type { Client, Order } from '@/types';

type Tab = 'client' | 'orders' | 'notes';

/**
 * Sidebar CRM — exibe dados do cliente selecionado, pedidos, notas.
 * Ocupa a coluna direita do layout de atendimento.
 */
export function CRMSidebar() {
  const { selectedChatId } = useChatsStore();
  const { crmSidebarOpen, setCrmSidebarOpen } = useUIStore();
  const [activeTab, setActiveTab] = useState<Tab>('client');
  const [notes, setNotes] = useState('');

  // TODO: buscar dados reais do cliente e pedidos via React Query
  const mockClient: Client | null = selectedChatId
    ? {
        id: selectedChatId,
        tenant_id: '',
        name: 'Cliente Demo',
        phone: '11999998888',
        phone_normalized: '5511999998888',
        email: 'cliente@email.com',
        ltv: 2450.0,
        ticket_medio: 245.0,
        total_pedidos: 10,
        status: 'ativo',
        tags: ['VIP', 'recorrente'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    : null;

  const mockOrders: Order[] = [];

  if (!crmSidebarOpen || !selectedChatId) return null;

  const TABS: { key: Tab; label: string; icon: typeof User }[] = [
    { key: 'client', label: 'Cliente', icon: User },
    { key: 'orders', label: 'Pedidos', icon: ShoppingBag },
    { key: 'notes', label: 'Notas', icon: StickyNote },
  ];

  return (
    <aside className="w-80 bg-white border-l border-surface-200 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-surface-200 shrink-0">
        <h3 className="text-sm font-semibold text-txt-primary">Painel CRM</h3>
        <button
          onClick={() => setCrmSidebarOpen(false)}
          className="p-1.5 rounded-lg text-txt-secondary hover:text-txt-primary hover:bg-surface-100 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-200 shrink-0">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors border-b-2 ${
              activeTab === key
                ? 'text-crm-primary border-crm-primary'
                : 'text-txt-secondary border-transparent hover:text-txt-primary'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'client' && mockClient && (
          <ClientCard client={mockClient} />
        )}

        {activeTab === 'orders' && (
          <OrderHistory orders={mockOrders} />
        )}

        {activeTab === 'notes' && (
          <div className="space-y-3">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Adicione notas sobre este cliente..."
              className="w-full h-40 p-3 text-sm border border-surface-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-crm-primary/30 focus:border-crm-primary transition-all"
            />
            <button className="w-full btn btn-primary text-sm">
              <StickyNote size={14} />
              Salvar notas
            </button>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="border-t border-surface-200 p-3 shrink-0">
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-secondary text-xs py-2">
            <MessageSquare size={12} />
            Enviar link
          </button>
          <button className="btn btn-primary text-xs py-2">
            <Send size={12} />
            Carrinho
          </button>
        </div>
      </div>
    </aside>
  );
}
