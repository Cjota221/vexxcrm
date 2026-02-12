'use client';

import { useState } from 'react';
import {
  Settings,
  Wifi,
  Bot,
  Palette,
  Bell,
  Shield,
  Save,
  RefreshCw,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { useTenantConfig } from '@/hooks/useTenantConfig';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { TenantConfig } from '@/types';

type SettingsTab = 'whatsapp' | 'facilzap' | 'anne' | 'preferences';

const TABS: { key: SettingsTab; label: string; icon: typeof Settings }[] = [
  { key: 'whatsapp', label: 'WhatsApp', icon: Wifi },
  { key: 'facilzap', label: 'FacilZap', icon: Shield },
  { key: 'anne', label: 'Anne (IA)', icon: Bot },
  { key: 'preferences', label: 'Preferências', icon: Palette },
];

export default function ConfiguracoesPage() {
  const { config, isLoading } = useTenantConfig();
  const [activeTab, setActiveTab] = useState<SettingsTab>('whatsapp');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-txt-primary">Configurações</h1>
        <p className="text-sm text-txt-secondary mt-1">
          Gerencie integrações, IA e preferências do sistema
        </p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar de tabs */}
        <div className="w-56 shrink-0">
          <nav className="space-y-1">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  activeTab === key
                    ? 'bg-crm-primary text-white'
                    : 'text-txt-secondary hover:bg-surface-100 hover:text-txt-primary'
                }`}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 max-w-2xl">
          {isLoading ? (
            <Card>
              <div className="p-6 space-y-4 animate-pulse">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 bg-surface-200 rounded" />
                ))}
              </div>
            </Card>
          ) : (
            <>
              {activeTab === 'whatsapp' && <WhatsAppSettings config={config} />}
              {activeTab === 'facilzap' && <FacilZapSettings config={config} />}
              {activeTab === 'anne' && <AnneSettings config={config} />}
              {activeTab === 'preferences' && <PreferencesSettings config={config} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function WhatsAppSettings({ config }: { config?: TenantConfig }) {
  const evolution = config?.evolution;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Wifi size={16} /> Evolution API (WhatsApp)
        </CardTitle>
        {evolution?.status && (
          <Badge variant={evolution.status === 'open' ? 'success' : 'danger'}>
            {evolution.status === 'open' ? 'Conectado' : 'Desconectado'}
          </Badge>
        )}
      </CardHeader>
      <div className="px-6 pb-6 space-y-4">
        <Input label="URL do servidor" placeholder="https://api.evolution.com" defaultValue={evolution?.url || ''} />
        <Input label="API Key" type="password" placeholder="••••••••" defaultValue={evolution?.api_key || ''} />
        <Input label="Nome da instância" placeholder="vexx-crm" defaultValue={evolution?.instance_name || ''} />
        <div className="flex gap-2 pt-2">
          <Button variant="primary">
            <Save size={16} /> Salvar
          </Button>
          <Button variant="secondary">
            <RefreshCw size={16} /> Reconectar
          </Button>
        </div>
      </div>
    </Card>
  );
}

function FacilZapSettings({ config }: { config?: TenantConfig }) {
  const facilzap = config?.facilzap;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Shield size={16} /> FacilZap
        </CardTitle>
        <Badge variant={facilzap?.enabled ? 'success' : 'neutral'}>
          {facilzap?.enabled ? 'Ativo' : 'Inativo'}
        </Badge>
      </CardHeader>
      <div className="px-6 pb-6 space-y-4">
        <Input label="Token" type="password" placeholder="••••••••" defaultValue={facilzap?.token || ''} />
        <Input label="URL do site" placeholder="https://meusite.facilzap.app.br" defaultValue={facilzap?.site_url || ''} />
        <div className="flex gap-2 pt-2">
          <Button variant="primary">
            <Save size={16} /> Salvar
          </Button>
        </div>
      </div>
    </Card>
  );
}

function AnneSettings({ config }: { config?: TenantConfig }) {
  const openai = config?.openai;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Bot size={16} /> Anne (IA Assistente)
        </CardTitle>
        <Badge variant={openai?.enabled ? 'success' : 'neutral'}>
          {openai?.enabled ? 'Ativa' : 'Inativa'}
        </Badge>
      </CardHeader>
      <div className="px-6 pb-6 space-y-4">
        <Input label="OpenAI API Key" type="password" placeholder="sk-..." defaultValue={openai?.api_key || ''} />
        <Input label="Modelo" placeholder="gpt-4o" defaultValue={openai?.model || 'gpt-4o'} />
        <div>
          <label className="label mb-1.5">System Prompt</label>
          <textarea
            className="input min-h-32 resize-y"
            placeholder="Você é a Anne, assistente virtual de vendas..."
            defaultValue={openai?.system_prompt || ''}
          />
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="primary">
            <Save size={16} /> Salvar
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PreferencesSettings({ config }: { config?: TenantConfig }) {
  const prefs = config?.preferences;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Palette size={16} /> Preferências
        </CardTitle>
      </CardHeader>
      <div className="px-6 pb-6 space-y-4">
        <div>
          <label className="label mb-1.5">Tema</label>
          <select className="input" defaultValue={prefs?.theme || 'light'}>
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
          </select>
        </div>
        <div>
          <label className="label mb-1.5">Idioma</label>
          <select className="input" defaultValue={prefs?.language || 'pt-BR'}>
            <option value="pt-BR">Português (Brasil)</option>
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </div>
        <div className="flex items-center justify-between p-3 bg-surface-50 rounded-xl">
          <div>
            <p className="text-sm font-medium text-txt-primary flex items-center gap-2">
              <Bell size={14} /> Notificações
            </p>
            <p className="text-xs text-txt-secondary mt-0.5">
              Receber notificações de novas mensagens
            </p>
          </div>
          <button className="text-crm-primary">
            {prefs?.notifications_enabled !== false ? (
              <CheckCircle size={24} />
            ) : (
              <AlertCircle size={24} className="text-txt-secondary" />
            )}
          </button>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="primary">
            <Save size={16} /> Salvar
          </Button>
        </div>
      </div>
    </Card>
  );
}
