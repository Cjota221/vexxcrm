'use client';

import { useState } from 'react';
import {
  Plus,
  Trash2,
  GripVertical,
  Type,
  Image,
  Video,
  Mic,
  Clock,
  GitBranch,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { CampaignBlock } from '@/types';

interface MessageSequenceBuilderProps {
  blocks: CampaignBlock[];
  onChange: (blocks: CampaignBlock[]) => void;
  readOnly?: boolean;
}

const BLOCK_TYPES: { type: CampaignBlock['type']; label: string; icon: typeof Type }[] = [
  { type: 'text', label: 'Texto', icon: Type },
  { type: 'image', label: 'Imagem', icon: Image },
  { type: 'video', label: 'Vídeo', icon: Video },
  { type: 'audio', label: 'Áudio', icon: Mic },
  { type: 'delay', label: 'Delay', icon: Clock },
  { type: 'condition', label: 'Condição', icon: GitBranch },
];

/**
 * Builder visual de sequência de mensagens para campanhas.
 */
export function MessageSequenceBuilder({ blocks, onChange, readOnly = false }: MessageSequenceBuilderProps) {
  const addBlock = (type: CampaignBlock['type']) => {
    const newBlock: CampaignBlock = {
      id: crypto.randomUUID(),
      type,
      content: '',
      order: blocks.length,
      delay_seconds: type === 'delay' ? 5 : undefined,
    };
    onChange([...blocks, newBlock]);
  };

  const removeBlock = (id: string) => {
    onChange(blocks.filter((b) => b.id !== id).map((b, i) => ({ ...b, order: i })));
  };

  const updateBlock = (id: string, updates: Partial<CampaignBlock>) => {
    onChange(blocks.map((b) => (b.id === id ? { ...b, ...updates } : b)));
  };

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    const newBlocks = [...blocks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= blocks.length) return;
    [newBlocks[index], newBlocks[targetIndex]] = [newBlocks[targetIndex], newBlocks[index]];
    onChange(newBlocks.map((b, i) => ({ ...b, order: i })));
  };

  return (
    <div className="space-y-4">
      {/* Blocos */}
      <div className="space-y-2">
        {blocks.map((block, index) => (
          <div
            key={block.id}
            className="flex items-start gap-2 p-3 bg-surface-50 rounded-xl border border-surface-200 group"
          >
            {/* Handle + número */}
            <div className="flex flex-col items-center gap-1 pt-1">
              <GripVertical size={14} className="text-txt-muted cursor-grab" />
              <span className="text-xs font-bold text-crm-primary">{index + 1}</span>
            </div>

            {/* Conteúdo */}
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="neutral">{block.type}</Badge>
              </div>

              {block.type === 'text' && (
                <textarea
                  value={block.content || ''}
                  onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                  placeholder="Digite a mensagem..."
                  className="w-full text-sm border border-surface-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
                  rows={3}
                  readOnly={readOnly}
                />
              )}

              {(block.type === 'image' || block.type === 'video' || block.type === 'audio') && (
                <input
                  type="url"
                  value={block.media_url || ''}
                  onChange={(e) => updateBlock(block.id, { media_url: e.target.value })}
                  placeholder="URL da mídia..."
                  className="w-full text-sm border border-surface-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
                  readOnly={readOnly}
                />
              )}

              {block.type === 'delay' && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={block.delay_seconds || 0}
                    onChange={(e) => updateBlock(block.id, { delay_seconds: parseInt(e.target.value) || 0 })}
                    className="w-24 text-sm border border-surface-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
                    min={1}
                    readOnly={readOnly}
                  />
                  <span className="text-xs text-txt-secondary">segundos</span>
                </div>
              )}
            </div>

            {/* Ações */}
            {!readOnly && (
              <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => moveBlock(index, 'up')}
                  disabled={index === 0}
                  className="p-1 rounded hover:bg-surface-200 text-txt-secondary disabled:opacity-30"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  onClick={() => moveBlock(index, 'down')}
                  disabled={index === blocks.length - 1}
                  className="p-1 rounded hover:bg-surface-200 text-txt-secondary disabled:opacity-30"
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  onClick={() => removeBlock(block.id)}
                  className="p-1 rounded hover:bg-red-50 text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Botões de adicionar */}
      {!readOnly && (
        <div className="flex flex-wrap gap-2 pt-2">
          {BLOCK_TYPES.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              onClick={() => addBlock(type)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-dashed border-surface-300 text-txt-secondary hover:border-crm-primary hover:text-crm-primary transition-colors"
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
