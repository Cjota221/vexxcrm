'use client';

import { useRouter } from 'next/navigation';
import {
  X,
  Megaphone,
  ExternalLink,
} from 'lucide-react';
import type { KanbanColumn } from '@/types';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   EmbeddedCampaignPanel v2
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Redireciona para /campanhas/nova (wizard completo do CRM)
   em vez de manter um wizard duplicado/desatualizado.
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface EmbeddedCampaignPanelProps {
  onClose: () => void;
  /** Tag Kanban da conversa ativa para pré-filtrar */
  preselectedKanbanColumn?: KanbanColumn;
}

export function EmbeddedCampaignPanel({ onClose, preselectedKanbanColumn }: EmbeddedCampaignPanelProps) {
  const router = useRouter();

  const handleOpenWizard = () => {
    const params = new URLSearchParams();
    if (preselectedKanbanColumn) {
      params.set('origem', 'central');
      params.set('filtro_descricao', `Pipeline: ${preselectedKanbanColumn}`);
    }
    const qs = params.toString();
    router.push(`/campanhas/nova${qs ? `?${qs}` : ''}`);
    onClose();
  };

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl border-l border-surface-200 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-surface-200 shrink-0">
        <div className="flex items-center gap-2">
          <Megaphone size={16} className="text-crm-primary" />
          <span className="text-sm font-semibold text-txt-primary">Nova Campanha</span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-txt-muted hover:bg-surface-100 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
        <div className="w-20 h-20 rounded-2xl bg-crm-primary/10 flex items-center justify-center">
          <Megaphone size={36} className="text-crm-primary" />
        </div>

        <div className="text-center space-y-2">
          <h3 className="text-lg font-bold text-txt-primary">Criar Nova Campanha</h3>
          <p className="text-sm text-txt-muted leading-relaxed">
            Crie campanhas com blocos de mídia, texto e CTAs. 
            Selecione destinatários por inteligência RFM, busca manual ou grupos do WhatsApp.
          </p>
        </div>

        <div className="space-y-3 w-full">
          {/* Recursos */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { emoji: '📊', label: 'Segmentos RFM' },
              { emoji: '🖼️', label: 'Imagem + Legenda' },
              { emoji: '🎥', label: 'Vídeo & Áudio' },
              { emoji: '👥', label: 'Grupos WhatsApp' },
              { emoji: '📝', label: 'Texto + Variáveis' },
              { emoji: '🔗', label: 'Botão CTA' },
              { emoji: '🛡️', label: 'Config Anti-ban' },
              { emoji: '⏰', label: 'Agendamento' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 px-3 py-2 bg-surface-50 rounded-lg border border-surface-100">
                <span className="text-sm">{item.emoji}</span>
                <span className="text-xs text-txt-secondary font-medium">{item.label}</span>
              </div>
            ))}
          </div>

          {/* Botão principal */}
          <button
            onClick={handleOpenWizard}
            className="w-full flex items-center justify-center gap-2 py-3 bg-crm-primary text-white rounded-xl text-sm font-semibold hover:bg-crm-primary/90 transition-colors shadow-sm"
          >
            <ExternalLink size={16} />
            Abrir Wizard de Campanha
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-surface-200 shrink-0">
        <p className="text-[10px] text-txt-muted text-center">
          O wizard abrirá na página completa de campanhas do CRM
        </p>
      </div>
    </div>
  );
}

