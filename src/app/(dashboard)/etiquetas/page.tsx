'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import { Tag, Users, Download, X, Search, ChevronRight, RefreshCw, Loader2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

function authFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = useAuthStore.getState().accessToken;
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
}

/* ── Tipos ────────────────────────────────────────────────────── */

interface WhatsAppLabel {
  id: string;
  whatsapp_label_id: string;
  nome: string;
  cor: string | null;
  cor_hex: string | null;
  ativo: boolean;
  conversation_count: number;
}

/* ── Componente principal ─────────────────────────────────────── */

export default function EtiquetasPage() {
  const [labels, setLabels] = useState<WhatsAppLabel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  const loadLabels = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await authFetch('/api/etiquetas');
      if (res.ok) {
        const json = await res.json() as { labels: WhatsAppLabel[] };
        setLabels(json.labels || []);
      }
    } catch { /* silencioso */ }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { loadLabels(); }, [loadLabels]);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await authFetch('/api/admin/evolution/sync-labels', { method: 'POST' });
      const json = await res.json() as { ok?: boolean; message?: string; error?: string };
      setSyncMsg(json.message || json.error || 'Sincronização concluída');
      if (json.ok) await loadLabels();
    } catch (e) {
      setSyncMsg(String(e));
    } finally {
      setSyncing(false);
    }
  }

  const totalConversas = labels.reduce((s, l) => s + l.conversation_count, 0);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-crm-primary/10 flex items-center justify-center">
              <Tag size={18} className="text-crm-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Etiquetas WhatsApp</h1>
              <p className="text-xs text-gray-400">
                {labels.length} etiqueta{labels.length !== 1 ? 's' : ''} · {totalConversas} conversa{totalConversas !== 1 ? 's' : ''} etiquetada{totalConversas !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadLabels}
              disabled={isLoading}
              className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
              title="Recarregar"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-4 py-2 bg-crm-primary text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {syncing ? 'Sincronizando...' : 'Sincronizar com WhatsApp'}
            </button>
          </div>
        </div>
      </div>

      {/* Sync feedback */}
      {syncMsg && (
        <div className={cn(
          'mx-6 mt-3 rounded-xl px-4 py-3 text-sm flex items-center gap-2',
          syncMsg.includes('Erro') || syncMsg.includes('erro')
            ? 'bg-red-50 border border-red-200 text-red-800'
            : 'bg-green-50 border border-green-200 text-green-800'
        )}>
          <CheckCircle size={14} />
          {syncMsg}
          <button onClick={() => setSyncMsg(null)} className="ml-auto opacity-60 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm gap-2">
            <Loader2 size={16} className="animate-spin" /> Carregando etiquetas...
          </div>
        ) : labels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 text-center gap-3">
            <Tag size={32} className="text-gray-300" />
            <p className="text-sm font-semibold text-gray-500">Nenhuma etiqueta encontrada</p>
            <p className="text-xs text-gray-400 max-w-xs">
              Clique em "Sincronizar com WhatsApp" para importar as etiquetas que você já criou no WhatsApp Business.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {labels.map(label => {
              const isSelected = selectedLabel === label.whatsapp_label_id;
              const hexColor = label.cor_hex || '#ABB8C3';
              return (
                <div
                  key={label.id}
                  className={cn(
                    'bg-white rounded-2xl border-2 p-4 flex flex-col gap-3 transition-all cursor-pointer hover:shadow-md',
                    isSelected ? 'border-crm-primary shadow-md' : 'border-gray-100'
                  )}
                  onClick={() => setSelectedLabel(isSelected ? null : label.whatsapp_label_id)}
                >
                  {/* Topo */}
                  <div className="flex items-center justify-between">
                    <span
                      className="px-2.5 py-1 rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: hexColor }}
                    >
                      {label.nome}
                    </span>
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: hexColor }}
                    />
                  </div>

                  {/* Contagem */}
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-gray-400" />
                    <span className="text-2xl font-black text-gray-800">{label.conversation_count}</span>
                    <span className="text-xs text-gray-400">conversa{label.conversation_count !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Info */}
                  <div className="text-xs text-gray-400 mt-auto">
                    ID: {label.whatsapp_label_id} · Cor: {label.cor || '—'}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Info sobre sincronização */}
        {!isLoading && labels.length > 0 && (
          <div className="mt-8 bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-3">Como funciona</h2>
            <ul className="space-y-2 text-sm text-gray-500">
              <li className="flex items-start gap-2">
                <span className="text-crm-primary font-bold mt-0.5">1.</span>
                As etiquetas que você cria/edita no WhatsApp Business aparecem aqui automaticamente via webhook.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-crm-primary font-bold mt-0.5">2.</span>
                Quando você aplica uma etiqueta a uma conversa no WhatsApp, o VEXX recebe e contabiliza.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-crm-primary font-bold mt-0.5">3.</span>
                Clique em "Sincronizar com WhatsApp" para importar etiquetas que já existiam antes da integração.
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
