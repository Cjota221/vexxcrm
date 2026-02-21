'use client';

/**
 * privacy.ts — Utilitários de privacidade de dados (LGPD)
 * Mascaramento de CPF, e-mail e telefone na UI
 */

import React, { useState, useRef, useEffect } from 'react';

// ─────────────────────────────────────────────
// Funções de mascaramento
// ─────────────────────────────────────────────

/**
 * Mascara um CPF ou CNPJ.
 * CPF  "123.456.789-00" → "***..456.789-**"
 * CNPJ "12.345.678/0001-90" → "**.345.678/0001-**"
 */
export function maskCpf(value: string | null | undefined): string {
  if (!value) return '';
  const clean = value.replace(/\D/g, '');

  if (clean.length === 11) {
    // CPF: ***.456.789-**
    return `***.${clean.slice(3, 6)}.${clean.slice(6, 9)}-**`;
  }
  if (clean.length === 14) {
    // CNPJ: **.345.678/0001-**
    return `**.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-**`;
  }
  // Fallback genérico: mostra só o meio
  const half = Math.floor(value.length / 2);
  return value.slice(0, 2) + '*'.repeat(half - 2) + value.slice(-2);
}

/**
 * Mascara um e-mail.
 * "joana.silva@gmail.com" → "jo***@gmail.com"
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

/**
 * Mascara um telefone.
 * "(62) 99999-8888" → "(62) 9****-8888"
 * "5562999998888"   → "(62) 9****-8888"
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');

  // Remove DDI 55 se houver (13 dígitos)
  const local = digits.length === 13 ? digits.slice(2) : digits;

  if (local.length === 11) {
    const ddd = local.slice(0, 2);
    const first = local[2];
    const last4 = local.slice(-4);
    return `(${ddd}) ${first}****-${last4}`;
  }
  if (local.length === 10) {
    const ddd = local.slice(0, 2);
    const last4 = local.slice(-4);
    return `(${ddd}) ****-${last4}`;
  }
  // Fallback: mostra apenas os 4 últimos dígitos
  return `****-${digits.slice(-4)}`;
}

// ─────────────────────────────────────────────
// Componente MaskedField
// ─────────────────────────────────────────────

type MaskedFieldType = 'cpf' | 'email' | 'phone' | 'auto';

interface MaskedFieldProps {
  value: string | null | undefined;
  type?: MaskedFieldType;
  /** Mostrar botão de copiar valor real ao revelar */
  copyable?: boolean;
  /** Classes extras no wrapper */
  className?: string;
}

/**
 * Exibe um valor sensível mascarado.
 * Ao clicar no ícone 👁️ revela o valor por 10 segundos e depois re-mascara.
 */
export function MaskedField({ value, type = 'auto', copyable = false, className = '' }: MaskedFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-detecta tipo se 'auto'
  const resolvedType = React.useMemo((): Exclude<MaskedFieldType, 'auto'> => {
    if (type !== 'auto') return type;
    if (!value) return 'cpf';
    if (value.includes('@')) return 'email';
    const digits = value.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 13) return 'phone';
    if (digits.length === 11 || digits.length === 14) return 'cpf';
    return 'cpf';
  }, [value, type]);

  const maskedValue = React.useMemo(() => {
    if (!value) return '';
    switch (resolvedType) {
      case 'cpf':   return maskCpf(value);
      case 'email': return maskEmail(value);
      case 'phone': return maskPhone(value);
    }
  }, [value, resolvedType]);

  const handleReveal = () => {
    if (revealed) {
      setRevealed(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    setRevealed(true);
    timerRef.current = setTimeout(() => setRevealed(false), 10_000);
  };

  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Limpa timer ao desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!value) return null;

  return (
    React.createElement('span', {
      className: `inline-flex items-center gap-1.5 font-mono text-sm ${className}`
    },
      React.createElement('span', null, revealed ? value : maskedValue),
      React.createElement('button', {
        type: 'button',
        onClick: handleReveal,
        title: revealed ? 'Ocultar' : 'Revelar',
        className: 'text-txt-secondary hover:text-txt-primary transition-colors p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary',
        'aria-label': revealed ? 'Ocultar dado sensível' : 'Revelar dado sensível'
      },
        revealed
          ? React.createElement(EyeOffIcon, null)
          : React.createElement(EyeIcon, null)
      ),
      revealed && copyable && value &&
        React.createElement('button', {
          type: 'button',
          onClick: handleCopy,
          title: copied ? 'Copiado!' : 'Copiar',
          className: 'text-txt-secondary hover:text-txt-primary transition-colors p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary',
          'aria-label': 'Copiar valor'
        },
          copied
            ? React.createElement(CheckIcon, null)
            : React.createElement(CopyIcon, null)
        )
    )
  );
}

// ─────────────────────────────────────────────
// Mini ícones SVG inline (sem dependência extra)
// ─────────────────────────────────────────────

function EyeIcon() {
  return React.createElement('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    width: 13,
    height: 13,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  },
    React.createElement('path', { d: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z' }),
    React.createElement('circle', { cx: 12, cy: 12, r: 3 })
  );
}

function EyeOffIcon() {
  return React.createElement('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    width: 13,
    height: 13,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  },
    React.createElement('path', { d: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24' }),
    React.createElement('line', { x1: 1, y1: 1, x2: 23, y2: 23 })
  );
}

function CopyIcon() {
  return React.createElement('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    width: 13,
    height: 13,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  },
    React.createElement('rect', { width: 14, height: 14, x: 8, y: 8, rx: 2, ry: 2 }),
    React.createElement('path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' })
  );
}

function CheckIcon() {
  return React.createElement('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    width: 13,
    height: 13,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#059669',
    strokeWidth: 2.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  },
    React.createElement('polyline', { points: '20 6 9 17 4 12' })
  );
}
