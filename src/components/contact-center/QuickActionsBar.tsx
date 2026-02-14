'use client';

import {
  Tag,
  ArrowRightLeft,
  Clock,
  Zap,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuickActions, useExecuteQuickAction } from '@/hooks/useContactCenter';
import { useChatsStore } from '@/store/chats';

const ICON_MAP: Record<string, typeof Tag> = {
  tag: Tag,
  transfer: ArrowRightLeft,
  clock: Clock,
  zap: Zap,
};

/**
 * Barra de Quick Actions — ações rápidas contextuais para a conversa ativa.
 */
export function QuickActionsBar() {
  const { selectedChatId } = useChatsStore();
  const { data: actions = [] } = useQuickActions();
  const executeMutation = useExecuteQuickAction();

  if (!selectedChatId || actions.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 bg-surface-50 border-t border-surface-200">
      <span className="text-[10px] text-txt-muted font-medium mr-1">Ações:</span>
      {actions.map((action) => {
        const Icon = ICON_MAP[action.icon] || Zap;
        const isExecuting =
          executeMutation.isPending &&
          executeMutation.variables?.action_slug === action.slug;

        return (
          <button
            key={action.id}
            onClick={() =>
              executeMutation.mutate({
                conversation_id: selectedChatId,
                action_slug: action.slug,
              })
            }
            disabled={isExecuting}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all',
              'bg-white border border-surface-200 text-txt-secondary',
              'hover:border-crm-primary hover:text-crm-primary',
              isExecuting && 'opacity-50 cursor-wait'
            )}
          >
            {isExecuting ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Icon size={11} />
            )}
            {action.name}
          </button>
        );
      })}
    </div>
  );
}
