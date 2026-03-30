'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { MetaAdAccount } from '@/types/meta';

export function useMetaAccounts() {
  const [accounts, setAccounts] = useState<MetaAdAccount[]>([]);
  const [activeAccount, setActiveAccountState] = useState<MetaAdAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('meta_ad_accounts')
      .select('*')
      .eq('ativa', true)
      .order('ordem', { ascending: true });

    const list = (data || []) as MetaAdAccount[];
    setAccounts(list);

    // Restaurar conta ativa do localStorage, ou usar a primeira
    const savedId = typeof window !== 'undefined'
      ? localStorage.getItem('vexx_meta_active_account')
      : null;
    const saved = list.find(a => a.id === savedId) || list[0] || null;
    setActiveAccountState(saved);
    setLoading(false);
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  function setActiveAccount(account: MetaAdAccount) {
    setActiveAccountState(account);
    if (typeof window !== 'undefined') {
      localStorage.setItem('vexx_meta_active_account', account.id);
    }
  }

  async function addAccount(nome: string, adAccountId: string, cor?: string) {
    const formatted = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    const { data, error } = await supabase
      .from('meta_ad_accounts')
      .insert({
        nome,
        ad_account_id: formatted,
        cor: cor || '#3b82f6',
        ordem: accounts.length,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await loadAccounts();
    return data as MetaAdAccount;
  }

  async function removeAccount(id: string) {
    await supabase.from('meta_ad_accounts').delete().eq('id', id);
    await loadAccounts();
  }

  async function updateAccount(
    id: string,
    updates: Partial<Pick<MetaAdAccount, 'nome' | 'ad_account_id' | 'cor' | 'ordem' | 'ativa'>>
  ) {
    await supabase.from('meta_ad_accounts').update(updates).eq('id', id);
    await loadAccounts();
  }

  return {
    accounts,
    activeAccount,
    setActiveAccount,
    addAccount,
    removeAccount,
    updateAccount,
    loading,
    reload: loadAccounts,
  };
}
