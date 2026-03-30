'use client';

import { Plus } from 'lucide-react';
import type { MetaAdAccount } from '@/types/meta';

interface AccountTabsProps {
  accounts: MetaAdAccount[];
  activeAccount: MetaAdAccount | null;
  onSelect: (account: MetaAdAccount) => void;
  onAddClick: () => void;
  loading?: boolean;
}

export function AccountTabs({
  accounts,
  activeAccount,
  onSelect,
  onAddClick,
  loading,
}: AccountTabsProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-white">
        {[1, 2].map(i => (
          <div key={i} className="h-8 w-28 rounded-lg bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (accounts.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-100 bg-white overflow-x-auto">
      {accounts.map(account => {
        const isActive = activeAccount?.id === account.id;
        return (
          <button
            key={account.id}
            onClick={() => onSelect(account)}
            className={`
              flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
              whitespace-nowrap transition-all duration-150 border
              ${isActive
                ? 'bg-gray-50 border-gray-200 text-gray-900 shadow-sm'
                : 'bg-transparent border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              }
            `}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: account.cor }}
            />
            {account.nome}
            {isActive && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">
                {account.ad_account_id.replace('act_', '').slice(0, 6)}…
              </span>
            )}
          </button>
        );
      })}

      <button
        onClick={onAddClick}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium
          text-gray-400 hover:text-gray-600 hover:bg-gray-50 border border-transparent
          hover:border-gray-200 transition-all duration-150 whitespace-nowrap ml-1"
      >
        <Plus size={11} />
        Nova conta
      </button>
    </div>
  );
}
