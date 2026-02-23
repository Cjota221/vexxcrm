'use client';

/**
 * message-parser.tsx
 * Parser defensivo de mensagens WhatsApp/Evolution API.
 * Suporta: quebras de linha, *negrito*, _itálico_, ~riscado~, `código`, URLs clicáveis.
 * Nunca lança exceção — sempre retorna algo renderizável.
 * Regex compiladas fora do componente = zero re-criação por render.
 */

import React from 'react';

// ─── Regex compiladas globalmente ────────────────────────────────────────────
const INLINE_PATTERN = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`|https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;

// ─── Parser principal ─────────────────────────────────────────────────────────

export function parseMessageContent(raw: string | null | undefined): React.ReactNode {
  if (!raw || typeof raw !== 'string') return null;

  // Limitar para prevenir ReDoS
  // Normalizar quebras de linha Windows (\r\n) e Mac antigo (\r) para \n
  const text = raw.slice(0, 10_000).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Separar por quebras de linha primeiro
  const lines = text.split('\n');

  return (
    <>
      {lines.map((line, lineIndex) => (
        <React.Fragment key={lineIndex}>
          {lineIndex > 0 && <br />}
          {parseInline(line)}
        </React.Fragment>
      ))}
    </>
  );
}

function parseInline(text: string): React.ReactNode {
  if (!text) return null;

  const parts = text.split(INLINE_PATTERN);

  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;

        // URL clicável
        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline hover:text-blue-700 break-all"
              onClick={e => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }

        // *negrito*
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          return <strong key={i} className="font-semibold">{part.slice(1, -1)}</strong>;
        }

        // _itálico_
        if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }

        // ~riscado~
        if (part.startsWith('~') && part.endsWith('~') && part.length > 2) {
          return <s key={i} className="opacity-70">{part.slice(1, -1)}</s>;
        }

        // `código`
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return (
            <code
              key={i}
              className="bg-black/10 rounded px-1 py-0.5 font-mono text-[12px]"
            >
              {part.slice(1, -1)}
            </code>
          );
        }

        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}
