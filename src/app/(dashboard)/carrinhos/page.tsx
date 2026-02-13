'use client';

import { useState, useEffect } from 'react';
import {
  ShoppingCart,
  Bell,
  Clock,
  MessageCircle,
  Settings,
  AlertTriangle,
  Webhook,
  CheckCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';

const STORAGE_KEY = 'vexx-cart-config';

interface CartConfig {
  waitTime: number;
  maxMessages: number;
  recoveryMessage: string;
}

const DEFAULT_CONFIG: CartConfig = {
  waitTime: 30,
  maxMessages: 3,
  recoveryMessage: '',
};

export default function CarrinhosAbandonadosPage() {
  const [config, setConfig] = useState<CartConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Carregar config salva do localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(stored) });
      }
    } catch {
      // Ignorar erros de parse
    }
  }, []);

  const handleSave = () => {
    setSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Erro ao salvar configurações:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-txt-primary">Carrinhos Abandonados</h1>
        <p className="text-sm text-txt-secondary mt-1">
          Recupere vendas perdidas com automações de WhatsApp
        </p>
      </div>

      {/* KPIs placeholder */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <ShoppingCart size={20} className="text-orange-500" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Carrinhos Abandonados</p>
              <p className="text-lg font-bold text-txt-primary">0</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <MessageCircle size={20} className="text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Mensagens Enviadas</p>
              <p className="text-lg font-bold text-txt-primary">0</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <ShoppingCart size={20} className="text-green-500" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Recuperados</p>
              <p className="text-lg font-bold text-txt-primary">0</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <TrendingUpIcon size={20} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Taxa de Recuperação</p>
              <p className="text-lg font-bold text-txt-primary">0%</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Configuração de Webhook */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Webhook size={16} /> Configuração do Webhook
          </CardTitle>
          <Badge variant="neutral">Pendente</Badge>
        </CardHeader>
        <div className="px-6 pb-6 space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <h4 className="text-sm font-medium text-blue-700 flex items-center gap-2">
              <AlertTriangle size={14} /> Como configurar
            </h4>
            <ol className="text-xs text-blue-600 mt-2 space-y-1 list-decimal list-inside">
              <li>No FacilZap, vá em <strong>Configurações → Webhooks</strong></li>
              <li>Crie um novo webhook com o evento <strong>"Carrinho Abandonado"</strong></li>
              <li>Cole a URL abaixo como destino do webhook</li>
              <li>Salve e ative o webhook</li>
            </ol>
          </div>

          <div>
            <label className="label mb-1.5">URL do Webhook (cole no FacilZap)</label>
            <div className="flex gap-2">
              <Input
                value={typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/abandoned-cart` : '/api/webhooks/abandoned-cart'}
                readOnly
                className="font-mono text-xs"
              />
              <Button
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/abandoned-cart`);
                  alert('URL copiada!');
                }}
              >
                Copiar
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label mb-1.5">Tempo de espera (minutos)</label>
              <Input
                type="number"
                placeholder="30"
                value={config.waitTime}
                onChange={(e) => setConfig(prev => ({ ...prev, waitTime: Number(e.target.value) || 30 }))}
              />
              <p className="text-xs text-txt-muted mt-1">
                Tempo após o abandono para enviar a primeira mensagem
              </p>
            </div>
            <div>
              <label className="label mb-1.5">Máx. mensagens por carrinho</label>
              <Input
                type="number"
                placeholder="3"
                value={config.maxMessages}
                onChange={(e) => setConfig(prev => ({ ...prev, maxMessages: Number(e.target.value) || 3 }))}
              />
              <p className="text-xs text-txt-muted mt-1">
                Limite de follow-ups por carrinho abandonado
              </p>
            </div>
          </div>

          <div>
            <label className="label mb-1.5">Mensagem de recuperação</label>
            <textarea
              className="input min-h-24 resize-y"
              placeholder="Olá {{nome}}! 😊 Vi que você deixou alguns itens no carrinho. Posso te ajudar com algo? Os produtos ainda estão disponíveis e separados para você!"
              value={config.recoveryMessage}
              onChange={(e) => setConfig(prev => ({ ...prev, recoveryMessage: e.target.value }))}
            />
            <p className="text-xs text-txt-muted mt-1">
              Use {'{{nome}}'}, {'{{produtos}}'}, {'{{total}}'} como variáveis dinâmicas
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              <Settings size={16} /> {saving ? 'Salvando...' : 'Salvar Configurações'}
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-green-600 font-medium animate-in fade-in">
                <CheckCircle size={16} /> Configurações salvas com sucesso!
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* Lista de carrinhos (vazia por enquanto) */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Clock size={16} /> Carrinhos Recentes
          </CardTitle>
        </CardHeader>
        <div className="px-6 pb-6">
          <div className="text-center py-12">
            <ShoppingCart size={32} className="mx-auto text-txt-secondary mb-3" />
            <p className="text-txt-secondary">Nenhum carrinho abandonado ainda</p>
            <p className="text-xs text-txt-muted mt-1">
              Configure o webhook acima para começar a rastrear carrinhos abandonados
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function TrendingUpIcon({ size, className }: { size: number; className: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline>
      <polyline points="16 7 22 7 22 13"></polyline>
    </svg>
  );
}
