'use client';

import { useState } from 'react';
import { CheckCircle, CloudDownload, FileText, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch, formatDate, n0 } from '@/components/trafego/trafegoUtils';

export function LeadsPanel() {
  const [forms, setForms]             = useState<Array<{ id: string; nome: string; status: string; leads_count: number; created_time: string; campos: string[] }>>([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [formsLoaded, setFormsLoaded]   = useState(false);
  const [syncing, setSyncing]           = useState<string | null>(null);
  const [syncResult, setSyncResult]     = useState<{ formId: string; salvos: number; total: number } | null>(null);

  async function loadForms() {
    setFormsLoading(true);
    try {
      const res = await authFetch('/api/meta/leads/forms');
      if (res.ok) {
        const json = await res.json() as { forms: typeof forms };
        setForms(json.forms || []);
        setFormsLoaded(true);
      }
    } catch { /* silencioso */ }
    finally { setFormsLoading(false); }
  }

  async function syncLeads(formId: string) {
    setSyncing(formId);
    setSyncResult(null);
    try {
      const res = await authFetch(`/api/meta/leads/sync?form_id=${formId}&limit=100`);
      if (res.ok) {
        const json = await res.json() as { salvos: number; leads: unknown[] };
        setSyncResult({ formId, salvos: json.salvos, total: json.leads.length });
        setForms(prev => prev.map(f => f.id === formId ? { ...f, leads_count: Math.max(f.leads_count, json.leads.length) } : f));
      }
    } catch { /* silencioso */ }
    finally { setSyncing(null); }
  }

  async function syncAll() {
    if (!forms.length) return;
    setSyncing('all');
    setSyncResult(null);
    try {
      const res = await authFetch('/api/meta/leads/sync', {
        method: 'POST',
        body: JSON.stringify({ form_ids: forms.map(f => f.id) }),
      });
      if (res.ok) {
        const json = await res.json() as { total_salvos: number };
        setSyncResult({ formId: 'all', salvos: json.total_salvos, total: json.total_salvos });
      }
    } catch { /* silencioso */ }
    finally { setSyncing(null); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900">Leads dos formulários</h2>
          <p className="text-xs text-gray-500 mt-0.5">Puxe leads de qualquer Instant Form direto para o CRM</p>
        </div>
        <div className="flex gap-2">
          {formsLoaded && forms.length > 0 && (
            <button onClick={syncAll} disabled={syncing === 'all'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
              {syncing === 'all' ? <Loader2 size={12} className="animate-spin" /> : <CloudDownload size={12} />}
              Sincronizar todos
            </button>
          )}
          {!formsLoaded && (
            <button onClick={loadForms} disabled={formsLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
              {formsLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {formsLoading ? 'Carregando...' : 'Carregar formulários'}
            </button>
          )}
        </div>
      </div>

      {syncResult && (
        <div className={cn('flex items-center gap-2 px-4 py-3 rounded-xl text-sm',
          syncResult.salvos > 0 ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-gray-50 text-gray-600 border border-gray-200')}>
          <CheckCircle size={15} />
          {syncResult.formId === 'all'
            ? `${syncResult.salvos} leads novos importados de todos os formulários`
            : `${syncResult.salvos} leads novos · ${syncResult.total} leads no formulário`}
        </div>
      )}

      {!formsLoaded && !formsLoading && (
        <div className="text-center py-12 text-gray-400">
          <FileText size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Clique em &quot;Carregar formulários&quot; para ver seus Instant Forms</p>
        </div>
      )}

      {formsLoaded && forms.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <FileText size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum formulário de lead encontrado nesta página.</p>
          <p className="text-xs mt-1">Verifique se o Page ID está configurado corretamente.</p>
        </div>
      )}

      {forms.length > 0 && (
        <div className="space-y-3">
          {forms.map(form => (
            <div key={form.id} className="bg-white border border-gray-100 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">{form.nome}</h3>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                      form.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                      {form.status === 'ACTIVE' ? 'Ativo' : form.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span><strong className="text-gray-800">{n0(form.leads_count)}</strong> leads coletados</span>
                    <span>Criado {formatDate(form.created_time)}</span>
                  </div>
                  {form.campos.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {form.campos.map(c => (
                        <span key={c} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md">{c}</span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => syncLeads(form.id)}
                  disabled={syncing === form.id}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 text-blue-600 text-xs font-medium hover:bg-blue-50 disabled:opacity-50 transition-colors"
                >
                  {syncing === form.id ? <Loader2 size={12} className="animate-spin" /> : <CloudDownload size={12} />}
                  {syncing === form.id ? 'Importando...' : 'Importar leads'}
                </button>
              </div>
              {syncResult?.formId === form.id && (
                <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-green-700 flex items-center gap-1.5">
                  <CheckCircle size={12} />
                  {syncResult.salvos} leads novos importados · {syncResult.total} total no formulário
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
