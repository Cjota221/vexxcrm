'use client';

import { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, Send, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInitials, getAvatarColor, formatRelativeTime } from '@/lib/utils';
import { SubgruposModal } from './SubgruposModal';
import type { Client } from '@/types';

/** Acima deste limite mostra botão de sub-grupos em vez de disparo direto */
const SUBGROUP_THRESHOLD = 100;

interface BadgeProps {
  texto: string;
  variante: 'blue' | 'green' | 'amber' | 'red';
}

const BADGE_STYLES: Record<BadgeProps['variante'], string> = {
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
};

const ORIGEM_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  facilzap: 'FacilZap',
  import: 'Importação',
  manual: 'Manual',
  campaign: 'Campanha',
  instagram: 'Instagram',
};

interface LeadBlockProps {
  label: string;
  sublabel: string;
  leads: Client[];
  totalCount?: number;
  bucketKey?: string;  // para busca paginada no SubgruposModal
  isByTag?: boolean;
  cor: string;
  badge: BadgeProps;
  onDisparar: (leads: Client[]) => void;
}

export function LeadBlock({ label, sublabel, leads, totalCount, bucketKey, isByTag, cor, badge, onDisparar }: LeadBlockProps) {
  const displayCount = totalCount ?? leads.length;
  const [subgruposOpen, setSubgruposOpen] = useState(false);
  const usesSubgrupos = displayCount > SUBGROUP_THRESHOLD && !!bucketKey;
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(leads.map(l => l.id)));
  }, [leads]);

  const handleDisparar = useCallback(() => {
    const targets = selected.size > 0
      ? leads.filter(l => selected.has(l.id))
      : leads;
    onDisparar(targets);
  }, [leads, selected, onDisparar]);

  if (displayCount === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* ─── Header ─── */}
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors select-none"
        onClick={() => setExpanded(v => !v)}
      >
        {/* Dot de status */}
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cor }} />

        {/* Nome e contagem */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 text-sm">{label}</span>
            <span className="text-xs text-gray-400">{displayCount.toLocaleString('pt-BR')} leads · {sublabel}</span>
          </div>
        </div>

        {/* Badge */}
        <span className={cn('px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0', BADGE_STYLES[badge.variante])}>
          {badge.texto}
        </span>

        {/* Botão disparar */}
        {usesSubgrupos ? (
          <button
            onClick={e => { e.stopPropagation(); setSubgruposOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a5f] text-white text-xs font-medium rounded-lg hover:bg-[#162d4a] transition-colors shrink-0"
          >
            <Layers size={11} />
            Sub-grupos
          </button>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); handleDisparar(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a5f] text-white text-xs font-medium rounded-lg hover:bg-[#162d4a] transition-colors shrink-0"
          >
            <Send size={11} />
            Disparar bloco
          </button>
        )}

        {/* Chevron */}
        <span className="text-gray-400 shrink-0">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </div>

      {/* ─── Lista expandida ─── */}
      {expanded && (
        <>
          <div className="border-t border-gray-100">
            {leads.map(lead => {
              const isSelected = selected.has(lead.id);
              return (
                <div
                  key={lead.id}
                  className={cn(
                    'flex items-center gap-3 px-5 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer',
                    isSelected && 'bg-blue-50/60'
                  )}
                  onClick={() => toggleSelect(lead.id)}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(lead.id)}
                    onClick={e => e.stopPropagation()}
                    className="w-4 h-4 rounded border-gray-300 accent-[#1e3a5f] shrink-0"
                  />

                  {/* Avatar */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                    style={{ backgroundColor: getAvatarColor(lead.name) }}
                  >
                    {getInitials(lead.name)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{lead.name || lead.phone}</p>
                    <p className="text-xs text-gray-400">
                      Entrou {formatRelativeTime(lead.created_at)}
                      {lead.origem && ` · ${ORIGEM_LABEL[lead.origem] ?? lead.origem}`}
                    </p>
                  </div>

                  {/* Origem badge */}
                  {lead.origem && (
                    <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full shrink-0">
                      {ORIGEM_LABEL[lead.origem] ?? lead.origem}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* ─── Rodapé ─── */}
          <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-t border-gray-100">
            <span className="text-xs text-gray-500">
              {selected.size > 0 ? `${selected.size} selecionado${selected.size !== 1 ? 's' : ''}` : 'Nenhum selecionado'}
            </span>
            <button
              onClick={selectAll}
              className="text-xs font-medium text-[#1e3a5f] hover:underline"
            >
              Selecionar todos os {displayCount.toLocaleString('pt-BR')} →
            </button>
          </div>
        </>
      )}

      {/* Modal de sub-grupos */}
      {subgruposOpen && bucketKey && (
        <SubgruposModal
          bucketKey={bucketKey}
          bucketLabel={label}
          totalCount={displayCount}
          isByTag={isByTag}
          onClose={() => setSubgruposOpen(false)}
        />
      )}
    </div>
  );
}
