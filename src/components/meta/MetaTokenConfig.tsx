'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, RefreshCw, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';

async function getAuthHeader(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : '';
}

interface TokenStatus {
  valid: boolean;
  accountName?: string;
  tokenType?: string;
  error?: string;
}

export function MetaTokenConfig() {
  const [token, setToken]           = useState('');
  const [businessId, setBusinessId] = useState('');
  const [pageId, setPageId]         = useState('');
  const [pixelId, setPixelId]       = useState('');
  const [showToken, setShowToken]   = useState(false);
  const [status, setStatus]         = useState<TokenStatus | null>(null);
  const [loading, setLoading]       = useState(false);
  const [checking, setChecking]     = useState(false);

  async function verificar() {
    setChecking(true);
    try {
      const auth = await getAuthHeader();
      const res = await fetch('/api/meta/token', {
        headers: { Authorization: auth },
      });
      const data = await res.json() as TokenStatus;
      setStatus(data);
    } finally {
      setChecking(false);
    }
  }

  async function salvar() {
    if (!token.trim()) return;
    setLoading(true);
    try {
      const auth = await getAuthHeader();
      const res = await fetch('/api/meta/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({
          systemUserToken: token.trim(),
          businessId: businessId.trim() || undefined,
          pageId: pageId.trim() || undefined,
          pixelId: pixelId.trim() || undefined,
        }),
      });
      const data = await res.json() as { ok?: boolean; accountName?: string; error?: string };
      if (data.ok) {
        setStatus({ valid: true, accountName: data.accountName, tokenType: 'system_user' });
        setToken('');
      } else {
        setStatus({ valid: false, error: data.error });
      }
    } finally {
      setLoading(false);
    }
  }

  async function remover() {
    setLoading(true);
    try {
      const auth = await getAuthHeader();
      await fetch('/api/meta/token', { method: 'DELETE', headers: { Authorization: auth } });
      setStatus({ valid: false, error: 'Token removido' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">

      {/* Status atual */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status === null ? (
            <span className="text-sm text-gray-400">Clique em verificar para checar o token atual</span>
          ) : status.valid ? (
            <>
              <CheckCircle size={16} className="text-green-500" />
              <span className="text-sm text-green-600">
                Conectado{status.accountName ? ` — ${status.accountName}` : ''}
                {status.tokenType === 'system_user' && (
                  <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                    System User (não expira)
                  </span>
                )}
                {status.tokenType === 'page' && (
                  <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full font-medium">
                    Page Token (expira em 60 dias)
                  </span>
                )}
                {status.tokenType === 'env' && (
                  <span className="ml-2 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">
                    Variável de ambiente
                  </span>
                )}
              </span>
            </>
          ) : (
            <>
              <XCircle size={16} className="text-red-500" />
              <span className="text-sm text-red-600">{status.error ?? 'Token inválido ou não configurado'}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status?.valid && status.tokenType === 'system_user' && (
            <button
              onClick={remover}
              disabled={loading}
              className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-50"
            >
              Remover
            </button>
          )}
          <button
            onClick={verificar}
            disabled={checking}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
            Verificar
          </button>
        </div>
      </div>

      {/* Aviso System User */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 space-y-2">
        <p className="font-semibold text-blue-800">Como criar um System User Token</p>
        <ol className="list-decimal list-inside space-y-1 text-blue-600">
          <li>Acesse Meta Business Manager → Configurações do negócio</li>
          <li>Usuários → Usuários do sistema → Adicionar</li>
          <li>Nome: &quot;VEXX CRM&quot; | Função: Administrador</li>
          <li>Clique em &quot;Gerar novo token&quot; → selecione seu app</li>
          <li>
            Permissões obrigatórias:{' '}
            <code className="bg-blue-100 px-1 rounded">ads_management</code>,{' '}
            <code className="bg-blue-100 px-1 rounded">ads_read</code>,{' '}
            <code className="bg-blue-100 px-1 rounded">pages_read_engagement</code>,{' '}
            <code className="bg-blue-100 px-1 rounded">leads_retrieval</code>
          </li>
          <li>Copie o token gerado e cole abaixo</li>
        </ol>
        <a
          href="https://business.facebook.com/settings/system-users"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-1 text-blue-600 hover:underline"
        >
          Abrir Business Manager <ExternalLink size={10} />
        </a>
      </div>

      {/* Formulário */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            System User Token <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="EAAxxxxxxxxxx..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            <button
              type="button"
              onClick={() => setShowToken(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Business ID</label>
            <input
              type="text"
              value={businessId}
              onChange={e => setBusinessId(e.target.value)}
              placeholder="123456789"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Page ID</label>
            <input
              type="text"
              value={pageId}
              onChange={e => setPageId(e.target.value)}
              placeholder="123456789"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Pixel ID</label>
            <input
              type="text"
              value={pixelId}
              onChange={e => setPixelId(e.target.value)}
              placeholder="123456789"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        </div>

        <button
          onClick={salvar}
          disabled={loading || !token.trim()}
          className="w-full py-2.5 bg-[#1e3a5f] text-white text-sm font-medium rounded-xl hover:bg-[#16304f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Verificando e salvando...' : 'Salvar System User Token'}
        </button>
      </div>
    </div>
  );
}
