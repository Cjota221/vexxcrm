'use client';

import { useState } from 'react';
import { X, Users, Send, Loader2, ChevronRight, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { DisparoMassaModal } from './DisparoMassaModal';
import { cn } from '@/lib/utils';
import type { Client } from '@/types';

interface SubgruposModalProps {
  bucketKey: string;    // 'recentes' | 'em_espera' | 'esfriando' | 'frios' | tag
  bucketLabel: string;
  totalCount: number;
  /** Se true, busca por tag em vez de bucket de tempo */
  isByTag?: boolean;
  onClose: () => void;
}

const GROUP_SIZES = [50, 100, 200, 300, 500];

export function SubgruposModal({ bucketKey, bucketLabel, totalCount, isByTag, onClose }: SubgruposModalProps) {
  const accessToken = useAuthStore(s => s.accessToken);
  const [groupSize, setGroupSize] = useState(200);
  const [loadingGroup, setLoadingGroup] = useState<number | null>(null);
  const [disparoLeads, setDisparoLeads] = useState<Client[] | null>(null);

  const totalGroups = Math.ceil(totalCount / groupSize);

  async function handleDispararGrupo(groupIndex: number) {
    setLoadingGroup(groupIndex);
    try {
      const page = groupIndex + 1;
      // Mais antigos primeiro (ascending) — grupo 1 = contatos mais antigos
      const url = isByTag
        ? `/api/reativacao/por-tags?tag=${bucketKey}&page=${page}&per_page=${groupSize}&order=asc`
        : `/api/reativacao/leads?bucket=${bucketKey}&page=${page}&per_page=${groupSize}&order=asc`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);

      const json = await res.json();
      // Suporte a ambos os formatos de resposta
      const leads: Client[] = isByTag
        ? (json.grupos?.[bucketKey]?.data ?? json.data ?? [])
        : (json.buckets?.[bucketKey]?.data ?? json.data ?? []);

      setDisparoLeads(leads);
    } catch (err) {
      alert(`Erro ao carregar grupo ${groupIndex + 1}: ${err instanceof Error ? err.message : err}`);
    } finally {
      setLoadingGroup(null);
    }
  }

  // Se abriu o modal de disparo, renderiza ele por cima
  if (disparoLeads) {
    return (
      <DisparoMassaModal
        leads={disparoLeads}
        onClose={() => setDisparoLeads(null)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Sub-grupos — {bucketLabel}</h2>
            <p className="text-xs text-gray-400">{totalCount.toLocaleString('pt-BR')} leads no total</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {/* Configuração de tamanho */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-600 shrink-0">Leads por grupo:</span>
            <div className="flex gap-1.5 flex-wrap">
              {GROUP_SIZES.map(size => (
                <button
                  key={size}
                  onClick={() => setGroupSize(size)}
                  className={cn(
                    'px-3 py-1 rounded-lg text-xs font-medium transition-colors',
                    groupSize === size
                      ? 'bg-[#1e3a5f] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-2 mt-3 bg-amber-50 border border-amber-100 rounded-xl p-2.5">
            <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700">
              Faça um grupo por vez. Aguarde o disparo terminar antes de iniciar o próximo para evitar ban.
            </p>
          </div>
        </div>

        {/* Lista de grupos */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-2">
          {Array.from({ length: totalGroups }, (_, i) => {
            const startLead = i * groupSize + 1;
            const endLead = Math.min((i + 1) * groupSize, totalCount);
            const count = endLead - startLead + 1;
            const isLoading = loadingGroup === i;

            return (
              <div
                key={i}
                className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100"
              >
                <div className="w-8 h-8 rounded-lg bg-[#1e3a5f]/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-[#1e3a5f]">{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">Grupo {i + 1}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <Users size={10} />
                    {count.toLocaleString('pt-BR')} leads
                    <span className="text-gray-300 mx-1">·</span>
                    {i === 0 ? 'mais antigos' : i === totalGroups - 1 ? 'mais recentes' : `posição ${startLead.toLocaleString('pt-BR')}–${endLead.toLocaleString('pt-BR')}`}
                  </p>
                </div>
                <button
                  onClick={() => handleDispararGrupo(i)}
                  disabled={isLoading || loadingGroup !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a5f] text-white text-xs font-medium rounded-lg hover:bg-[#162d4a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  {isLoading ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Send size={11} />
                  )}
                  Disparar
                  <ChevronRight size={11} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
