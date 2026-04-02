'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';

/**
 * Página de Login.
 * Formulário com email e senha, integração com Supabase Auth.
 */
export default function LoginPage() {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🔐 Login: Iniciando...', { email });
    setError('');

    if (!email || !password) {
      setError('Preencha todos os campos');
      return;
    }

    console.log('🔐 Login: Chamando função login...');
    const result = await login(email, password);
    console.log('🔐 Login: Resultado:', result);
    
    if (result.error) {
      console.error('🔐 Login: Erro:', result.error);
      setError(result.error);
    } else {
      console.log('🔐 Login: Sucesso! Redirecionando...');
    }
  };

  return (
    <div className="w-full max-w-md">
      {/* Logo */}
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-linear-to-br from-primary to-primary-dark rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-2xl font-bold text-white">V</span>
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-bold text-txt-primary">VEXX CRM</h1>
              <p className="text-xs text-txt-secondary">WhatsApp Multi-Tenant</p>
            </div>
          </div>
        </div>
        <p className="text-sm text-txt-secondary mt-2">
          Faça login para acessar sua conta
        </p>
      </div>

      {/* Form Card */}
      <div className="bg-white rounded-2xl shadow-card p-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email */}
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

          {/* Senha */}
          <div>
            <label className="block text-sm font-medium text-txt-primary mb-1.5">
              Senha
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-12 py-3 rounded-xl border border-surface-border bg-surface-bg text-txt-primary text-sm placeholder:text-txt-muted focus:outline-none focus:ring-2 focus:ring-crm-primary/30 focus:border-crm-primary transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-muted hover:text-txt-secondary transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Esqueceu a senha */}
          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-xs text-crm-primary hover:underline transition-colors"
            >
              Esqueceu a senha?
            </Link>
          </div>

          {/* Erro */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
              <span className="text-red-500">⚠</span>
              {error}
            </div>
          )}

          {/* Botão */}
          <Button
            type="submit"
            variant="primary"
            isLoading={isLoading}
            className="w-full py-3 text-base"
          >
            Entrar
          </Button>
        </form>
      </div>


      <p className="text-center text-[10px] text-txt-muted mt-8">
        VEXX CRM v2.0 — Todos os direitos reservados
      </p>
    </div>
  );
}
