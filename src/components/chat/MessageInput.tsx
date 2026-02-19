'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, Smile, Mic, X, Image, FileText, Video, Loader2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TemplatesFloatingPanel } from './TemplatesFloatingPanel';

interface MessageInputProps {
  onSend: (content: string) => void;
  onSendMedia?: (file: File, caption: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  /** Telefone do destinatário — necessário para envio de templates multi-bubble */
  recipientPhone?: string;
}

const ACCEPTED_TYPES: Record<string, string> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
  'audio/mpeg': 'audio',
  'audio/ogg': 'audio',
  'audio/wav': 'audio',
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
};

const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16MB

/**
 * Input de mensagem com auto-resize estilo WhatsApp + envio de mídia.
 */
export function MessageInput({ onSend, onSendMedia, isLoading, disabled, recipientPhone }: MessageInputProps) {
  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  // Cleanup file preview URL
  useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isLoading || disabled) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, onSend, isLoading, disabled]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      alert('Arquivo muito grande. Máximo 16MB.');
      return;
    }

    const mediaType = ACCEPTED_TYPES[file.type];
    if (!mediaType) {
      alert('Tipo de arquivo não suportado. Envie imagens, vídeos, áudios ou documentos.');
      return;
    }

    setSelectedFile(file);
    setCaption('');

    // Gerar preview para imagens
    if (mediaType === 'image') {
      setFilePreview(URL.createObjectURL(file));
    } else {
      setFilePreview(null);
    }

    // Limpar input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleSendMedia = useCallback(() => {
    if (!selectedFile || isLoading || disabled) return;
    if (onSendMedia) {
      onSendMedia(selectedFile, caption);
    }
    setSelectedFile(null);
    setFilePreview(null);
    setCaption('');
  }, [selectedFile, caption, onSendMedia, isLoading, disabled]);

  const handleCancelFile = useCallback(() => {
    setSelectedFile(null);
    setFilePreview(null);
    setCaption('');
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // "/" no início do campo abre painel de templates
    if (e.key === '/' && !text && !e.shiftKey && recipientPhone) {
      e.preventDefault();
      setTemplatesOpen(true);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (selectedFile) {
        handleSendMedia();
      } else {
        handleSend();
      }
    }
  };

  // File attachment preview mode
  if (selectedFile) {
    const mediaType = ACCEPTED_TYPES[selectedFile.type] || 'document';
    const TypeIcon = mediaType === 'image' ? Image : mediaType === 'video' ? Video : FileText;

    return (
      <div className="bg-wa-bg-panel border-t border-wa-border px-4 py-3 space-y-3">
        {/* Preview */}
        <div className="flex items-start gap-3 bg-wa-bg-input rounded-xl p-3">
          {filePreview ? (
            <img
              src={filePreview}
              alt="Preview"
              className="w-20 h-20 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-wa-bg-hover flex items-center justify-center shrink-0">
              <TypeIcon size={24} className="text-wa-text-secondary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-wa-text-primary font-medium truncate">
              {selectedFile.name}
            </p>
            <p className="text-xs text-wa-text-secondary">
              {(selectedFile.size / 1024).toFixed(0)} KB · {mediaType}
            </p>
          </div>
          <button
            onClick={handleCancelFile}
            className="p-1.5 text-wa-text-secondary hover:text-red-500 transition-colors rounded-full hover:bg-wa-bg-hover shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Caption + Send */}
        <div className="flex items-end gap-2">
          <div className="flex-1 bg-wa-bg-input rounded-xl px-4 py-2">
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Adicione uma legenda..."
              className="w-full bg-transparent text-sm text-wa-text-primary placeholder:text-wa-text-secondary outline-none"
              autoFocus
            />
          </div>
          <button
            onClick={handleSendMedia}
            disabled={isLoading || disabled}
            className={cn(
              'p-2.5 rounded-full transition-colors',
              'bg-wa-accent-green text-white hover:opacity-90',
              (isLoading || disabled) && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative bg-wa-bg-panel border-t border-wa-border px-4 py-3">
      {/* ── Templates Floating Panel ── */}
      {templatesOpen && recipientPhone && (
        <TemplatesFloatingPanel
          recipientPhone={recipientPhone}
          onClose={() => setTemplatesOpen(false)}
        />
      )}

      <div className="flex items-end gap-2">
        {/* Emoji */}
        <button className="p-2 text-wa-text-secondary hover:text-wa-text-primary transition-colors rounded-full hover:bg-wa-bg-hover">
          <Smile size={22} />
        </button>

        {/* Attach */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 text-wa-text-secondary hover:text-wa-text-primary transition-colors rounded-full hover:bg-wa-bg-hover"
        >
          <Paperclip size={22} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          accept={Object.keys(ACCEPTED_TYPES).join(',')}
          className="hidden"
        />

        {/* Templates ⚡ */}
        {recipientPhone && (
          <button
            onClick={() => setTemplatesOpen(v => !v)}
            title="Respostas rápidas (/) "
            className={cn(
              'p-2 transition-colors rounded-full',
              templatesOpen
                ? 'text-amber-500 bg-amber-50'
                : 'text-wa-text-secondary hover:text-amber-500 hover:bg-wa-bg-hover'
            )}
          >
            <Zap size={20} />
          </button>
        )}

        {/* Input */}
        <div className="flex-1 bg-wa-bg-input rounded-xl px-4 py-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite uma mensagem"
            rows={1}
            disabled={disabled}
            className="w-full bg-transparent text-sm text-wa-text-primary placeholder:text-wa-text-secondary outline-none resize-none max-h-30"
          />
        </div>

        {/* Send / Mic */}
        {text.trim() ? (
          <button
            onClick={handleSend}
            disabled={isLoading || disabled}
            className={cn(
              'p-2.5 rounded-full transition-colors',
              'bg-wa-accent-green text-white hover:opacity-90',
              (isLoading || disabled) && 'opacity-50 cursor-not-allowed'
            )}
          >
            <Send size={20} />
          </button>
        ) : (
          <button className="p-2 text-wa-text-secondary hover:text-wa-text-primary transition-colors rounded-full hover:bg-wa-bg-hover">
            <Mic size={22} />
          </button>
        )}
      </div>
    </div>
  );
}
