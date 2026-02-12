'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { Mail, ArrowLeft } from 'lucide-react';

/**
 * Página de recuperação de senha.
 * Envia email de reset via Supabase Auth.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Informe seu e-mail');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        setError(error.message);
      } else {
        setSent(true);
      }
    } catch {
      setError('Erro ao enviar e-mail. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      {/* Logo */}
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <Image
            src="/images/logo-icon.png"
            alt="VEXX CRM"
            width={180}
            height={50}
            className="object-contain h-14 w-auto"
            priority
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-card p-8">
        {sent ? (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
              <Mail size={28} className="text-crm-primary" />
            </div>
            <h2 className="text-xl font-bold text-txt-primary mb-2">
              E-mail enviado!
            </h2>
            <p className="text-sm text-txt-secondary mb-6">
              Verifique sua caixa de entrada em <strong>{email}</strong> e clique no link para redefinir sua senha.
            </p>
            <Link href="/login">
              <Button variant="primary" className="w-full py-3">
                Voltar ao Login
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-txt-primary mb-2">
              Esqueceu a senha?
            </h2>
            <p className="text-sm text-txt-secondary mb-6">
              Informe seu e-mail e enviaremos um link para redefinir sua senha.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-txt-primary mb-1.5">
                  E-mail
                </label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
                  <input
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-border bg-surface-bg text-txt-primary text-sm placeholder:text-txt-muted focus:outline-none focus:ring-2 focus:ring-crm-primary/30 focus:border-crm-primary transition-all"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                  <span className="text-red-500">⚠</span>
                  {error}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                isLoading={isLoading}
                className="w-full py-3 text-base"
              >
                Enviar link de recuperação
              </Button>
            </form>
          </>
        )}
      </div>

      {/* Voltar ao login */}
      <div className="text-center mt-6">
        <Link
          href="/login"
          className="text-sm text-txt-secondary hover:text-txt-primary inline-flex items-center gap-1 transition-colors"
        >
          <ArrowLeft size={14} />
          Voltar ao login
        </Link>
      </div>
    </div>
  );
}
