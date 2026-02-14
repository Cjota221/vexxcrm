'use client';

import { useState } from 'react';
import {
  ArrowRightLeft,
  Users,
  User,
  X,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQueues, useTransferConversation } from '@/hooks/useContactCenter';
import { useChatsStore } from '@/store/chats';

interface TransferDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Dialog de transferência de conversa — para outro agente ou fila.
 */
export function TransferDialog({ open, onClose }: TransferDialogProps) {
  const { selectedChatId } = useChatsStore();
  const { data: queues = [] } = useQueues();
  const transferMutation = useTransferConversation();
  const [mode, setMode] = useState<'queue' | 'agent'>('queue');
  const [reason, setReason] = useState('');

  if (!open || !selectedChatId) return null;

  const handleTransferQueue = (queueId: string) => {
    transferMutation.mutate(
      {
        conversation_id: selectedChatId,
        to_queue_id: queueId,
        reason: reason || undefined,
      },
      { onSuccess: () => onClose() }
    );
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl w-100 max-h-125 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ArrowRightLeft size={16} className="text-crm-primary" />
            <h3 className="text-sm font-semibold text-txt-primary">
              Transferir Conversa
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-txt-secondary hover:bg-surface-100"
          >
            <X size={16} />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-surface-200 shrink-0">
          <button
            onClick={() => setMode('queue')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors',
              mode === 'queue'
                ? 'text-crm-primary border-crm-primary'
                : 'text-txt-secondary border-transparent'
            )}
          >
            <Users size={13} />
            Para Fila
          </button>
          <button
            onClick={() => setMode('agent')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors',
              mode === 'agent'
                ? 'text-crm-primary border-crm-primary'
                : 'text-txt-secondary border-transparent'
            )}
          >
            <User size={13} />
            Para Agente
          </button>
        </div>

        {/* Reason */}
        <div className="px-4 pt-3 shrink-0">
          <input
            type="text"
            placeholder="Motivo da transferência (opcional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {mode === 'queue' ? (
            queues.length === 0 ? (
              <p className="text-xs text-txt-muted text-center py-4">
                Nenhuma fila disponível
              </p>
            ) : (
              queues.map((queue) => (
                <button
                  key={queue.id}
                  onClick={() => handleTransferQueue(queue.id)}
                  disabled={transferMutation.isPending}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-surface-50 transition-colors text-left disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-txt-secondary" />
                    <span className="text-xs font-medium text-txt-primary">
                      {queue.name}
                    </span>
                  </div>
                  {(queue.total_waiting || 0) > 0 && (
                    <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-semibold">
                      {queue.total_waiting} aguardando
                    </span>
                  )}
                </button>
              ))
            )
          ) : (
            <p className="text-xs text-txt-muted text-center py-4">
              Selecione um agente disponível para transferir
            </p>
          )}

          {transferMutation.isPending && (
            <div className="flex items-center justify-center py-3">
              <Loader2 size={16} className="animate-spin text-crm-primary" />
              <span className="text-xs text-txt-muted ml-2">
                Transferindo...
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
