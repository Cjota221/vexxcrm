'use client';

import { useState } from 'react';
import { X, Building2 } from 'lucide-react';

const CORES = [
  '#3b82f6', '#e11d48', '#22c55e',
  '#f59e0b', '#a855f7', '#06b6d4', '#f97316',
];

interface AddAccountModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (nome: string, adAccountId: string, cor: string) => Promise<void>;
}

export function AddAccountModal({ open, onClose, onAdd }: AddAccountModalProps) {
  const [nome, setNome] = useState('');
  const [adAccountId, setAdAccountId] = useState('');
  const [cor, setCor] = useState(CORES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  async function handleSubmit() {
    if (!nome.trim()) { setError('Nome é obrigatório'); return; }
    if (!adAccountId.trim()) { setError('Ad Account ID é obrigatório'); return; }
    setLoading(true);
    setError('');
    try {
      await onAdd(nome.trim(), adAccountId.trim(), cor);
      setNome(''); setAdAccountId(''); setCor(CORES[0]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar conta');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md mx-4 shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
              <Building2 size={15} className="text-gray-500" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">Adicionar conta Meta</div>
              <div className="text-xs text-gray-400">Nova conta de anúncios</div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Nome da conta
            </label>
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="ex: CJ Rasteirinhas, C4 Franquias..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900
                placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Ad Account ID
            </label>
            <input
              value={adAccountId}
              onChange={e => setAdAccountId(e.target.value)}
              placeholder="act_123456789 ou só o número"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900
                placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 font-mono"
            />
            <p className="text-xs text-gray-400 mt-1.5">
              Gerenciador de Anúncios → URL da conta (número após act_)
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Cor da aba
            </label>
            <div className="flex items-center gap-2">
              {CORES.map(c => (
                <button
                  key={c}
                  onClick={() => setCor(c)}
                  className={`w-7 h-7 rounded-full transition-all duration-150 ${
                    cor === c ? 'ring-2 ring-offset-2 scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c, outlineColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cor }} />
            <span className="text-xs font-medium text-gray-700">{nome || 'Nome da conta'}</span>
            <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded ml-auto">
              {adAccountId || 'act_...'}
            </span>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200
              rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-crm-primary hover:bg-crm-secondary
              rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Salvando...' : 'Adicionar conta'}
          </button>
        </div>
      </div>
    </div>
  );
}
