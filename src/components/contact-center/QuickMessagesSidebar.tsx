'use client';

/**
 * QuickMessagesSidebar — Painel de Mensagens Rápidas (Sidebar version)
 *
 * Exibe templates/respostas rápidas em formato de sidebar (não floating).
 * Reutiliza lógica do TemplatesFloatingPanel mas adaptado para:
 * - Layout full-height sidebar (320px wide, típico)
 * - Sem backdrop/overlay
 * - Toggle com Cérebro do Cliente
 *
 * Props:
 * - recipientPhone: telefone do destinatário
 * - clientId?: ID do cliente
 * - variables?: variáveis para interpolação
 * - onClose: callback ao fechar
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Zap, X, Search, Plus, Loader2, Trash2, Check,
  FileText, Image, Video, Music, Link, Copy, Edit2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { CompositeTemplate, TemplateBlock } from '@/types';

/* ─── Block icon lookup ──────────────────────────────────── */

const BLOCK_ICON: Record<string, React.ReactNode> = {
  text: <FileText size={11} />,
  image: <Image size={11} />,
  video: <Video size={11} />,
  audio: <Music size={11} />,
  document: <FileText size={11} />,
  link: <Link size={11} />,
  link_banner: <Link size={11} />,
  cta: <Link size={11} />,
  copy_code: <Copy size={11} />,
};

const BLOCK_LABEL: Record<string, string> = {
  text: 'Texto',
  image: 'Imagem',
  video: 'Vídeo',
  audio: 'Áudio',
  document: 'Documento',
  link: 'Link',
  link_banner: 'Link c/ Banner',
  cta: 'CTA',
  copy_code: 'Código',
};

/* ─── Props ──────────────────────────────────────────────── */

interface QuickMessagesSidebarProps {
  recipientPhone: string;
  clientId?: string;
  variables?: Record<string, string>;
  onClose: () => void;
}

/* ─── Preview de um bloco ────────────────────────────────── */

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
          : block.type === 'link_banner'
          ? (block.link_banner_title ? `${block.link_banner_title} — ` : '') + (block.link_url || block.media_url || '—')
          : block.media_url || block.image_url || block.link_url || block.cta_url || '—'}
      </span>
    </div>
  );
}

/* ─── Expansible template card ───────────────────────────── */

function TemplateCard({
  template,
  onSend,
  onEdit,
  onDelete,
  isSending,
  isDeleting,
}: {
  template: CompositeTemplate;
  onSend: (t: CompositeTemplate) => void;
  onEdit: (t: CompositeTemplate) => void;
  onDelete: (t: CompositeTemplate) => void;
  isSending: boolean;
  isDeleting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        'border border-gray-200 rounded-xl bg-white overflow-hidden transition-all duration-200',
        expanded ? 'ring-1 ring-crm-primary/50' : ''
      )}
    >
      {/* Header do card — clicável para expandir */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{template.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {template.blocks?.length || 0} bloco{(template.blocks?.length || 0) !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="text-gray-400 shrink-0">{expanded ? '▼' : '▶'}</div>
      </button>

      {/* Preview expandido */}
      {expanded && template.blocks && template.blocks.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/40 space-y-1">
          {template.blocks.map((block, idx) => (
            <div key={idx}>
              <BlockPreview block={block} />
            </div>
          ))}
        </div>
      )}

      {/* Footer com ações */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-100 bg-gray-50/60">
        <button
          onClick={() => onSend(template)}
          disabled={isSending}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all',
            isSending
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-crm-primary text-white hover:bg-crm-primary/90 active:scale-95'
          )}
        >
          {isSending ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Check size={12} />
              Usar
            </>
          )}
        </button>
        <button
          onClick={() => onEdit(template)}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          title="Editar"
        >
          <Edit2 size={12} />
        </button>
        <button
          onClick={() => onDelete(template)}
          disabled={isDeleting}
          className={cn(
            'p-1.5 rounded-lg transition-colors',
            isDeleting
              ? 'text-gray-300 cursor-not-allowed'
              : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
          )}
          title="Excluir"
        >
          {isDeleting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Trash2 size={12} />
          )}
        </button>
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────── */

export function QuickMessagesSidebar({
  recipientPhone,
  clientId,
  variables,
  onClose,
}: QuickMessagesSidebarProps) {
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState(new Set<string>());

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

  // Enviar template
  const handleSend = useCallback(async (template: CompositeTemplate) => {
    if (!recipientPhone || sendingId) return;
    setSendingId(template.id);
    try {
      const res = await api.post('/api/templates/send', {
        templateId: template.id,
        to: recipientPhone,
        variables,
        ...(clientId ? { clientId } : {}),
      });
      if (res.error) {
        alert(`Erro ao enviar: ${res.error}`);
        return;
      }
      setSentIds(prev => new Set([...prev, template.id]));
      // Opcional: fechar após envio bem-sucedido
      // setTimeout(() => onClose(), 600);
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setSendingId(null);
    }
  }, [recipientPhone, clientId, variables, sendingId]);

  // Excluir template
  const handleDelete = useCallback(async (template: CompositeTemplate) => {
    if (!confirm(`Excluir o template "${template.name}"?`)) return;
    setDeletingId(template.id);
    try {
      const res = await api.delete(`/api/templates/${template.id}`);
      if ((res as any).error) {
        alert(`Erro ao excluir: ${(res as any).error}`);
        return;
      }
      qc.invalidateQueries({ queryKey: ['templates'] });
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  }, [qc]);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-linear-to-r from-crm-primary to-crm-primary/80 shrink-0">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-white" />
          <span className="text-sm font-bold text-white">Respostas Rápidas</span>
          {templates.length > 0 && (
            <span className="px-1.5 py-0.5 bg-white/20 text-white text-[10px] font-bold rounded-full">
              {templates.length}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {/* Barra de busca */}
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/60 shrink-0">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-gray-200 focus-within:border-crm-primary/50 transition-colors">
          <Search size={12} className="text-gray-400 shrink-0" />
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar template..."
            className="flex-1 text-xs bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Lista de templates */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={20} className="animate-spin text-crm-primary" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12">
            <Zap size={32} className="text-gray-200 mx-auto mb-3" />
            <p className="text-xs text-gray-400 font-medium">
              {search ? `Nenhum template com "${search}"` : 'Nenhuma resposta rápida criada'}
            </p>
            <p className="text-[10px] text-gray-300 mt-2">
              Use "/" no campo de mensagem para criar uma
            </p>
          </div>
        ) : (
          templates.map(t => (
            <TemplateCard
              key={t.id}
              template={t}
              onSend={handleSend}
              onEdit={() => {
                // Será implementado — abrir modal de edição se necessário
                console.log('Edit:', t);
              }}
              onDelete={handleDelete}
              isSending={sendingId === t.id}
              isDeleting={deletingId === t.id}
            />
          ))
        )}
      </div>

      {/* Dica rodapé */}
      <div className="px-4 py-2 bg-gray-50/80 border-t border-gray-100 shrink-0">
        <p className="text-[10px] text-gray-400 leading-tight">
          💡 Digite "/" no chat para abrir respostas rápidas rapidamente
        </p>
      </div>
    </div>
  );
}
