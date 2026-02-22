'use client';

import { useRef, useCallback } from 'react';
import { Bold, Italic, Strikethrough, Code, Eye } from 'lucide-react';

/**
 * Renderiza a formatação WhatsApp (markdown simplificado) em HTML visual.
 * *texto* → negrito  |  _texto_ → itálico  |  ~texto~ → tachado  |  `texto` → código
 */
export function renderWhatsApp(text: string): string {
  if (!text) return '';
  // Escapar HTML básico
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Formatação WhatsApp (ordem importa: evitar sobreposição)
  html = html
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')           // *negrito*
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')                     // _itálico_
    .replace(/~([^~\n]+)~/g, '<s>$1</s>')                       // ~tachado~
    .replace(/`([^`\n]+)`/g, '<code class="wa-code">$1</code>') // `código`
    .replace(/\n/g, '<br/>');                                    // quebras de linha

  return html;
}

interface WhatsAppTextEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
  variables?: string[];
  /** Mostrar label "Texto da mensagem" */
  label?: string;
  /** Mostrar o preview automático abaixo do editor */
  showPreview?: boolean;
}

/**
 * Editor de texto com barra de formatação WhatsApp e preview ao vivo.
 * Suporta: *negrito*, _itálico_, ~tachado~, `código`, quebras de linha.
 */
export function WhatsAppTextEditor({
  value,
  onChange,
  placeholder = 'Digite o texto da mensagem...',
  rows = 5,
  variables = [],
  label,
  showPreview = true,
}: WhatsAppTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** Envolve a seleção atual com um par de marcadores. */
  const wrap = useCallback((marker: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const before = value.slice(0, start);
    const after = value.slice(end);
    const newValue = `${before}${marker}${selected || 'texto'}${marker}${after}`;
    onChange(newValue);
    // Reposicionar seleção dentro dos marcadores
    requestAnimationFrame(() => {
      ta.focus();
      const newStart = start + marker.length;
      const newEnd = newStart + (selected || 'texto').length;
      ta.setSelectionRange(newStart, newEnd);
    });
  }, [value, onChange]);

  /** Insere uma variável na posição do cursor. */
  const insertVariable = useCallback((variable: string) => {
    const ta = textareaRef.current;
    const pos = ta?.selectionStart ?? value.length;
    const newValue = value.slice(0, pos) + variable + value.slice(pos);
    onChange(newValue);
    requestAnimationFrame(() => {
      ta?.focus();
      const newPos = pos + variable.length;
      ta?.setSelectionRange(newPos, newPos);
    });
  }, [value, onChange]);

  const hasContent = value.trim().length > 0;

  return (
    <div className="space-y-2">
      {/* Label */}
      {label && (
        <label className="text-xs font-medium text-txt-secondary block">{label}</label>
      )}

      {/* Toolbar de formatação */}
      <div className="flex items-center gap-0.5 border border-surface-200 rounded-t-lg bg-surface-50 px-2 py-1.5">
        <span className="text-[10px] text-txt-muted mr-2 uppercase tracking-wide font-medium">Formatar:</span>
        <button
          type="button"
          title="Negrito (*texto*)"
          onClick={() => wrap('*')}
          className="p-1.5 rounded hover:bg-surface-200 text-txt-secondary hover:text-txt-primary transition-colors"
        >
          <Bold size={13} />
        </button>
        <button
          type="button"
          title="Itálico (_texto_)"
          onClick={() => wrap('_')}
          className="p-1.5 rounded hover:bg-surface-200 text-txt-secondary hover:text-txt-primary transition-colors"
        >
          <Italic size={13} />
        </button>
        <button
          type="button"
          title="Tachado (~texto~)"
          onClick={() => wrap('~')}
          className="p-1.5 rounded hover:bg-surface-200 text-txt-secondary hover:text-txt-primary transition-colors"
        >
          <Strikethrough size={13} />
        </button>
        <button
          type="button"
          title="Código (`texto`)"
          onClick={() => wrap('`')}
          className="p-1.5 rounded hover:bg-surface-200 text-txt-secondary hover:text-txt-primary transition-colors"
        >
          <Code size={13} />
        </button>
        <div className="ml-auto flex items-center gap-1 text-[10px] text-txt-muted">
          <Eye size={10} />
          <span>Preview abaixo</span>
        </div>
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-surface-200 border-t-0 rounded-b-lg resize-none focus:outline-none focus:ring-2 focus:ring-crm-primary/40 font-mono text-[13px] leading-relaxed"
      />

      {/* Pílulas de variáveis */}
      {variables.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {variables.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => insertVariable(v)}
              className="text-xs px-2 py-0.5 bg-crm-primary/10 text-crm-primary rounded-full hover:bg-crm-primary/20 transition-colors"
            >
              {v}
            </button>
          ))}
        </div>
      )}

      {/* Preview visual estilo WhatsApp */}
      {showPreview && hasContent && (
        <div className="rounded-xl border border-green-100 bg-green-50 p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-green-700 uppercase tracking-wide">
            <Eye size={10} />
            <span>Preview — como aparece no WhatsApp</span>
          </div>
          <div className="bg-[#dcf8c6] rounded-xl rounded-tr-sm px-3 py-2 text-sm text-[#111b21] max-w-xs shadow-sm">
            <p
              className="leading-relaxed wrap-break-word [&_strong]:font-bold [&_em]:italic [&_s]:line-through [&_.wa-code]:font-mono [&_.wa-code]:bg-black/10 [&_.wa-code]:px-1 [&_.wa-code]:rounded"
              dangerouslySetInnerHTML={{ __html: renderWhatsApp(value) }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
