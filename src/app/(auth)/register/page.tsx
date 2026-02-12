'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Mail, Lock, Eye, EyeOff, User, Building2 } from 'lucide-react';

/**
 * Página de Cadastro / Registro.
 * Cria conta no Supabase Auth + Tenant + Profile.
 */
export default function RegisterPage() {
  const { register, isLoading } = useAuth();
  const [formData, setFormData] = useState({
    storeName: '',
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validações
    if (!formData.storeName || !formData.fullName || !formData.email || !formData.password) {
      setError('Preencha todos os campos obrigatórios');
      return;
    }

    if (formData.password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    const result = await register({
      storeName: formData.storeName,
      fullName: formData.fullName,
      email: formData.email,
      password: formData.password,
    });

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <div className="w-full max-w-md">
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
        <div className="bg-white rounded-2xl shadow-card p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">✅</span>
          </div>
          <h2 className="text-xl font-bold text-txt-primary mb-2">
            Conta criada com sucesso!
          </h2>
          <p className="text-sm text-txt-secondary mb-6">
            Verifique seu e-mail para confirmar sua conta, depois faça login.
          </p>
          <Link href="/login">
            <Button variant="primary" className="w-full py-3">
              Ir para o Login
            </Button>
          </Link>
        </div>
      </div>
    );
  }

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
          Crie sua conta e comece a vender mais
        </p>
      </div>

      {/* Form Card */}
      <div className="bg-white rounded-2xl shadow-card p-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nome da Loja */}
          <div>
            <label className="block text-sm font-medium text-txt-primary mb-1.5">
              Nome da Loja / Empresa
            </label>
            <div className="relative">
              <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
              <input
                type="text"
                placeholder="Minha Loja"
                value={formData.storeName}
                onChange={(e) => updateField('storeName', e.target.value)}
                autoFocus
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-border bg-surface-bg text-txt-primary text-sm placeholder:text-txt-muted focus:outline-none focus:ring-2 focus:ring-crm-primary/30 focus:border-crm-primary transition-all"
              />
            </div>
          </div>

          {/* Nome Completo */}
          <div>
            <label className="block text-sm font-medium text-txt-primary mb-1.5">
              Seu Nome Completo
            </label>
            <div className="relative">
              <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
              <input
                type="text"
                placeholder="João Silva"
                value={formData.fullName}
                onChange={(e) => updateField('fullName', e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-border bg-surface-bg text-txt-primary text-sm placeholder:text-txt-muted focus:outline-none focus:ring-2 focus:ring-crm-primary/30 focus:border-crm-primary transition-all"
              />
            </div>
          </div>

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
                value={formData.email}
                onChange={(e) => updateField('email', e.target.value)}
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
                placeholder="Mínimo 6 caracteres"
                value={formData.password}
                onChange={(e) => updateField('password', e.target.value)}
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

          {/* Confirmar Senha */}
          <div>
            <label className="block text-sm font-medium text-txt-primary mb-1.5">
              Confirmar Senha
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Repita a senha"
                value={formData.confirmPassword}
                onChange={(e) => updateField('confirmPassword', e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-border bg-surface-bg text-txt-primary text-sm placeholder:text-txt-muted focus:outline-none focus:ring-2 focus:ring-crm-primary/30 focus:border-crm-primary transition-all"
              />
            </div>
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
            Criar minha conta
          </Button>
        </form>
      </div>

      {/* Link para login */}
      <div className="text-center mt-6">
        <p className="text-sm text-txt-secondary">
          Já tem uma conta?{' '}
          <Link
            href="/login"
            className="text-crm-primary font-semibold hover:underline transition-colors"
          >
            Fazer login
          </Link>
        </p>
      </div>

      <p className="text-center text-[10px] text-txt-muted mt-8">
        VEXX CRM v2.0 — Todos os direitos reservados
      </p>
    </div>
  );
}
