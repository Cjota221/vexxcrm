'use client';

import { useState } from 'react';
import { RefreshCw, Loader2, CheckCircle2, AlertCircle, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

interface SyncProgress {
  current: number;
  total: number;
  percent: number;
  clients: number;
  messages: number;
}

interface BulkSyncResponse {
  success: boolean;
  data: {
    total_chats: number;
    batch_processed: number;
    clients_created: number;
    conversations_created: number;
    messages_synced: number;
    errors: number;
    has_more: boolean;
    next_start_from: number | null;
    progress: SyncProgress;
  };
}

/**
 * Componente de Sincronização Forçada — para importar milhares de chats da Evolution API.
 * Exibe barra de progresso e permite continuar sync interrompido.
 */
export function BulkSyncPanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    clients: 0,
    conversations: 0,
    messages: 0,
    errors: 0,
  });

  const startBulkSync = async () => {
    setIsRunning(true);
    setStatus('running');
    setError(null);
    setProgress(null);
    setStats({ clients: 0, conversations: 0, messages: 0, errors: 0 });

    let startFrom = 0;
    let hasMore = true;
    let totalStats = { clients: 0, conversations: 0, messages: 0, errors: 0 };

    try {
      while (hasMore) {
        const response = await api.post<BulkSyncResponse>('/api/whatsapp/bulk-sync', {
          batchSize: 100,
          messagesPerChat: 50,
          startFrom,
        });

        if (response.error) {
          throw new Error(response.error);
        }

        const data = response.data?.data;
        if (!data) {
          throw new Error('Resposta inválida da API');
        }

        // Atualizar progresso
        setProgress(data.progress);

        // Acumular stats
        totalStats.clients += data.clients_created;
        totalStats.conversations += data.conversations_created;
        totalStats.messages += data.messages_synced;
        totalStats.errors += data.errors;
        setStats({ ...totalStats });

        // Próximo batch
        hasMore = data.has_more;
        startFrom = data.next_start_from || 0;

        // Pequena pausa para não sobrecarregar
        if (hasMore) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      setStatus('completed');
    } catch (err: any) {
      setStatus('error');
      setError(err.message || 'Erro durante sincronização');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-surface-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
          <Database size={20} className="text-blue-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-txt-primary">
            Sincronização de Massa
          </h3>
          <p className="text-xs text-txt-muted">
            Importar todos os chats e mensagens da Evolution API
          </p>
        </div>
      </div>

      {/* Progress bar */}
      {progress && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-txt-secondary mb-1">
            <span>Progresso</span>
            <span>{progress.current.toLocaleString()} / {progress.total.toLocaleString()} chats</span>
          </div>
          <div className="h-3 bg-surface-100 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full transition-all duration-300 rounded-full',
                status === 'error' ? 'bg-red-500' : 'bg-crm-primary'
              )}
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <p className="text-center text-sm font-medium text-txt-primary mt-1">
            {progress.percent}%
          </p>
        </div>
      )}

      {/* Stats */}
      {(stats.clients > 0 || stats.messages > 0) && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="text-center p-2 bg-surface-50 rounded-lg">
            <p className="text-lg font-bold text-crm-primary">{stats.clients}</p>
            <p className="text-[10px] text-txt-muted">Clientes</p>
          </div>
          <div className="text-center p-2 bg-surface-50 rounded-lg">
            <p className="text-lg font-bold text-txt-primary">{stats.conversations}</p>
            <p className="text-[10px] text-txt-muted">Conversas</p>
          </div>
          <div className="text-center p-2 bg-surface-50 rounded-lg">
            <p className="text-lg font-bold text-txt-primary">{stats.messages}</p>
            <p className="text-[10px] text-txt-muted">Mensagens</p>
          </div>
          <div className="text-center p-2 bg-surface-50 rounded-lg">
            <p className="text-lg font-bold text-red-500">{stats.errors}</p>
            <p className="text-[10px] text-txt-muted">Erros</p>
          </div>
        </div>
      )}

      {/* Status messages */}
      {status === 'completed' && (
        <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-lg mb-4">
          <CheckCircle2 size={16} />
          <span className="text-sm">Sincronização concluída com sucesso!</span>
        </div>
      )}

      {status === 'error' && error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg mb-4">
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Action button */}
      <button
        onClick={startBulkSync}
        disabled={isRunning}
        className={cn(
          'w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-colors',
          isRunning
            ? 'bg-surface-100 text-txt-muted cursor-not-allowed'
            : 'bg-crm-primary text-white hover:bg-crm-primary/90'
        )}
      >
        {isRunning ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Sincronizando...
          </>
        ) : (
          <>
            <RefreshCw size={16} />
            {status === 'completed' ? 'Sincronizar Novamente' : 'Iniciar Sincronização Completa'}
          </>
        )}
      </button>

      <p className="text-[10px] text-txt-muted text-center mt-2">
        ⚠️ Este processo pode demorar alguns minutos dependendo do volume de dados.
      </p>
    </div>
  );
}
