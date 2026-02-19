'use client';

/**
 * AvatarImage — Avatar com fallback automático para iniciais.
 *
 * Resolve o problema de URLs expiradas do WhatsApp (403):
 * ao falhar o carregamento da imagem, exibe as iniciais coloridas.
 */

import { useState } from 'react';
import { getInitials, getAvatarColor, cn } from '@/lib/utils';

interface AvatarImageProps {
  src: string | null | undefined;
  name: string;
  size?: number;        // px — default 44
  className?: string;
  rounded?: 'full' | '2xl' | 'xl' | 'lg';
}

export function AvatarImage({
  src,
  name,
  size = 44,
  className,
  rounded = 'full',
}: AvatarImageProps) {
  const [failed, setFailed] = useState(false);

  const roundedClass = {
    full: 'rounded-full',
    '2xl': 'rounded-2xl',
    xl: 'rounded-xl',
    lg: 'rounded-lg',
  }[rounded];

  const sizeStyle = { width: size, height: size, minWidth: size, minHeight: size };

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        style={sizeStyle}
        className={cn('object-cover shrink-0', roundedClass, className)}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      style={{ ...sizeStyle, backgroundColor: getAvatarColor(name) }}
      className={cn(
        'flex items-center justify-center shrink-0 text-white font-semibold select-none',
        roundedClass,
        className,
      )}
    >
      <span style={{ fontSize: Math.max(10, Math.round(size * 0.33)) }}>
        {getInitials(name)}
      </span>
    </div>
  );
}
