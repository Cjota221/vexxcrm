'use client';

/**
 * TemplatesFloatingPanel — Painel flutuante de Respostas Rápidas (Multi-Bubble)
 *
 * Abre acima do MessageInput ao clicar no ícone ⚡ (Zap).
 * - Busca por palavra-chave ou com "/" no input de texto
 * - Mostra preview dos blocos de cada template
 * - Ao clicar em "Usar": chama POST /api/templates/send (multi-bubble com delay humano)
 * - Editor inline para criar novos templates
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Zap,
  X,
  Search,
  Plus,
  Loader2,
  FileText,
  Image,
  Video,
  Music,
  Link,
  Send,
  ChevronDown,
  ChevronRight,
  Trash2,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { CompositeTemplate, TemplateBlock, TemplateBlockType } from '@/types';

/* ─── Ícone por tipo de bloco ──────────────────────────────────── */

const BLOCK_ICON: Record<TemplateBlockType, React.ReactNode> = {
  text: <FileText size={11} />,
  image: <Image size={11} />,
  video: <Video size={11} />,
  audio: <Music size={11} />,
  document: <FileText size={11} />,
  link: <Link size={11} />,
  cta: <Link size={11} />,
};

const BLOCK_LABEL: Record<TemplateBlockType, string> = {
  text: 'Texto',
  image: 'Imagem',
  video: 'Vídeo',
  audio: 'Áudio',
  document: 'Documento',
  link: 'Link',
  cta: 'CTA',
};

/* ─── Props ──────────────────────────────────────────────────── */

interface TemplatesFloatingPanelProps {
  /** Telefone do destinatário atual */
  recipientPhone: string;
  /** Variáveis disponíveis para interpolação (ex: { nome: 'João' }) */
  variables?: Record<string, string>;
  onClose: () => void;
}

/* ─── Preview de um bloco ──────────────────────────────────────── */

function BlockPreview({ block }: { block: TemplateBlock }) {
  const label = BLOCK_LABEL[block.type];
  const icon = BLOCK_ICON[block.type];

  return (
    <div className="flex items-start gap-1.5 py-0.5">
      <span className="mt-0.5 text-gray-400 shrink-0">{icon}</span>
      <span className="text-[10px] text-gray-500 leading-tight">
        <span className="font-semibold text-gray-600">{label}: </span>
        {block.type === 'text'
          ? (block.content || '').slice(0, 60) + ((block.content || '').length > 60 ? '…' : '')
          : block.media_url || block.image_url || block.link_url || block.cta_url || '—'}
      </span>
    </div>
  );
}

/* ─── Card de template ─────────────────────────────────────────── */

function TemplateCard({
  template,
  onSend,
  isSending,
}: {
  template: CompositeTemplate;
  onSend: (t: CompositeTemplate) => void;
  isSending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden hover:border-crm-primary/30 transition-colors bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* Header do card */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1.5 flex-1 text-left min-w-0"
        >
          {expanded ? <ChevronDown size={12} className="text-gray-400 shrink-0" /> : <ChevronRight size={12} className="text-gray-400 shrink-0" />}
          <span className="text-xs font-semibold text-gray-800 truncate">{template.name}</span>
          <span className="text-[10px] text-gray-400 shrink-0">
            {template.blocks.length} bloco{template.blocks.length !== 1 ? 's' : ''}
          </span>
        </button>

        {/* Botão Usar */}
        <button
          onClick={() => onSend(template)}
          disabled={isSending}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all shrink-0',
            isSending
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-crm-primary text-white hover:bg-crm-primary/90 shadow-sm'
          )}
        >
          {isSending ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
          Usar
        </button>
      </div>

      {/* Blocos (expandível) */}
      {expanded && (
        <div className="px-3 pb-2 space-y-0.5 border-t border-gray-50 pt-1.5">
          {template.blocks
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map(block => (
              <BlockPreview key={block.id} block={block} />
            ))}
          {template.description && (
            <p className="text-[10px] text-gray-400 italic mt-1">{template.description}</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Editor de novo template ──────────────────────────────────── */

function NewTemplateEditor({ onSaved }: { onSaved: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [blocks, setBlocks] = useState<Array<{
    id: string;
    type: TemplateBlockType;
    content: string;
    media_url: string;
  }>>([{ id: '1', type: 'text', content: '', media_url: '' }]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        blocks: blocks.map((b, i) => ({
          id: b.id,
          type: b.type,
          order: i,
          delay_ms: i === 0 ? 0 : 1000,
          content: b.type === 'text' ? b.content : undefined,
          media_url: b.type !== 'text' ? b.media_url : undefined,
          media_caption: undefined,
        })),
      };
      const res = await api.post('/api/templates', payload);
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      onSaved();
    },
  });

  const addBlock = () => {
    setBlocks(prev => [...prev, {
      id: String(Date.now()),
      type: 'text',
      content: '',
      media_url: '',
    }]);
  };

  const removeBlock = (id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
  };

  const updateBlock = (id: string, field: string, value: string) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));
  };

  return (
    <div className="space-y-3">
      <input
        autoFocus
        className="w-full text-xs px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-crm-primary placeholder:text-gray-400"
        placeholder="Nome do template (ex: Envio de Catálogo)..."
        value={name}
        onChange={e => setName(e.target.value)}
      />

      {/* Blocos */}
      <div className="space-y-2">
        {blocks.map((block, idx) => (
          <div key={block.id} className="flex items-start gap-2 bg-gray-50 rounded-lg p-2 border border-gray-100">
            <span className="text-[10px] text-gray-400 font-mono mt-1.5 shrink-0 w-4 text-center">{idx + 1}</span>

            <select
              value={block.type}
              onChange={e => updateBlock(block.id, 'type', e.target.value)}
              className="text-[11px] bg-white border border-gray-200 rounded-md px-1.5 py-1 outline-none shrink-0"
            >
              {(['text', 'image', 'video', 'audio', 'document', 'link'] as TemplateBlockType[]).map(t => (
                <option key={t} value={t}>{BLOCK_LABEL[t]}</option>
              ))}
            </select>

            {block.type === 'text' ? (
              <textarea
                className="flex-1 text-xs px-2 py-1 bg-white border border-gray-200 rounded-md outline-none focus:border-crm-primary resize-none h-14 placeholder:text-gray-400"
                placeholder="Mensagem... use {{nome}}, {{produto}}, etc."
                value={block.content}
                onChange={e => updateBlock(block.id, 'content', e.target.value)}
              />
            ) : (
              <input
                className="flex-1 text-xs px-2 py-1 bg-white border border-gray-200 rounded-md outline-none focus:border-crm-primary placeholder:text-gray-400"
                placeholder="URL da mídia ou link..."
                value={block.media_url}
                onChange={e => updateBlock(block.id, 'media_url', e.target.value)}
              />
            )}

            {blocks.length > 1 && (
              <button
                onClick={() => removeBlock(block.id)}
                className="p-1 text-gray-300 hover:text-red-400 transition-colors shrink-0"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Ações */}
      <div className="flex items-center gap-2">
        <button
          onClick={addBlock}
          className="flex items-center gap-1 text-[11px] text-crm-primary hover:text-crm-primary/80 font-medium"
        >
          <Plus size={12} />
          Adicionar bloco
        </button>
        <div className="flex-1" />
        <button
          disabled={!name.trim() || blocks.every(b => !b.content && !b.media_url) || isPending}
          onClick={() => save()}
          className="flex items-center gap-1 px-3 py-1.5 bg-crm-primary text-white text-xs font-semibold rounded-lg hover:bg-crm-primary/90 disabled:opacity-40 transition-all"
        >
          {isPending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          Salvar template
        </button>
      </div>
    </div>
  );
}

/* ─── Componente principal ─────────────────────────────────────── */

export function TemplatesFloatingPanel({
  recipientPhone,
  variables = {},
  onClose,
}: TemplatesFloatingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  // Fechar com Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Fechar ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Buscar templates
  const { data, isLoading } = useQuery({
    queryKey: ['templates', search],
    queryFn: async () => {
      const url = search ? `/api/templates?q=${encodeURIComponent(search)}` : '/api/templates';
      const res = await api.get<{ data: CompositeTemplate[] }>(url);
      if (res.error) throw new Error(res.error);
      return (res.data as any)?.data ?? res.data ?? [];
    },
    staleTime: 30_000,
  });

  const templates: CompositeTemplate[] = Array.isArray(data) ? data : [];

  // Enviar template multi-bubble
  const handleSend = useCallback(async (template: CompositeTemplate) => {
    if (!recipientPhone || sendingId) return;
    setSendingId(template.id);

    try {
      const res = await api.post('/api/templates/send', {
        templateId: template.id,
        to: recipientPhone,
        variables,
      });

      if (res.error) {
        alert(`Erro ao enviar template: ${res.error}`);
        return;
      }

      setSentIds(prev => new Set([...prev, template.id]));
      // Fechar após 800ms para feedback visual
      setTimeout(() => onClose(), 800);
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setSendingId(null);
    }
  }, [recipientPhone, variables, sendingId, onClose]);

  return (
    <div
      ref={panelRef}
      className="absolute bottom-full left-0 right-0 mb-2 mx-2 z-50 bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-gray-100 overflow-hidden"
      style={{ maxHeight: '420px' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/80">
        <div className="flex items-center gap-2">
          <Zap size={15} className="text-amber-500" />
          <span className="text-sm font-bold text-gray-800">Respostas Rápidas</span>
          {templates.length > 0 && (
            <span className="px-1.5 py-0.5 bg-crm-primary/10 text-crm-primary text-[10px] font-bold rounded-full">
              {templates.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEditor(v => !v)}
            className={cn(
              'flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-all',
              showEditor
                ? 'bg-crm-primary text-white'
                : 'text-crm-primary hover:bg-crm-primary/10'
            )}
          >
            <Plus size={11} />
            Novo
          </button>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Barra de busca */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200 focus-within:border-crm-primary/50 transition-colors">
          <Search size={12} className="text-gray-400 shrink-0" />
          <input
            autoFocus={!showEditor}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar template... (ou / para filtrar)"
            className="flex-1 text-xs bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Editor de novo template */}
      {showEditor && (
        <div className="px-4 py-3 border-b border-gray-100 bg-amber-50/30">
          <NewTemplateEditor onSaved={() => setShowEditor(false)} />
        </div>
      )}

      {/* Lista de templates */}
      <div className="overflow-y-auto p-3 space-y-2" style={{ maxHeight: showEditor ? '160px' : '300px' }}>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={18} className="animate-spin text-crm-primary" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-8">
            <Zap size={24} className="text-gray-200 mx-auto mb-2" />
            <p className="text-xs text-gray-400 font-medium">
              {search ? `Nenhum template com "${search}"` : 'Nenhum template criado ainda'}
            </p>
            <button
              onClick={() => setShowEditor(true)}
              className="mt-2 text-xs text-crm-primary hover:underline font-medium"
            >
              Criar o primeiro template →
            </button>
          </div>
        ) : (
          templates.map(t => (
            <TemplateCard
              key={t.id}
              template={t}
              onSend={handleSend}
              isSending={sendingId === t.id}
            />
          ))
        )}
      </div>

      {/* Dica */}
      <div className="px-4 py-2 bg-gray-50/60 border-t border-gray-100">
        <p className="text-[10px] text-gray-400">
          💡 Cada bloco é enviado com <strong>1s de delay</strong> entre eles para parecer envio humano.
          {' '}Use <code className="font-mono bg-gray-100 px-1 rounded">{'{{'}{'}}'}</code> para variáveis dinâmicas.
        </p>
      </div>
    </div>
  );
}
