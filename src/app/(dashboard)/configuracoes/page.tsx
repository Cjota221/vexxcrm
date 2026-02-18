'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
  Store,
  Plug,
  Database,
  Wrench,
  FileUp,
  Upload,
  ArrowLeft,
  ArrowRight,
  Clock,
  Activity,
} from 'lucide-react';
import { useTenantConfig } from '@/hooks/useTenantConfig';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase';
import { FileDropzone } from '@/components/import/FileDropzone';
import { ColumnMapper } from '@/components/import/ColumnMapper';
import { ImportProgress } from '@/components/import/ImportProgress';
import { ImportResults } from '@/components/import/ImportResults';
import { SystemHealthCheck } from '@/components/crm/SystemHealthCheck';
import { BulkSyncPanel } from '@/components/settings/BulkSyncPanel';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';
import type { TenantConfig } from '@/types';

type SettingsTab = 'profile' | 'integrations' | 'data' | 'maintenance';

const TABS: { key: SettingsTab; label: string; icon: typeof Settings; description: string }[] = [
  { key: 'profile', label: 'Perfil e Loja', icon: Store, description: 'Dados básicos da loja' },
  { key: 'integrations', label: 'Integrações', icon: Plug, description: 'WhatsApp, FacilZap e IA' },
  { key: 'data', label: 'Gestão de Dados', icon: Database, description: 'Importação, sync e logs' },
  { key: 'maintenance', label: 'Manutenção', icon: Wrench, description: 'Sistema e diagnósticos' },
];

export default function ConfiguracoesPage() {
  const { config, isLoading } = useTenantConfig();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-txt-primary flex items-center gap-2">
          <Settings size={24} className="text-crm-primary" />
          Central de Controle
        </h1>
        <p className="text-sm text-txt-secondary mt-1">
          Gerencie sua loja, integrações, dados e sistema em um só lugar
        </p>
      </div>

      <div className="flex gap-1 p-1 bg-slate-50 rounded-xl">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all \${
              activeTab === key
                ? 'bg-white shadow-sm text-crm-primary'
                : 'text-txt-secondary hover:text-txt-primary'
            }`}
          >
            <Icon size={16} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      <div className="max-w-4xl">
        {isLoading ? (
          <Card>
            <div className="p-8 space-y-4 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 bg-surface-200 rounded-lg" />
              ))}
            </div>
          </Card>
        ) : (
          <>
            {activeTab === 'profile' && <ProfileTab config={config} />}
            {activeTab === 'integrations' && <IntegrationsTab config={config} />}
            {activeTab === 'data' && <DataManagementTab config={config} />}
            {activeTab === 'maintenance' && <MaintenanceTab />}
          </>
        )}
      </div>
    </div>
  );
}

function ProfileTab({ config }: { config?: TenantConfig }) {
  const prefs = config?.preferences;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle><Store size={16} /> Dados da Loja</CardTitle></CardHeader>
        <div className="px-6 pb-6 space-y-4">
          <Input label="Nome da loja" placeholder="Minha Loja" defaultValue="" />
          <Input label="CNPJ" placeholder="00.000.000/0001-00" defaultValue="" />
          <Input label="E-mail de contato" type="email" placeholder="contato@minhaloja.com.br" defaultValue="" />
          <Input label="Telefone" placeholder="(11) 99999-9999" defaultValue="" />
          <div className="flex gap-2 pt-2"><Button variant="primary"><Save size={16} /> Salvar</Button></div>
        </div>
      </Card>
      <Card>
        <CardHeader><CardTitle><Palette size={16} /> Preferências</CardTitle></CardHeader>
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
              <p className="text-xs text-txt-secondary mt-0.5">Receber notificações de novas mensagens</p>
            </div>
            <button className="text-crm-primary">
              {prefs?.notifications_enabled !== false ? <CheckCircle size={24} /> : <AlertCircle size={24} className="text-txt-secondary" />}
            </button>
          </div>
          <div className="flex gap-2 pt-2"><Button variant="primary"><Save size={16} /> Salvar</Button></div>
        </div>
      </Card>
    </div>
  );
}

function IntegrationsTab({ config }: { config?: TenantConfig }) {
  return (
    <div className="space-y-6">
      <WhatsAppSettings config={config} />
      <FacilZapSettings config={config} />
      <AnneSettings config={config} />
    </div>
  );
}

function WhatsAppSettings({ config }: { config?: TenantConfig }) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();

  // Polling real do status via Evolution API (não depende do config do Supabase)
  const { data: whatsappStatus } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: async () => {
      const res = await fetch('/api/whatsapp/status', {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!res.ok) return { status: 'close' };
      const data = await res.json();
      return data;
    },
    refetchInterval: 15_000, // Polling a cada 15s
    staleTime: 10_000,
    enabled: !!accessToken,
  });

  const isConnected = whatsappStatus?.status === 'open';

  const handleConnect = async () => {
    setIsConnecting(true); setConnectionError(null); setQrCode(null);
    try {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao conectar');
      if (data.status === 'connecting' && data.qrCode) {
        setQrCode(data.qrCode);
      } else if (data.status === 'open') {
        queryClient.invalidateQueries({ queryKey: ['tenant-config'] });
        queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
      }
    } catch (err: unknown) {
      setConnectionError(err instanceof Error ? err.message : 'Erro ao conectar');
    } finally { setIsConnecting(false); }
  };

  const handleDisconnect = async () => {
    try {
      await fetch('/api/whatsapp/connect', {
        method: 'DELETE',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      setQrCode(null);
      queryClient.invalidateQueries({ queryKey: ['tenant-config'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
    } catch { /* silent */ }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/whatsapp/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ maxChats: 50, maxMessagesPerChat: 100 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao sincronizar');
      setSyncResult(
        `✅ ${data.data.chats_synced} chats, ${data.data.messages_synced} mensagens, ${data.data.clients_created} novos clientes`
      );
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    } catch (err: unknown) {
      setSyncResult(`❌ ${err instanceof Error ? err.message : 'Erro'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle><Wifi size={16} /> WhatsApp</CardTitle>
        <Badge variant={isConnected ? 'success' : 'neutral'}>
          {isConnected ? 'Conectado' : 'Desconectado'}
        </Badge>
      </CardHeader>
      <div className="px-6 pb-6 space-y-4">
        {isConnected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <CheckCircle size={24} className="text-emerald-500" />
              <div>
                <p className="text-sm font-semibold text-emerald-700">WhatsApp Ativo</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  Monitorando mensagens em tempo real
                  {whatsappStatus?.instanceName && (
                    <span className="ml-1 opacity-60">· {whatsappStatus.instanceName}</span>
                  )}
                </p>
              </div>
            </div>
            <Button variant="ghost" onClick={handleDisconnect} className="text-red-600 hover:bg-red-50">
              <AlertCircle size={14} /> Desconectar
            </Button>
            <div className="border-t pt-3 space-y-2">
              <Button variant="secondary" onClick={handleSync} disabled={isSyncing} className="w-full">
                <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                {isSyncing ? 'Sincronizando...' : 'Sincronizar Histórico'}
              </Button>
              <p className="text-[11px] text-txt-muted">
                Importa conversas e mensagens existentes do WhatsApp para o CRM.
              </p>
              {syncResult && (
                <p className="text-xs mt-1 p-2 rounded-lg bg-slate-50 border">{syncResult}</p>
              )}
            </div>
          </div>
        ) : qrCode ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-txt-secondary">Escaneie o QR Code com seu WhatsApp</p>
            <div className="inline-block p-4 bg-white rounded-xl border shadow-sm">
              <img src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`} alt="QR Code" className="w-56 h-56" />
            </div>
            <p className="text-xs text-txt-muted">Abra o WhatsApp {'>'} Menu {'>'} Aparelhos conectados {'>'} Conectar aparelho</p>
            <Button variant="secondary" onClick={handleConnect}>
              <RefreshCw size={14} /> Gerar novo QR Code
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-txt-secondary">Conecte seu WhatsApp para receber e enviar mensagens diretamente pelo CRM.</p>
            {connectionError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertCircle size={14} className="text-red-500 shrink-0" />
                <p className="text-xs text-red-600">{connectionError}</p>
              </div>
            )}
            <Button variant="primary" onClick={handleConnect} disabled={isConnecting}>
              <Wifi size={14} /> {isConnecting ? 'Gerando QR Code...' : 'Conectar WhatsApp'}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function FacilZapSettings({ config }: { config?: TenantConfig }) {
  const { updateConfig, isUpdating } = useTenantConfig();
  const [token, setToken] = useState('');
  const [siteUrl, setSiteUrl] = useState(config?.facilzap?.site_url || '');
  const handleSave = async () => {
    try {
      const update: Record<string, unknown> = { facilzap: { site_url: siteUrl } as Record<string, unknown> };
      if (token.trim()) {
        (update.facilzap as Record<string, unknown>).enabled = true;
        (update.facilzap as Record<string, unknown>).token = token.trim();
      }
      await updateConfig(update);
      alert('Configurações do FacilZap salvas com sucesso!');
      setToken('');
    } catch (error) {
      alert('Erro ao salvar: ' + (error as Error).message);
    }
  };
  const facilzap = config?.facilzap;
  return (
    <Card>
      <CardHeader>
        <CardTitle><Shield size={16} /> FacilZap</CardTitle>
        <Badge variant={facilzap?.enabled ? 'success' : 'neutral'}>{facilzap?.enabled ? 'Ativo' : 'Inativo'}</Badge>
      </CardHeader>
      <div className="px-6 pb-6 space-y-4">
        <Input label="Token" type="password" placeholder={facilzap?.has_token ? '•••• (configurado)' : 'Cole o token aqui'} value={token} onChange={(e) => setToken(e.target.value)} />
        <Input label="URL do site" placeholder="https://meusite.facilzap.app.br" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
        <div className="flex gap-2 pt-2">
          <Button variant="primary" onClick={handleSave} disabled={isUpdating}>
            <Save size={16} /> {isUpdating ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
        {facilzap?.enabled && (
          <p className="text-xs text-txt-muted">A sincronização de dados está disponível na aba <strong>Gestão de Dados</strong>.</p>
        )}
      </div>
    </Card>
  );
}

function AnneSettings({ config }: { config?: TenantConfig }) {
  const { updateConfig, isUpdating } = useTenantConfig();
  const openai = config?.openai;
  const [provider, setProvider] = useState(openai?.provider || 'openai');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(openai?.base_url || '');
  const [model, setModel] = useState(openai?.model || 'gpt-4o');
  const [systemPrompt, setSystemPrompt] = useState(openai?.system_prompt || '');
  const handleSave = async () => {
    try {
      const update: Record<string, unknown> = { openai: { model, system_prompt: systemPrompt, provider, base_url: baseUrl } as Record<string, unknown> };
      if (apiKey.trim()) {
        (update.openai as Record<string, unknown>).enabled = true;
        (update.openai as Record<string, unknown>).api_key = apiKey.trim();
      }
      await updateConfig(update);
      alert('Configurações da IA salvas com sucesso!');
      setApiKey('');
    } catch (error) {
      alert('Erro ao salvar: ' + (error as Error).message);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle><Bot size={16} /> Anne (IA Assistente)</CardTitle>
        <Badge variant={openai?.enabled ? 'success' : 'neutral'}>{openai?.enabled ? 'Ativa' : 'Inativa'}</Badge>
      </CardHeader>
      <div className="px-6 pb-6 space-y-4">
        <div>
          <label className="label mb-1.5">Provedor de IA</label>
          <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="openai">OpenAI (ChatGPT)</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="google">Google (Gemini)</option>
            <option value="groq">Groq</option>
            <option value="deepseek">DeepSeek</option>
            <option value="custom">Outro (Custom API)</option>
          </select>
        </div>
        <Input label="API Key" type="password" placeholder={openai?.has_key ? '•••• (configurada)' : 'sk-... ou chave do provedor'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        {(provider === 'custom' || provider === 'groq' || provider === 'deepseek') && (
          <Input label="URL Base da API" placeholder="https://api.provedor.com/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        )}
        <Input label="Modelo" placeholder={provider === 'openai' ? 'gpt-4o' : provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : provider === 'google' ? 'gemini-pro' : provider === 'groq' ? 'llama-3.3-70b-versatile' : provider === 'deepseek' ? 'deepseek-chat' : 'nome-do-modelo'} value={model} onChange={(e) => setModel(e.target.value)} />
        <div>
          <label className="label mb-1.5">System Prompt (Personalidade da Anne)</label>
          <textarea className="input min-h-32 resize-y" placeholder="Você é a Anne, assistente virtual de vendas da loja..." value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
          <p className="text-xs text-txt-muted mt-1">Escreva a personalidade e instruções da sua IA.</p>
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

function DataManagementTab({ config }: { config?: TenantConfig }) {
  return (
    <div className="space-y-6">
      <BulkSyncPanel />
      <SyncStatusCard config={config} />
      <ImportCard />
      <DataEngineeringCard />
    </div>
  );
}

function SyncStatusCard({ config }: { config?: TenantConfig }) {
  const { accessToken } = useAuthStore();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  const [lastSyncInfo, setLastSyncInfo] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<{ products: number; clients: number; orders: number; errors: string[] } | null>(null);
  const [clearResults, setClearResults] = useState<{ products_deleted: number; clients_deleted: number; orders_deleted: number } | null>(null);

  const fetchLastSync = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch('/api/facilzap/sync-admin/stats', { headers: { Authorization: `Bearer \${accessToken}` } });
      if (res.ok) {
        const data = await res.json();
        if (data.data?.last_sync) {
          const syncDate = new Date(data.data.last_sync);
          const diffMin = Math.floor((Date.now() - syncDate.getTime()) / 60000);
          if (diffMin < 1) setLastSyncInfo('Sincronizado agora mesmo');
          else if (diffMin < 60) setLastSyncInfo(`Sincronizado automaticamente há \${diffMin} minutos`);
          else if (diffMin < 1440) setLastSyncInfo(`Sincronizado há \${Math.floor(diffMin / 60)} horas`);
          else setLastSyncInfo(`Sincronizado em \${syncDate.toLocaleDateString('pt-BR')}`);
        }
      }
    } catch { /* silent */ }
  }, [accessToken]);

  useState(() => { fetchLastSync(); });

  const handleClear = async (andResync = false) => {
    setIsClearing(true); setClearResults(null); setSyncResults(null);
    setSyncProgress('Limpando dados sincronizados...'); setShowClearConfirm(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { alert('Sessão expirada.'); return; }
      const res = await fetch('/api/facilzap/clear', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer \${session.access_token}` }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao limpar');
      setClearResults(data.results); setSyncProgress('Dados limpos com sucesso!');
      if (andResync) { setIsClearing(false); await new Promise(r => setTimeout(r, 1000)); handleSync(); return; }
    } catch (error) { setSyncProgress(''); alert('Erro: ' + (error as Error).message); }
    finally { setIsClearing(false); }
  };

  const handleSync = async () => {
    if (!config?.facilzap?.has_token && !config?.facilzap?.enabled) { alert('Configure o token do FacilZap na aba Integrações primeiro!'); return; }
    setIsSyncing(true); setSyncResults(null);
    const totals = { products: 0, clients: 0, orders: 0, errors: [] as string[] };
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { alert('Sessão expirada.'); return; }
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer \${session.access_token}` };
      let page = 1; let hasMore = true;
      while (hasMore && page <= 50) {
        setSyncProgress(`Sincronizando produtos... (página \${page})`);
        const res = await fetch('/api/facilzap/sync', { method: 'POST', headers, body: JSON.stringify({ entity: 'products', page }) });
        const data = await res.json(); if (!res.ok) throw new Error(data.error);
        totals.products += data.results?.products || 0;
        if (data.results?.errors?.length) totals.errors.push(...data.results.errors);
        hasMore = data.results?.hasMore?.products || false; page++;
      }
      page = 1; hasMore = true;
      while (hasMore && page <= 100) {
        setSyncProgress(`Sincronizando clientes... (página \${page})`);
        const res = await fetch('/api/facilzap/sync', { method: 'POST', headers, body: JSON.stringify({ entity: 'clients', page }) });
        const data = await res.json(); if (!res.ok) throw new Error(data.error);
        totals.clients += data.results?.clients || 0;
        if (data.results?.errors?.length) totals.errors.push(...data.results.errors);
        hasMore = data.results?.hasMore?.clients || false; page++;
      }
      page = 1; hasMore = true;
      while (hasMore && page <= 100) {
        setSyncProgress(`Sincronizando pedidos... (página \${page})`);
        try {
          const res = await fetch('/api/facilzap/sync', { method: 'POST', headers, body: JSON.stringify({ entity: 'orders', page }) });
          const data = await res.json();
          if (!res.ok) { totals.errors.push(`Página \${page}: \${data.error}`); if (res.status >= 500) { page++; continue; } throw new Error(data.error); }
          totals.orders += data.results?.orders || 0;
          if (data.results?.errors?.length) totals.errors.push(...data.results.errors);
          hasMore = data.results?.hasMore?.orders || false; page++;
        } catch (err: unknown) { const msg = err instanceof Error ? err.message : 'Erro'; totals.errors.push(`Página \${page}: \${msg}`); break; }
      }
      setSyncProgress('Sincronização completa!'); setSyncResults(totals); fetchLastSync();
    } catch (error) { setSyncProgress(''); alert('Erro: ' + (error as Error).message); }
    finally { setIsSyncing(false); }
  };

  const facilzap = config?.facilzap;
  return (
    <Card>
      <CardHeader>
        <CardTitle><RefreshCw size={16} /> Sincronização FacilZap</CardTitle>
        {lastSyncInfo && (<div className="flex items-center gap-1.5 text-xs text-txt-muted"><Clock size={12} />{lastSyncInfo}</div>)}
      </CardHeader>
      <div className="px-6 pb-6 space-y-4">
        {!facilzap?.enabled && !facilzap?.has_token ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-sm text-amber-700 font-medium">FacilZap não configurado</p>
            <p className="text-xs text-amber-600 mt-1">Vá para a aba <strong>Integrações</strong> e configure o token.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={handleSync} disabled={isSyncing || isClearing}>
                <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
                {isSyncing ? 'Sincronizando...' : 'Sincronizar Agora'}
              </Button>
              <Button variant="ghost" onClick={() => setShowClearConfirm(true)} disabled={isSyncing || isClearing} className="text-red-600 hover:bg-red-50 hover:text-red-700">
                <Trash2 size={16} />{isClearing ? 'Limpando...' : 'Limpar e Ressincronizar'}
              </Button>
            </div>
            {showClearConfirm && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
                <p className="text-sm font-medium text-red-700">Tem certeza que deseja limpar todos os dados?</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={() => handleClear(true)} className="bg-red-600 hover:bg-red-700"><Trash2 size={14} /> Limpar e Re-sincronizar</Button>
                  <Button variant="ghost" onClick={() => handleClear(false)} className="text-red-600"><Trash2 size={14} /> Apenas Limpar</Button>
                  <Button variant="ghost" onClick={() => setShowClearConfirm(false)}>Cancelar</Button>
                </div>
              </div>
            )}
          </>
        )}
        {syncProgress && (<div className="p-3 bg-blue-50 border border-blue-200 rounded-xl"><p className="text-sm text-blue-700 font-medium">{syncProgress}</p></div>)}
        {syncResults && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-xl space-y-1">
            <p className="text-sm font-medium text-green-700">Sincronização completa!</p>
            <p className="text-xs text-green-600">{syncResults.products} produtos importados</p>
            <p className="text-xs text-green-600">{syncResults.clients} clientes importados</p>
            <p className="text-xs text-green-600">{syncResults.orders} pedidos importados</p>
            {syncResults.errors.length > 0 && (
              <div className="mt-2 pt-2 border-t border-green-200">
                <p className="text-xs text-orange-600 font-medium">{syncResults.errors.length} avisos:</p>
                {syncResults.errors.slice(0, 5).map((err, i) => (<p key={i} className="text-xs text-orange-500">{err}</p>))}
              </div>
            )}
          </div>
        )}
        {clearResults && !syncResults && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl space-y-1">
            <p className="text-sm font-medium text-orange-700">Limpeza concluída!</p>
            <p className="text-xs text-orange-600">{clearResults.products_deleted} produtos removidos</p>
            <p className="text-xs text-orange-600">{clearResults.clients_deleted} clientes removidos</p>
            <p className="text-xs text-orange-600">{clearResults.orders_deleted} pedidos removidos</p>
          </div>
        )}
      </div>
    </Card>
  );
}

interface PreviewData { columns: string[]; sample: Record<string, unknown>[]; suggestedMapping: Record<string, string>; totalRows: number; fileName: string; fileSize: number; }
interface ImportStats { total: number; merged: number; created: number; enriched: number; skipped: number; errors: number; }
interface ImportDetail { row: number; name?: string; phone?: string; action: 'created' | 'merged' | 'enriched' | 'skipped' | 'error'; reason?: string; }
type ImportStep = 'idle' | 'upload' | 'mapping' | 'processing' | 'results';

function ImportCard() {
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [step, setStep] = useState<ImportStep>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [details, setDetails] = useState<ImportDetail[]>([]);
  const token = accessToken;

  const handleFileSelected = useCallback(async (selectedFile: File) => {
    setFile(selectedFile); setError(null); setIsLoading(true);
    try {
      const formData = new FormData(); formData.append('file', selectedFile);
      const res = await fetch('/api/import/preview', { method: 'POST', headers: token ? { Authorization: `Bearer \${token}` } : {}, body: formData });
      if (!res.ok) { const errBody = await res.json().catch(() => ({})); throw new Error(errBody.error || `Erro \${res.status}`); }
      const data = await res.json(); setPreview(data); setMapping(data.suggestedMapping || {}); setStep('mapping');
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Erro ao processar'); }
    finally { setIsLoading(false); }
  }, [token]);

  const handleProcess = useCallback(async () => {
    if (!file || !preview) return;
    if (Object.values(mapping).filter(v => v !== '').length === 0) { setError('Mapeie pelo menos uma coluna.'); return; }
    setError(null); setStep('processing'); setProgress(0); setStatusMessage('Enviando...');
    try {
      const pi = setInterval(() => { setProgress(p => p >= 85 ? (clearInterval(pi), p) : p + Math.random() * 8); }, 500);
      setStatusMessage('Processando deduplicacao...');
      const formData = new FormData(); formData.append('file', file); formData.append('mapping', JSON.stringify(mapping));
      const res = await fetch('/api/import/process', { method: 'POST', headers: token ? { Authorization: `Bearer \${token}` } : {}, body: formData });
      clearInterval(pi);
      if (!res.ok) { const errBody = await res.json().catch(() => ({})); throw new Error(errBody.error || `Erro \${res.status}`); }
      const data = await res.json(); setProgress(100); setStatusMessage('Concluido!');
      await new Promise(r => setTimeout(r, 600));
      setStats(data.stats); setDetails(data.details || []); setStep('results');
      queryClient.invalidateQueries({ queryKey: ['clients'] }); queryClient.invalidateQueries({ queryKey: ['intelligence'] });
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Erro'); setStep('mapping'); }
  }, [file, preview, mapping, token, queryClient]);

  const handleReset = useCallback(() => {
    setStep('idle'); setExpanded(false); setFile(null); setPreview(null); setMapping({});
    setProgress(0); setStatusMessage(''); setStats(null); setDetails([]); setError(null);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle><FileUp size={16} /> Importação de Planilhas</CardTitle>
        {step === 'idle' && (
          <Button variant="secondary" onClick={() => { setExpanded(!expanded); setStep(expanded ? 'idle' : 'upload'); }}>
            <Upload size={14} /> {expanded ? 'Fechar' : 'Importar Dados'}
          </Button>
        )}
      </CardHeader>
      {(step !== 'idle' || expanded) && (
        <div className="px-6 pb-6 space-y-4">
          <p className="text-xs text-txt-muted">Importe clientes de planilhas. Deduplicacao por CPF e telefone automatica.</p>
          {error && (<div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl"><AlertCircle size={16} className="text-red-500 shrink-0" /><p className="text-xs text-red-600">{error}</p></div>)}
          {step === 'upload' && (
            <div className="space-y-4">
              <FileDropzone onFileSelected={handleFileSelected} isLoading={isLoading} />
              {isLoading && <div className="text-center text-xs text-txt-muted animate-pulse">Analisando arquivo...</div>}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-blue-50 rounded-xl"><p className="text-[11px] font-semibold text-blue-700">CPF (Prioridade 1)</p><p className="text-[10px] text-blue-600 mt-0.5">Deduplica por CPF</p></div>
                <div className="p-3 bg-green-50 rounded-xl"><p className="text-[11px] font-semibold text-green-700">Telefone (Prioridade 2)</p><p className="text-[10px] text-green-600 mt-0.5">Normaliza e compara</p></div>
                <div className="p-3 bg-amber-50 rounded-xl"><p className="text-[11px] font-semibold text-amber-700">Enriquecimento</p><p className="text-[10px] text-amber-600 mt-0.5">Preenche vazios</p></div>
              </div>
            </div>
          )}
          {step === 'mapping' && preview && (
            <div className="space-y-4">
              <ColumnMapper preview={preview} mapping={mapping} onMappingChange={setMapping} />
              <div className="flex justify-between">
                <Button variant="secondary" onClick={() => { setStep('upload'); setPreview(null); setFile(null); }}><ArrowLeft size={14} /> Voltar</Button>
                <Button variant="primary" onClick={handleProcess} disabled={!Object.values(mapping).some(v => v !== '')}>Processar <ArrowRight size={14} /></Button>
              </div>
            </div>
          )}
          {step === 'processing' && <ImportProgress progress={progress} statusMessage={statusMessage} isProcessing={true} />}
          {step === 'results' && stats && <ImportResults stats={stats} details={details} onReset={handleReset} />}
        </div>
      )}
      {step === 'idle' && !expanded && (<div className="px-6 pb-4"><p className="text-xs text-txt-muted">Importe dados de planilhas (.xlsx, .csv) com deduplicacao inteligente.</p></div>)}
    </Card>
  );
}

function DataEngineeringCard() {
  const { accessToken } = useAuthStore();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{ total_clients: number; total_orders: number; total_products: number; orphan_orders: number; last_sync: string | null; data_quality_score: number } | null>(null);
  const [actionStatus, setActionStatus] = useState<Record<string, 'idle' | 'loading' | 'success' | 'error'>>({ sync: 'idle', audit: 'idle', repair: 'idle' });

  const loadStats = useCallback(async () => {
    if (!accessToken) return; setLoading(true);
    try {
      const res = await fetch('/api/facilzap/sync-admin/stats', { headers: { Authorization: `Bearer \${accessToken}` } });
      if (res.ok) { const data = await res.json(); setStats(data.data); }
    } catch { /* silent */ } finally { setLoading(false); }
  }, [accessToken]);

  const runAction = async (action: string) => {
    if (!accessToken) return;
    setActionStatus(prev => ({ ...prev, [action]: 'loading' }));
    try {
      const endpoint = action === 'sync' ? 'full-sync' : action === 'audit' ? 'audit' : 'repair-orphans';
      const body = action === 'audit' ? { mode: 'full' } : action === 'repair' ? { createMissingClients: true } : {};
      const res = await fetch(`/api/facilzap/sync-admin/\${endpoint}`, { method: 'POST', headers: { Authorization: `Bearer \${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('Erro');
      setActionStatus(prev => ({ ...prev, [action]: 'success' })); loadStats();
    } catch { setActionStatus(prev => ({ ...prev, [action]: 'error' })); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle><Activity size={16} /> Engenharia de Dados</CardTitle>
        <Button variant="secondary" onClick={() => { setExpanded(!expanded); if (!expanded) loadStats(); }}>{expanded ? 'Fechar' : 'Abrir Painel'}</Button>
      </CardHeader>
      {!expanded && (<div className="px-6 pb-4"><p className="text-xs text-txt-muted">Sync avancado, auditoria forense e reparo de dados orfaos.</p></div>)}
      {expanded && (
        <div className="px-6 pb-6 space-y-4">
          {loading && !stats ? (
            <div className="flex items-center gap-2 py-8 justify-center text-txt-muted"><RefreshCw size={16} className="animate-spin" /> Carregando...</div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-blue-50 rounded-xl text-center"><p className="text-xl font-bold text-blue-700">{stats.total_clients.toLocaleString('pt-BR')}</p><p className="text-[10px] text-blue-600">Clientes</p></div>
                <div className="p-3 bg-purple-50 rounded-xl text-center"><p className="text-xl font-bold text-purple-700">{stats.total_orders.toLocaleString('pt-BR')}</p><p className="text-[10px] text-purple-600">Pedidos</p></div>
                <div className="p-3 bg-green-50 rounded-xl text-center"><p className="text-xl font-bold text-green-700">{stats.total_products.toLocaleString('pt-BR')}</p><p className="text-[10px] text-green-600">Produtos</p></div>
                <div className="p-3 bg-amber-50 rounded-xl text-center"><p className={`text-xl font-bold \${stats.orphan_orders > 0 ? 'text-amber-700' : 'text-green-700'}`}>{stats.orphan_orders.toLocaleString('pt-BR')}</p><p className="text-[10px] text-amber-600">Orfaos</p></div>
              </div>
              <div className={`p-4 rounded-xl border \${stats.data_quality_score >= 95 ? 'bg-emerald-50 border-emerald-200' : stats.data_quality_score >= 80 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600">Qualidade dos Dados</p>
                    <p className={`text-2xl font-bold \${stats.data_quality_score >= 95 ? 'text-emerald-600' : stats.data_quality_score >= 80 ? 'text-amber-600' : 'text-red-600'}`}>{stats.data_quality_score.toFixed(1)}%</p>
                  </div>
                  {stats.last_sync && (<div className="flex items-center gap-1 text-xs text-gray-500"><Clock size={12} />{new Date(stats.last_sync).toLocaleString('pt-BR')}</div>)}
                </div>
                <div className="mt-2 w-full bg-white/60 rounded-full h-2">
                  <div className={`h-2 rounded-full transition-all \${stats.data_quality_score >= 95 ? 'bg-emerald-500' : stats.data_quality_score >= 80 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `\${Math.min(100, stats.data_quality_score)}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: 'sync', label: 'Sync Completo', desc: 'Paginacao + retry', bg: 'bg-blue-50 border-blue-200 hover:border-blue-300' },
                  { key: 'audit', label: 'Auditoria', desc: 'Checksum completo', bg: 'bg-purple-50 border-purple-200 hover:border-purple-300' },
                  { key: 'repair', label: 'Reparar Orfaos', desc: 'Re-vincular pedidos', bg: 'bg-amber-50 border-amber-200 hover:border-amber-300' },
                ].map(({ key, label, desc, bg }) => (
                  <button key={key} onClick={() => runAction(key)} disabled={actionStatus[key] === 'loading'} className={`p-3 rounded-xl border text-left transition-all hover:shadow-sm disabled:opacity-50 \${actionStatus[key] === 'success' ? 'bg-green-50 border-green-200' : actionStatus[key] === 'error' ? 'bg-red-50 border-red-200' : bg}`}>
                    <p className="text-xs font-semibold text-gray-800">{label}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{desc}</p>
                    {actionStatus[key] === 'loading' && <RefreshCw size={12} className="animate-spin mt-1 text-gray-400" />}
                    {actionStatus[key] === 'success' && <CheckCircle size={12} className="mt-1 text-green-500" />}
                  </button>
                ))}
              </div>
            </>
          ) : (<p className="text-sm text-txt-muted text-center py-4">Erro ao carregar dados</p>)}
        </div>
      )}
    </Card>
  );
}

function MaintenanceTab() {
  return (<div className="space-y-6"><SystemHealthCheck /></div>);
}
