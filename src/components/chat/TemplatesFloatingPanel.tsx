'use client';

/**
 * TemplatesFloatingPanel — Painel de Respostas Rápidas (Multi-Bubble)
 *
 * Abre acima do MessageInput ao clicar no ícone ⚡ (Zap).
 * - Lista templates com preview expandível
 * - Editor inline com: texto (WhatsAppTextEditor), imagem/vídeo/doc (upload ou URL), copy_code
 * - Ao clicar em "Usar": chama POST /api/templates/send (salva no banco + envia)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Zap, X, Search, Plus, Loader2, FileText, Image, Video, Music,
  Link, Send, ChevronDown, ChevronRight, Trash2, Check, Upload,
  Copy, Edit2, ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { CompositeTemplate, TemplateBlock, TemplateBlockType } from '@/types';
import { WhatsAppTextEditor } from '@/components/campaigns/WhatsAppTextEditor';

/* ─── Ícone por tipo de bloco ──────────────────────────────────── */

const BLOCK_ICON: Record<string, React.ReactNode> = {
  text: <FileText size={11} />,
  image: <Image size={11} />,
  video: <Video size={11} />,
  audio: <Music size={11} />,
  document: <FileText size={11} />,
  link: <Link size={11} />,
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
  cta: 'CTA',
  copy_code: 'Código',
};

/* ─── Props ──────────────────────────────────────────────────── */

interface TemplatesFloatingPanelProps {
  /** Telefone do destinatário atual */
  recipientPhone: string;
  /** ID do cliente atual (para a API buscar nome e dados automaticamente) */
  clientId?: string;
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

type BlockState = {
  id: string;
  type: string;
  content: string;
  media_url: string;
  copy_code: string;
  uploading: boolean;
};

function MediaUploadField({
  value,
  onChange,
  accept,
  placeholder,
}: {
  value: string;
  onChange: (url: string) => void;
  accept: string;
  placeholder: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};
      const res = await fetch('/api/upload', { method: 'POST', body: fd, headers });
      const data = await res.json();
      if (data.url) onChange(data.url);
      else alert('Erro no upload: ' + (data.error || 'desconhecido'));
    } catch {
      alert('Falha no upload. Verifique sua conexão e tente novamente.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      {/* Campo URL */}
      <input
        className="w-full text-xs px-2 py-1.5 bg-white border border-gray-200 rounded-md outline-none focus:border-crm-primary placeholder:text-gray-400"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      {/* Ou fazer upload */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-[9px] text-gray-400">ou</span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md border border-dashed border-crm-primary/40 text-crm-primary hover:bg-crm-primary/5 disabled:opacity-50 transition-colors"
      >
        {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
        {uploading ? 'Enviando... aguarde' : 'Fazer upload de arquivo'}
      </button>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept={accept}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />
      {/* Preview da URL se for imagem */}
      {value && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(value) && (
        <img src={value} alt="preview" className="w-full max-h-28 object-cover rounded-md border border-gray-100" />
      )}
      {/* Preview da URL se for vídeo */}
      {value && /\.(mp4|webm|mov|avi)(\?|$)/i.test(value) && (
        <video src={value} controls className="w-full max-h-28 rounded-md border border-gray-100" />
      )}
      {/* Nome do arquivo após upload (para docs/audio) */}
      {value && !/\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|avi)(\?|$)/i.test(value) && (
        <div className="flex items-center gap-1.5 text-[10px] text-green-600 bg-green-50 px-2 py-1 rounded-md">
          <Check size={10} /> Arquivo enviado com sucesso
        </div>
      )}
    </div>
  );
}

function NewTemplateEditor({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [blocks, setBlocks] = useState<BlockState[]>([
    { id: '1', type: 'text', content: '', media_url: '', copy_code: '', uploading: false },
  ]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        blocks: blocks.map((b, i) => {
          const base = { id: b.id, type: b.type, order: i, delay_ms: i === 0 ? 0 : 1200 };
          if (b.type === 'text') return { ...base, content: b.content };
          if (b.type === 'copy_code') return { ...base, copy_code: b.copy_code, content: b.content };
          return { ...base, media_url: b.media_url };
        }),
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
    setBlocks(prev => [...prev, { id: String(Date.now()), type: 'text', content: '', media_url: '', copy_code: '', uploading: false }]);
  };

  const removeBlock = (id: string) => setBlocks(prev => prev.filter(b => b.id !== id));

  const updateBlock = (id: string, field: keyof BlockState, value: string) =>
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));

  const canSave = name.trim() && blocks.some(b =>
    (b.type === 'text' && b.content.trim()) ||
    (b.type === 'copy_code' && b.copy_code.trim()) ||
    (b.type !== 'text' && b.type !== 'copy_code' && b.media_url.trim())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Cabeçalho do editor */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-white shrink-0">
        <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
          <ArrowLeft size={15} />
        </button>
        <Edit2 size={14} className="text-crm-primary" />
        <span className="text-sm font-bold text-gray-800">Novo template</span>
      </div>

      {/* Corpo do editor */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <input
          autoFocus
          className="w-full text-sm px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-crm-primary placeholder:text-gray-400 font-medium"
          placeholder="Nome do template (ex: Envio de Catálogo)..."
          value={name}
          onChange={e => setName(e.target.value)}
        />

        {blocks.map((block, idx) => (
          <div key={block.id} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
            {/* Linha de controle */}
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[10px] text-gray-400 font-mono w-4 text-center shrink-0">{idx + 1}</span>
              <select
                value={block.type}
                onChange={e => updateBlock(block.id, 'type', e.target.value)}
                className="text-[11px] bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none shrink-0 font-medium"
              >
                <option value="text">💬 Texto</option>
                <option value="copy_code">📋 Código para copiar</option>
                <option value="image">🖼️ Imagem</option>
                <option value="video">🎬 Vídeo</option>
                <option value="audio">🎵 Áudio</option>
                <option value="document">📄 Documento</option>
                <option value="link">🔗 Link</option>
              </select>
              <div className="flex-1" />
              {blocks.length > 1 && (
                <button onClick={() => removeBlock(block.id)} className="p-1 text-gray-300 hover:text-red-400 transition-colors">
                  <Trash2 size={12} />
                </button>
              )}
            </div>

            {/* Conteúdo por tipo */}
            {block.type === 'text' && (
              <WhatsAppTextEditor
                value={block.content}
                onChange={val => updateBlock(block.id, 'content', val)}
                placeholder="Mensagem... use {{saudacao}}, {{nome}}, {{produto}}, etc."
                rows={3}
                variables={['{{saudacao}}', '{{nome}}', '{{primeiro_nome}}', '{{produto}}', '{{cidade}}', '{{estado}}', '{{pedido}}']}
                showPreview={true}
              />
            )}

            {block.type === 'copy_code' && (
              <div className="space-y-2">
                <input
                  className="w-full text-sm px-2 py-1.5 bg-white border border-gray-200 rounded-lg outline-none focus:border-crm-primary placeholder:text-gray-400 font-mono"
                  placeholder="Código (ex: VEXX20, PIX123, ABC-XYZ)..."
                  value={block.copy_code}
                  onChange={e => updateBlock(block.id, 'copy_code', e.target.value)}
                />
                <input
                  className="w-full text-xs px-2 py-1.5 bg-white border border-gray-200 rounded-lg outline-none focus:border-crm-primary placeholder:text-gray-400"
                  placeholder="Texto da mensagem (opcional): ex: Seu código exclusivo:"
                  value={block.content}
                  onChange={e => updateBlock(block.id, 'content', e.target.value)}
                />
                {block.copy_code && (
                  <div className="flex items-center gap-2 p-2 bg-white border border-gray-200 rounded-lg">
                    <Copy size={12} className="text-blue-500 shrink-0" />
                    <span className="text-xs font-mono text-blue-600 font-bold">{block.copy_code}</span>
                    <span className="text-[10px] text-gray-400 ml-auto">Toque para copiar</span>
                  </div>
                )}
              </div>
            )}

            {['image', 'video', 'audio', 'document'].includes(block.type) && (
              <MediaUploadField
                value={block.media_url}
                onChange={url => updateBlock(block.id, 'media_url', url)}
                accept={
                  block.type === 'image' ? 'image/jpeg,image/png,image/gif,image/webp' :
                  block.type === 'video' ? 'video/mp4,video/webm' :
                  block.type === 'audio' ? 'audio/mpeg,audio/ogg,audio/wav,audio/aac' :
                  '.pdf,.doc,.docx,.xls,.xlsx'
                }
                placeholder={`URL do ${BLOCK_LABEL[block.type]?.toLowerCase() ?? block.type}...`}
              />
            )}

            {block.type === 'link' && (
              <input
                className="w-full text-xs px-2 py-1.5 bg-white border border-gray-200 rounded-lg outline-none focus:border-crm-primary placeholder:text-gray-400"
                placeholder="URL do link (https://...)..."
                value={block.media_url}
                onChange={e => updateBlock(block.id, 'media_url', e.target.value)}
              />
            )}
          </div>
        ))}

        <button
          onClick={addBlock}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-crm-primary border border-dashed border-crm-primary/40 rounded-xl hover:bg-crm-primary/5 transition-colors"
        >
          <Plus size={12} /> Adicionar bloco
        </button>
      </div>

      {/* Rodapé do editor */}
      <div className="px-4 py-3 border-t border-gray-100 bg-white shrink-0">
        <button
          disabled={!canSave || isPending}
          onClick={() => save()}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-crm-primary text-white text-sm font-semibold rounded-xl hover:bg-crm-primary/90 disabled:opacity-40 transition-all"
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Salvar template
        </button>
      </div>
    </div>
  );
}

/* ─── Componente principal ─────────────────────────────────────── */

export function TemplatesFloatingPanel({
  recipientPhone,
  clientId,
  variables = {},
  onClose,
}: TemplatesFloatingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  // Fechar com Escape (só quando não está no editor)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showEditor) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, showEditor]);

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
        ...(clientId ? { clientId } : {}),
      });
      if (res.error) { alert(`Erro ao enviar: ${res.error}`); return; }
      setSentIds(prev => new Set([...prev, template.id]));
      setTimeout(() => onClose(), 600);
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setSendingId(null);
    }
  }, [recipientPhone, clientId, variables, sendingId, onClose]);

  return (
    <>
      {/* Overlay escuro quando editor está aberto */}
      {showEditor && (
        <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowEditor(false)} />
      )}

      <div
        ref={panelRef}
        className={cn(
          'absolute bottom-full left-0 right-0 mb-2 z-50 bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.18)] border border-gray-100 overflow-hidden flex flex-col transition-all duration-200',
          showEditor
            // Quando editor aberto: painel alto para caber o formulário
            ? 'mx-0 rounded-none' : 'mx-2'
        )}
        style={{
          height: showEditor ? '85vh' : 'auto',
          maxHeight: showEditor ? '85vh' : '520px',
        }}
      >
        {/* ── Vista: Editor ─────────────────────────────── */}
        {showEditor ? (
          <NewTemplateEditor
            onSaved={() => setShowEditor(false)}
            onCancel={() => setShowEditor(false)}
          />
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/80 shrink-0">
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
                  onClick={() => setShowEditor(true)}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg text-crm-primary hover:bg-crm-primary/10 transition-all"
                >
                  <Plus size={11} /> Novo
                </button>
                <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Barra de busca */}
            <div className="px-3 py-2 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200 focus-within:border-crm-primary/50 transition-colors">
                <Search size={12} className="text-gray-400 shrink-0" />
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar template..."
                  className="flex-1 text-xs bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
                    <X size={10} />
                  </button>
                )}
              </div>
            </div>

            {/* Lista de templates */}
            <div className="overflow-y-auto flex-1 p-3 space-y-2">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={18} className="animate-spin text-crm-primary" />
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-10">
                  <Zap size={28} className="text-gray-200 mx-auto mb-2" />
                  <p className="text-xs text-gray-400 font-medium">
                    {search ? `Nenhum template com "${search}"` : 'Nenhum template criado ainda'}
                  </p>
                  <button
                    onClick={() => setShowEditor(true)}
                    className="mt-3 flex items-center gap-1 mx-auto text-xs text-crm-primary hover:underline font-medium"
                  >
                    <Plus size={11} /> Criar o primeiro template
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
            <div className="px-4 py-2 bg-gray-50/60 border-t border-gray-100 shrink-0">
              <p className="text-[10px] text-gray-400">
                💡 Blocos enviados com delay para parecer envio humano. Use <code className="font-mono bg-gray-100 px-1 rounded">{'{{saudacao}}'}</code>, <code className="font-mono bg-gray-100 px-1 rounded">{'{{nome}}'}</code> para personalizar.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
