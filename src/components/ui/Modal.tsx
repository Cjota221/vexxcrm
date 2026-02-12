'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/ui';

interface ModalProps {
  id: string;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  onClose?: () => void;
}

/**
 * Modal com overlay e animação.
 */
export function Modal({ id, title, children, maxWidth = 'md', onClose }: ModalProps) {
  const { activeModal, closeModal } = useUIStore();
  const isOpen = activeModal === id;

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    closeModal();
    onClose?.();
  };

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={handleClose}
      />

      {/* Modal content */}
      <div
        className={cn(
          'relative w-full bg-white rounded-[20px] shadow-modal animate-slide-up',
          maxWidthClasses[maxWidth]
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-surface-border">
          <h2 className="text-lg font-semibold text-txt-primary">{title}</h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-txt-muted hover:text-txt-primary hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
