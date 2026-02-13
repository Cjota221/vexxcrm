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
  Trash2,
} from 'lucide-react';
import { useTenantConfig } from '@/hooks/useTenantConfig';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase';
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
  const { updateConfig, isUpdating } = useTenantConfig();
  const [token, setToken] = useState(config?.facilzap?.token || '');
  const [siteUrl, setSiteUrl] = useState(config?.facilzap?.site_url || '');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  const [syncResults, setSyncResults] = useState<{
    products: number;
    clients: number;
    orders: number;
    errors: string[];
  } | null>(null);
  const [clearResults, setClearResults] = useState<{
    products_deleted: number;
    clients_deleted: number;
    orders_deleted: number;
  } | null>(null);

  const handleSave = async () => {
    try {
      await updateConfig({
        facilzap: {
          enabled: !!token,
          token,
          site_url: siteUrl,
        },
      });
      alert('✅ Configurações do FacilZap salvas com sucesso!');
    } catch (error) {
      alert('❌ Erro ao salvar: ' + (error as Error).message);
    }
  };

  const handleClear = async (andResync = false) => {
    setIsClearing(true);
    setClearResults(null);
    setSyncResults(null);
    setSyncProgress('🗑️ Limpando dados sincronizados...');
    setShowClearConfirm(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert('❌ Sessão expirada. Faça login novamente.');
        return;
      }

      const res = await fetch('/api/facilzap/clear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao limpar dados');

      setClearResults(data.results);
      setSyncProgress('✅ Dados limpos com sucesso!');

      // Se pediu para re-sincronizar, iniciar sync automaticamente
      if (andResync) {
        setIsClearing(false);
        // Aguardar 1 segundo para dar feedback visual
        await new Promise(resolve => setTimeout(resolve, 1000));
        handleSync();
        return;
      }
    } catch (error) {
      setSyncProgress('');
      alert('❌ Erro ao limpar: ' + (error as Error).message);
    } finally {
      setIsClearing(false);
    }
  };

  const handleSync = async () => {
    if (!config?.facilzap?.token) {
      alert('⚠️ Configure e salve o token do FacilZap primeiro!');
      return;
    }

    setIsSyncing(true);
    setSyncResults(null);
    
    const totals = { products: 0, clients: 0, orders: 0, errors: [] as string[] };
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert('❌ Sessão expirada. Faça login novamente.');
        return;
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      };

      // ETAPA 1: Sincronizar PRODUTOS (múltiplas páginas)
      let page = 1;
      let hasMore = true;
      while (hasMore && page <= 10) {
        setSyncProgress(`📦 Sincronizando produtos... (página ${page})`);
        const res = await fetch('/api/facilzap/sync', {
          method: 'POST',
          headers,
          body: JSON.stringify({ entity: 'products', page }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao sincronizar produtos');
        totals.products += data.results?.products || 0;
        if (data.results?.errors?.length) totals.errors.push(...data.results.errors);
        hasMore = data.results?.hasMore?.products || false;
        page++;
      }

      // ETAPA 2: Sincronizar CLIENTES (múltiplas páginas)
      page = 1;
      hasMore = true;
      while (hasMore && page <= 15) {
        setSyncProgress(`👥 Sincronizando clientes... (página ${page})`);
        const res = await fetch('/api/facilzap/sync', {
          method: 'POST',
          headers,
          body: JSON.stringify({ entity: 'clients', page }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao sincronizar clientes');
        totals.clients += data.results?.clients || 0;
        if (data.results?.errors?.length) totals.errors.push(...data.results.errors);
        hasMore = data.results?.hasMore?.clients || false;
        page++;
      }

      // ETAPA 3: Sincronizar PEDIDOS (múltiplas páginas)
      page = 1;
      hasMore = true;
      while (hasMore && page <= 20) {
        setSyncProgress(`🛒 Sincronizando pedidos... (página ${page})`);
        const res = await fetch('/api/facilzap/sync', {
          method: 'POST',
          headers,
          body: JSON.stringify({ entity: 'orders', page }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao sincronizar pedidos');
        totals.orders += data.results?.orders || 0;
        if (data.results?.errors?.length) totals.errors.push(...data.results.errors);
        hasMore = data.results?.hasMore?.orders || false;
        page++;
      }

      setSyncProgress('✅ Sincronização completa!');
      setSyncResults(totals);
    } catch (error) {
      setSyncProgress('');
      alert('❌ Erro ao sincronizar: ' + (error as Error).message);
    } finally {
      setIsSyncing(false);
    }
  };

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
        <Input 
          label="Token" 
          type="password" 
          placeholder="••••••••" 
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <Input 
          label="URL do site" 
          placeholder="https://meusite.facilzap.app.br" 
          value={siteUrl}
          onChange={(e) => setSiteUrl(e.target.value)}
        />
        <div className="flex flex-wrap gap-2 pt-2">
          <Button 
            variant="primary" 
            onClick={handleSave}
            disabled={isUpdating}
          >
            <Save size={16} /> {isUpdating ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button 
            variant="secondary" 
            onClick={handleSync}
            disabled={isSyncing || isClearing || !facilzap?.enabled}
          >
            <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} /> 
            {isSyncing ? 'Sincronizando...' : 'Sincronizar Dados'}
          </Button>
          <Button 
            variant="ghost" 
            onClick={() => setShowClearConfirm(true)}
            disabled={isSyncing || isClearing || !facilzap?.enabled}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 size={16} /> 
            {isClearing ? 'Limpando...' : 'Limpar Dados'}
          </Button>
        </div>

        {/* Modal de confirmação de limpeza */}
        {showClearConfirm && (
          <div className="mt-3 p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
            <p className="text-sm font-medium text-red-700">
              ⚠️ Tem certeza que deseja limpar todos os dados sincronizados?
            </p>
            <p className="text-xs text-red-600">
              Isso irá remover TODOS os produtos, clientes e pedidos importados do FacilZap. 
              Esta ação não pode ser desfeita.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button 
                variant="primary" 
                onClick={() => handleClear(true)}
                className="bg-red-600 hover:bg-red-700"
              >
                <Trash2 size={14} /> Limpar e Re-sincronizar
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => handleClear(false)}
                className="text-red-600 hover:bg-red-100"
              >
                <Trash2 size={14} /> Apenas Limpar
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setShowClearConfirm(false)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
        
        {/* Progresso da sincronização */}
        {syncProgress && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-sm text-blue-700 font-medium">{syncProgress}</p>
          </div>
        )}

        {/* Resultados da sincronização */}
        {syncResults && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl space-y-1">
            <p className="text-sm font-medium text-green-700">✅ Sincronização completa!</p>
            <p className="text-xs text-green-600">📦 {syncResults.products} produtos importados</p>
            <p className="text-xs text-green-600">👥 {syncResults.clients} clientes importados</p>
            <p className="text-xs text-green-600">🛒 {syncResults.orders} pedidos importados</p>
            {syncResults.errors.length > 0 && (
              <div className="mt-2 pt-2 border-t border-green-200">
                <p className="text-xs text-orange-600 font-medium">⚠️ {syncResults.errors.length} avisos:</p>
                {syncResults.errors.slice(0, 5).map((err, i) => (
                  <p key={i} className="text-xs text-orange-500">{err}</p>
                ))}
                {syncResults.errors.length > 5 && (
                  <p className="text-xs text-orange-500">... e mais {syncResults.errors.length - 5} avisos</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Resultados da limpeza */}
        {clearResults && !syncResults && (
          <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-xl space-y-1">
            <p className="text-sm font-medium text-orange-700">🗑️ Limpeza concluída!</p>
            <p className="text-xs text-orange-600">📦 {clearResults.products_deleted} produtos removidos</p>
            <p className="text-xs text-orange-600">👥 {clearResults.clients_deleted} clientes removidos</p>
            <p className="text-xs text-orange-600">🛒 {clearResults.orders_deleted} pedidos removidos</p>
          </div>
        )}

        {facilzap?.enabled && !syncProgress && !syncResults && (
          <p className="text-xs text-gray-500 mt-2">
            💡 Clique em "Sincronizar Dados" para importar produtos, clientes e pedidos do FacilZap.
          </p>
        )}
      </div>
    </Card>
  );
}

function AnneSettings({ config }: { config?: TenantConfig }) {
  const { updateConfig, isUpdating } = useTenantConfig();
  const openai = config?.openai;
  const [provider, setProvider] = useState(openai?.provider || 'openai');
  const [apiKey, setApiKey] = useState(openai?.api_key || '');
  const [baseUrl, setBaseUrl] = useState(openai?.base_url || '');
  const [model, setModel] = useState(openai?.model || 'gpt-4o');
  const [systemPrompt, setSystemPrompt] = useState(openai?.system_prompt || '');

  const handleSave = async () => {
    try {
      await updateConfig({
        openai: {
          enabled: !!apiKey,
          api_key: apiKey,
          model,
          system_prompt: systemPrompt,
          provider,
          base_url: baseUrl,
        },
      });
      alert('✅ Configurações da IA salvas com sucesso!');
    } catch (error) {
      alert('❌ Erro ao salvar: ' + (error as Error).message);
    }
  };

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
        <div>
          <label className="label mb-1.5">Provedor de IA</label>
          <select
            className="input"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            <option value="openai">OpenAI (ChatGPT)</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="google">Google (Gemini)</option>
            <option value="groq">Groq</option>
            <option value="deepseek">DeepSeek</option>
            <option value="custom">Outro (Custom API)</option>
          </select>
        </div>

        <Input
          label="API Key"
          type="password"
          placeholder="sk-... ou chave do provedor"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />

        {(provider === 'custom' || provider === 'groq' || provider === 'deepseek') && (
          <Input
            label="URL Base da API"
            placeholder="https://api.provedor.com/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        )}

        <Input
          label="Modelo"
          placeholder={
            provider === 'openai' ? 'gpt-4o' :
            provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' :
            provider === 'google' ? 'gemini-pro' :
            provider === 'groq' ? 'llama-3.3-70b-versatile' :
            provider === 'deepseek' ? 'deepseek-chat' :
            'nome-do-modelo'
          }
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />

        <div>
          <label className="label mb-1.5">System Prompt (Personalidade da Anne)</label>
          <textarea
            className="input min-h-32 resize-y"
            placeholder="Você é a Anne, assistente virtual de vendas da loja. Seja educada, proativa e ajude os clientes com dúvidas sobre produtos, pedidos e promoções..."
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
          <p className="text-xs text-txt-muted mt-1">
            💡 Escreva a personalidade e instruções da sua IA. Ela vai usar esse prompt como base para todas as respostas.
          </p>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="primary" onClick={handleSave} disabled={isUpdating}>
            <Save size={16} /> {isUpdating ? 'Salvando...' : 'Salvar'}
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
