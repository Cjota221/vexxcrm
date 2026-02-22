'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
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
  Coins,
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
import { DEFAULT_ANNE_PROMPT_UI } from '@/lib/anne-prompt';

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
  const { accessToken } = useAuthStore();
  const prefs = config?.preferences;

  // ── Estado do perfil ──
  const [storeName, setStoreName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Carregar dados atuais ──
  useEffect(() => {
    if (!accessToken) return;
    fetch('/api/tenants/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        setStoreName(d.store_name || '');
        setCnpj(d.cnpj || '');
        setEmail(d.contact_email || '');
        setPhone(d.contact_phone || '');
      })
      .catch(() => {/* silent */});
  }, [accessToken]);

  const handleSaveProfile = async () => {
    if (!accessToken) return;
    setIsSaving(true); setSaveMsg(null);
    try {
      const res = await fetch('/api/tenants/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ store_name: storeName, cnpj, contact_email: email, contact_phone: phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
      setStoreName(data.store_name || storeName);
      setSaveMsg({ type: 'success', text: '✅ Perfil salvo com sucesso!' });
    } catch (err) {
      setSaveMsg({ type: 'error', text: `❌ ${err instanceof Error ? err.message : 'Erro'}` });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMsg(null), 4000);
    }
  };

  // ── Dark Mode ──
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('vexx-theme') as 'light' | 'dark') || prefs?.theme || 'light';
    }
    return prefs?.theme || 'light';
  });

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('vexx-theme', newTheme);
  };

  // Aplicar tema salvo no localStorage ao montar
  useEffect(() => {
    const saved = localStorage.getItem('vexx-theme') as 'light' | 'dark' | null;
    if (saved === 'dark') {
      document.documentElement.classList.add('dark');
      setTheme('dark');
    }
  }, []);

  const { updateConfig, isUpdating: isUpdatingPrefs } = useTenantConfig();
  const [notifEnabled, setNotifEnabled] = useState(prefs?.notifications_enabled !== false);
  const [language, setLanguage] = useState(prefs?.language || 'pt-BR');
  const [prefSaveMsg, setPrefSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSavePrefs = async () => {
    try {
      await updateConfig({ preferences: { theme, language, notifications_enabled: notifEnabled } });
      setPrefSaveMsg({ type: 'success', text: '✅ Preferências salvas!' });
    } catch (err) {
      setPrefSaveMsg({ type: 'error', text: `❌ ${err instanceof Error ? err.message : 'Erro'}` });
    } finally {
      setTimeout(() => setPrefSaveMsg(null), 4000);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle><Store size={16} /> Dados da Loja</CardTitle></CardHeader>
        <div className="px-6 pb-6 space-y-4">
          <Input
            label="Nome da loja"
            placeholder="Minha Loja"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
          />
          <Input
            label="CNPJ"
            placeholder="00.000.000/0001-00"
            value={cnpj}
            onChange={(e) => setCnpj(e.target.value)}
          />
          <Input
            label="E-mail de contato"
            type="email"
            placeholder="contato@minhaloja.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Telefone"
            placeholder="(11) 99999-9999"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          {saveMsg && (
            <div className={`p-3 rounded-xl text-sm font-medium ${saveMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {saveMsg.text}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="primary" onClick={handleSaveProfile} disabled={isSaving}>
              <Save size={16} /> {isSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </Card>

      <PixSettings config={config} />

      <Card>
        <CardHeader><CardTitle><Palette size={16} /> Preferências</CardTitle></CardHeader>
        <div className="px-6 pb-6 space-y-4">
          {/* Tema com Dark Mode real */}
          <div>
            <label className="label mb-2">Tema</label>
            <div className="flex gap-2">
              {(['light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => handleThemeChange(t)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    theme === t
                      ? 'border-crm-primary bg-crm-primary/10 text-crm-primary'
                      : 'border-surface-border text-txt-secondary hover:border-crm-primary/40'
                  }`}
                >
                  {t === 'light' ? '☀️ Claro' : '🌙 Escuro'}
                  {theme === t && <CheckCircle size={14} />}
                </button>
              ))}
            </div>
            <p className="text-xs text-txt-muted mt-1.5">
              O tema escuro é aplicado imediatamente em todo o sistema.
            </p>
          </div>

          <div>
            <label className="label mb-1.5">Idioma</label>
            <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
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
            <button
              onClick={() => setNotifEnabled(v => !v)}
              className="text-crm-primary"
            >
              {notifEnabled ? <CheckCircle size={24} /> : <AlertCircle size={24} className="text-txt-secondary" />}
            </button>
          </div>

          {prefSaveMsg && (
            <div className={`p-3 rounded-xl text-sm font-medium ${prefSaveMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {prefSaveMsg.text}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="primary" onClick={handleSavePrefs} disabled={isUpdatingPrefs}>
              <Save size={16} /> {isUpdatingPrefs ? 'Salvando...' : 'Salvar Preferências'}
            </Button>
          </div>
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

function PixSettings({ config }: { config?: TenantConfig }) {
  const { updateConfig, isUpdating } = useTenantConfig();
  const saved = config?.pix;

  const [pixKey, setPixKey] = useState(saved?.key || '');
  const [pixKeyType, setPixKeyType] = useState<'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria'>(
    saved?.keyType || 'aleatoria',
  );
  const [holderName, setHolderName] = useState(saved?.holderName || '');
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sincronizar estado quando config carrega
  useEffect(() => {
    if (saved) {
      setPixKey(saved.key || '');
      setPixKeyType(saved.keyType || 'aleatoria');
      setHolderName(saved.holderName || '');
    }
  }, [saved]);

  const handleSave = async () => {
    if (!pixKey.trim()) {
      setSaveMsg({ type: 'error', text: '❌ Informe a chave Pix antes de salvar.' });
      return;
    }
    try {
      await updateConfig({ pix: { key: pixKey.trim(), keyType: pixKeyType, holderName: holderName.trim() } });
      setSaveMsg({ type: 'success', text: '✅ Chave Pix salva! O modal do chat já vai pré-preencher automaticamente.' });
    } catch (err) {
      setSaveMsg({ type: 'error', text: `❌ ${err instanceof Error ? err.message : 'Erro ao salvar'}` });
    } finally {
      setTimeout(() => setSaveMsg(null), 5000);
    }
  };

  const PIX_LABELS: Record<string, string> = {
    cpf: 'CPF',
    cnpj: 'CNPJ',
    email: 'E-mail',
    telefone: 'Telefone',
    aleatoria: 'Chave aleatória',
  };

  const PIX_PLACEHOLDERS: Record<string, string> = {
    cpf: '000.000.000-00',
    cnpj: '00.000.000/0001-00',
    email: 'pagamentos@minhaloja.com.br',
    telefone: '+55 (11) 99999-9999',
    aleatoria: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle><Coins size={16} /> Chave Pix da Loja</CardTitle>
        <Badge variant={saved?.key ? 'success' : 'neutral'}>
          {saved?.key ? `Configurada · ${PIX_LABELS[saved.keyType] ?? saved.keyType}` : 'Não configurada'}
        </Badge>
      </CardHeader>
      <div className="px-6 pb-6 space-y-4">
        <p className="text-xs text-txt-secondary">
          Cadastre a chave Pix da sua loja uma única vez. O botão <strong>Chave Pix</strong> no chat vai
          pré-preencher automaticamente — sem precisar digitar toda vez.
          A chave é enviada como <strong>card de contato</strong> no WhatsApp, com o botão nativo
          "Copiar chave Pix" (igual ao WhatsApp Business).
        </p>

        {/* Tipo de chave */}
        <div>
          <label className="label mb-1.5">Tipo de chave</label>
          <select
            className="input"
            value={pixKeyType}
            onChange={(e) => setPixKeyType(e.target.value as typeof pixKeyType)}
          >
            {Object.entries(PIX_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        {/* Chave */}
        <Input
          label="Chave Pix"
          placeholder={PIX_PLACEHOLDERS[pixKeyType]}
          value={pixKey}
          onChange={(e) => setPixKey(e.target.value)}
        />

        {/* Titular */}
        <Input
          label="Nome do titular / loja"
          placeholder="Minha Loja LTDA"
          value={holderName}
          onChange={(e) => setHolderName(e.target.value)}
        />

        {/* Preview do card que será enviado */}
        {pixKey.trim() && (
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="w-9 h-9 rounded-full bg-amber-200 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-amber-700">
                {(holderName || 'L')[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{holderName || 'Nome do titular'}</p>
              <p className="text-xs text-gray-500 truncate">{pixKey}</p>
              <span className="inline-block mt-1 text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                Copiar chave Pix
              </span>
            </div>
          </div>
        )}

        {saveMsg && (
          <div className={`p-3 rounded-xl text-sm font-medium ${saveMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {saveMsg.text}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="primary" onClick={handleSave} disabled={isUpdating || !pixKey.trim()}>
            <Save size={16} /> {isUpdating ? 'Salvando...' : 'Salvar Chave Pix'}
          </Button>
          {saved?.key && (
            <Button
              variant="ghost"
              onClick={() => { setPixKey(''); setHolderName(''); updateConfig({ pix: undefined } as any); }}
              className="text-red-500 hover:bg-red-50"
            >
              <Trash2 size={14} /> Remover
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function FacilZapSettings({ config }: { config?: TenantConfig }) {  const { updateConfig, isUpdating } = useTenantConfig();
  const [token, setToken] = useState('');
  const [siteUrl, setSiteUrl] = useState(config?.facilzap?.site_url || '');

  // Sincronizar quando config carrega de forma assíncrona
  useEffect(() => {
    if (config?.facilzap) {
      setSiteUrl(config.facilzap.site_url || '');
    }
  }, [config?.facilzap]);

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

// Modelos padrão e labels por provedor
const AI_PROVIDER_INFO: Record<string, { label: string; defaultModel: string; modelPlaceholder: string; keyPlaceholder: string; needsBaseUrl: boolean; fixedUrl?: string }> = {
  openai:    { label: 'OpenAI (ChatGPT)',       defaultModel: 'gpt-4o-mini',                   modelPlaceholder: 'gpt-4o ou gpt-4o-mini',                  keyPlaceholder: 'sk-...',                  needsBaseUrl: false, fixedUrl: 'api.openai.com' },
  anthropic: { label: 'Anthropic (Claude)',      defaultModel: 'claude-3-5-haiku-20241022',      modelPlaceholder: 'claude-3-5-sonnet-20241022',             keyPlaceholder: 'sk-ant-...',              needsBaseUrl: false, fixedUrl: 'api.anthropic.com' },
  google:    { label: 'Google (Gemini)',         defaultModel: 'gemini-1.5-flash',               modelPlaceholder: 'gemini-1.5-flash ou gemini-1.5-pro',     keyPlaceholder: 'AIza...',                 needsBaseUrl: false, fixedUrl: 'generativelanguage.googleapis.com' },
  groq:      { label: 'Groq (LLaMA ultra-rápido)', defaultModel: 'llama-3.3-70b-versatile',     modelPlaceholder: 'llama-3.3-70b-versatile',               keyPlaceholder: 'gsk_...',                 needsBaseUrl: false, fixedUrl: 'api.groq.com' },
  deepseek:  { label: 'DeepSeek',               defaultModel: 'deepseek-chat',                  modelPlaceholder: 'deepseek-chat ou deepseek-reasoner',     keyPlaceholder: 'sk-...',                  needsBaseUrl: false, fixedUrl: 'api.deepseek.com' },
  custom:    { label: 'Outro (Custom API)',      defaultModel: '',                               modelPlaceholder: 'nome-do-modelo',                         keyPlaceholder: 'chave do provedor',       needsBaseUrl: true },
};

function AnneSettings({ config }: { config?: TenantConfig }) {
  const { updateConfig, isUpdating } = useTenantConfig();
  const openai = config?.openai;
  const [provider, setProvider] = useState(openai?.provider || 'openai');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(openai?.base_url || '');
  const [model, setModel] = useState(openai?.model || 'gpt-4o-mini');
  const [systemPrompt, setSystemPrompt] = useState(openai?.system_prompt || DEFAULT_ANNE_PROMPT_UI);

  // Sincronizar campos quando config carrega de forma assíncrona
  useEffect(() => {
    if (openai) {
      setProvider(openai.provider || 'openai');
      setBaseUrl(openai.base_url || '');
      setModel(openai.model || 'gpt-4o-mini');
      setSystemPrompt(openai.system_prompt || DEFAULT_ANNE_PROMPT_UI);
      // NÃO sincronizar apiKey — nunca é devolvida pelo servidor (segurança)
    }
  }, [openai]);

  const providerInfo = AI_PROVIDER_INFO[provider] || AI_PROVIDER_INFO.custom;

  // Ao trocar provedor: limpar key, ajustar modelo padrão e base_url
  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    setApiKey('');
    const info = AI_PROVIDER_INFO[newProvider] || AI_PROVIDER_INFO.custom;
    setModel(info.defaultModel);
    setBaseUrl('');
  };

  const handleSave = async () => {
    try {
      const update: Record<string, unknown> = {
        openai: {
          model,
          system_prompt: systemPrompt,
          provider,
          base_url: baseUrl,
        } as Record<string, unknown>,
      };
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

  const activeProviderLabel = AI_PROVIDER_INFO[openai?.provider || 'openai']?.label || 'OpenAI';

  return (
    <Card>
      <CardHeader>
        <CardTitle><Bot size={16} /> Anne (IA Assistente)</CardTitle>
        <div className="flex gap-2 items-center">
          <Badge variant={openai?.enabled ? 'success' : 'neutral'}>
            {openai?.enabled ? `Ativa · ${activeProviderLabel}` : 'Inativa'}
          </Badge>
        </div>
      </CardHeader>
      <div className="px-6 pb-6 space-y-4">

        {/* Provedor */}
        <div>
          <label className="label mb-1.5">Provedor de IA</label>
          <select className="input" value={provider} onChange={(e) => handleProviderChange(e.target.value)}>
            {Object.entries(AI_PROVIDER_INFO).map(([key, info]) => (
              <option key={key} value={key}>{info.label}</option>
            ))}
          </select>
          {providerInfo.fixedUrl && (
            <p className="text-xs text-txt-muted mt-1">
              Endpoint: <code className="bg-surface-2 px-1 rounded text-xs">{providerInfo.fixedUrl}</code>
            </p>
          )}
        </div>

        {/* API Key */}
        <Input
          label={`API Key ${providerInfo.label}`}
          type="password"
          placeholder={openai?.has_key && openai?.provider === provider ? `•••• (configurada para ${providerInfo.label})` : providerInfo.keyPlaceholder}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        {openai?.has_key && openai?.provider !== provider && (
          <p className="text-xs text-amber-500 -mt-2">
            ⚠️ A key atual é do provedor <strong>{AI_PROVIDER_INFO[openai.provider || 'openai']?.label}</strong>. Insira uma nova key para trocar.
          </p>
        )}

        {/* URL Base — apenas para custom */}
        {provider === 'custom' && (
          <Input
            label="URL Base da API"
            placeholder="https://meu-provedor.com/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        )}

        {/* Modelo */}
        <Input
          label="Modelo"
          placeholder={providerInfo.modelPlaceholder}
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />

        {/* System Prompt */}
        <div>
          <label className="label mb-1.5">System Prompt (Personalidade da Anne)</label>
          <textarea
            className="input min-h-32 resize-y"
            placeholder={`Você é a Anne, assistente virtual de vendas da loja...\n\nSe deixar vazio, será usado o prompt padrão do VEXX CRM (recomendado para começar).`}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
          <p className="text-xs text-txt-muted mt-1">
            Deixe vazio para usar o prompt padrão rico do VEXX CRM — que já inclui tabela RFM, regras de vendas e identidade da Anne. Personalize apenas se quiser mudar o comportamento.
          </p>
        </div>

        <div className="flex gap-2 pt-2 flex-wrap">
          <Button variant="primary" onClick={handleSave} disabled={isUpdating}>
            <Save size={16} /> {isUpdating ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
          <Link
            href="/configuracoes/anne"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-crm-primary/30 text-crm-primary text-sm font-medium hover:bg-crm-primary/5 transition-colors"
          >
            <Bot size={14} />
            Central de Comando da Anne →
          </Link>
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

  useEffect(() => { fetchLastSync(); }, [fetchLastSync]);

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
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` };
      let page = 1; let hasMore = true;
      while (hasMore && page <= 50) {
        setSyncProgress(`Sincronizando produtos... (página ${page})`);
        const res = await fetch('/api/facilzap/sync', { method: 'POST', headers, body: JSON.stringify({ entity: 'products', page }) });
        const data = await res.json(); if (!res.ok) throw new Error(data.error);
        totals.products += data.results?.products || 0;
        if (data.results?.errors?.length) totals.errors.push(...data.results.errors);
        hasMore = data.results?.hasMore?.products || false; page++;
      }
      page = 1; hasMore = true;
      while (hasMore && page <= 100) {
        setSyncProgress(`Sincronizando clientes... (página ${page})`);
        const res = await fetch('/api/facilzap/sync', { method: 'POST', headers, body: JSON.stringify({ entity: 'clients', page }) });
        const data = await res.json(); if (!res.ok) throw new Error(data.error);
        totals.clients += data.results?.clients || 0;
        if (data.results?.errors?.length) totals.errors.push(...data.results.errors);
        hasMore = data.results?.hasMore?.clients || false; page++;
      }
      page = 1; hasMore = true;
      while (hasMore && page <= 100) {
        setSyncProgress(`Sincronizando pedidos... (página ${page})`);
        try {
          const res = await fetch('/api/facilzap/sync', { method: 'POST', headers, body: JSON.stringify({ entity: 'orders', page }) });
          const data = await res.json();
          if (!res.ok) { totals.errors.push(`Página ${page}: ${data.error}`); if (res.status >= 500) { page++; continue; } throw new Error(data.error); }
          totals.orders += data.results?.orders || 0;
          if (data.results?.errors?.length) totals.errors.push(...data.results.errors);
          hasMore = data.results?.hasMore?.orders || false; page++;
        } catch (err: unknown) { const msg = err instanceof Error ? err.message : 'Erro'; totals.errors.push(`Página ${page}: ${msg}`); break; }
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
