'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useRef } from 'react';
import {
  ArrowLeft,
  Phone,
  Mail,
  Calendar,
  Edit2,
  MessageSquare,
  Send,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShoppingBag,
  Tag,
  TrendingUp,
  Star,
  MapPin,
  User,
  CreditCard,
  Truck,
  Package,
  Hash,
  Sparkles,
  Image as ImageIcon,
  Ticket,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from 'lucide-react';
import { useAnne } from '@/hooks/useAnne';
import { useClient } from '@/hooks/useClients';
import { OrderHistory } from '@/components/crm/OrderHistory';
import { CustomerHealthPanel } from '@/components/crm/CustomerHealthPanel';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate, formatRelativeTime, getInitials, getAvatarColor } from '@/lib/utils';
import { MaskedField } from '@/lib/privacy';

const STATUS_MAP: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  novo: { label: 'Novo', variant: 'info' },
  ativo: { label: 'Ativo', variant: 'success' },
  active: { label: 'Ativo', variant: 'success' },
  vip: { label: 'VIP', variant: 'warning' },
  risco: { label: 'Em risco', variant: 'danger' },
  inativo: { label: 'Inativo', variant: 'neutral' },
  inactive: { label: 'Inativo', variant: 'neutral' },
  blocked: { label: 'Bloqueado', variant: 'danger' },
};

export default function ClienteDetalhe() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;
  const { data: clientData, isLoading } = useClient(clientId);

  // Modal de envio de mensagem
  const [showMsgModal, setShowMsgModal] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; text: string } | null>(null);
  const msgRef = useRef<HTMLTextAreaElement>(null);

  // Anne IA
  const { sendMessage: askAnne, isLoading: isAnneLoading } = useAnne();

  // Imagem/mídia
  const [showMediaInput, setShowMediaInput] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');

  // Cupom
  const [showCouponInput, setShowCouponInput] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponFooter, setCouponFooter] = useState('');
  const [couponCopied, setCouponCopied] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-surface-200 rounded w-48 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-surface-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-64 bg-surface-200 rounded-xl animate-pulse" />
          <div className="h-64 bg-surface-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!clientData) {
    return (
      <div className="text-center py-20">
        <User size={48} className="mx-auto text-txt-secondary mb-4" />
        <p className="text-txt-secondary">Cliente não encontrado</p>
        <Button variant="ghost" onClick={() => router.back()} className="mt-4">
          <ArrowLeft size={16} /> Voltar
        </Button>
      </div>
    );
  }

  // Dados do cliente (flexíveis para campos do DB vs TypeScript)
  const c = clientData as any;
  const orders = c.recent_orders || [];
  const custom = c.custom_fields || {};
  const status = STATUS_MAP[c.status] || { label: c.status || 'Ativo', variant: 'success' as const };

  // KPIs calculados dos pedidos reais
  const totalOrders = c.total_orders || c.total_pedidos || orders.length;
  const ltv = Number(c.ltv) || orders.reduce((sum: number, o: any) => sum + (Number(o.total) || 0), 0);
  const avgTicket = Number(c.avg_ticket) || Number(c.ticket_medio) || (totalOrders > 0 ? ltv / totalOrders : 0);
  const lastOrderAt = c.last_order_at || c.ultima_compra || (orders.length > 0 ? orders[0].created_at : null);

  // Análise de formas de pagamento (dos pedidos do metadata)
  const paymentMethods: Record<string, number> = {};
  const deliveryMethods: Record<string, number> = {};
  orders.forEach((o: any) => {
    const meta = typeof o.metadata === 'string' ? (() => { try { return JSON.parse(o.metadata); } catch { return {}; } })() : (o.metadata || {});
    const pm = o.payment_method
      ? (typeof o.payment_method === 'object' ? (o.payment_method.nome || o.payment_method.forma || '') : String(o.payment_method))
      : '';
    if (pm) paymentMethods[pm] = (paymentMethods[pm] || 0) + 1;
    const de = meta.forma_entrega
      ? (typeof meta.forma_entrega === 'object' ? (meta.forma_entrega.nome || '') : String(meta.forma_entrega))
      : '';
    if (de) deliveryMethods[de] = (deliveryMethods[de] || 0) + 1;
  });

  // Endereço formatado - tentar vários fontes
  const fullAddress = (() => {
    // 1. Campos diretos do banco (address_*)
    const addressParts = [c.address_street, c.address_number, c.address_complement, c.address_neighborhood, c.address_city, c.address_state, c.address_zip].filter(Boolean);
    if (addressParts.length > 0) return addressParts.join(', ');

    // 2. Tentar extrair de demais_dados (pode ser JSON ou texto)
    const dd = custom.demais_dados || c.demais_dados;
    if (dd) {
      if (typeof dd === 'string') {
        // Pode ser JSON
        try {
          const parsed = JSON.parse(dd);
          const ddParts = [parsed.endereco || parsed.rua || parsed.logradouro, parsed.numero, parsed.complemento, parsed.bairro, parsed.cidade, parsed.estado || parsed.uf, parsed.cep].filter(Boolean);
          if (ddParts.length > 0) return ddParts.join(', ');
        } catch {
          // Texto livre — se tiver algo útil (endereço, CEP etc.)
          if (dd.length > 5 && dd.length < 500) return dd;
        }
      } else if (typeof dd === 'object') {
        const ddParts = [dd.endereco || dd.rua || dd.logradouro, dd.numero, dd.complemento, dd.bairro, dd.cidade, dd.estado || dd.uf, dd.cep].filter(Boolean);
        if (ddParts.length > 0) return ddParts.join(', ');
      }
    }

    // 3. Endereço do metadata dos pedidos (último pedido)
    if (orders.length > 0) {
      for (const o of orders) {
        const meta = typeof o.metadata === 'string' ? (() => { try { return JSON.parse(o.metadata); } catch { return {}; } })() : (o.metadata || {});
        const addr = meta.endereco_entrega || meta.endereco;
        if (addr && typeof addr === 'string') return addr;
        if (addr && typeof addr === 'object') {
          const parts = [addr.logradouro || addr.rua || addr.endereco, addr.numero, addr.complemento, addr.bairro, addr.cidade, addr.estado || addr.uf, addr.cep].filter(Boolean);
          if (parts.length > 0) return parts.join(', ');
        }
      }
    }

    return null;
  })();

  // CPF/CNPJ, data nascimento
  const cpfCnpj = (() => { const v = custom.cpf_cnpj || c.cpf || null; return v && typeof v === 'object' ? JSON.stringify(v) : v; })();
  const dataNascimento = (() => { const v = custom.data_nascimento || c.birthday || null; return v && typeof v === 'object' ? JSON.stringify(v) : v; })();
  const origem = (() => { const v = custom.origem || c.source || c.origem || null; return v && typeof v === 'object' ? (v.nome || v.name || JSON.stringify(v)) : v; })();

  // Tags
  const tags = Array.isArray(c.tags) ? c.tags : [];

  // Envio de mensagem WhatsApp
  const openMsgModal = () => {
    const firstName = (c.name || '').split(' ')[0];
    setMsgText(`Olá, ${firstName}! 👋 Tudo bem? Entrei em contato para te dar uma novidade especial. Posso te ajudar?`);
    setSendResult(null);
    setShowMediaInput(false);
    setMediaUrl('');
    setShowCouponInput(false);
    setCouponCode('');
    setCouponFooter('');
    setCouponCopied(false);
    setShowMsgModal(true);
    setTimeout(() => msgRef.current?.focus(), 100);
  };

  // Anne sugere mensagem personalizada para este cliente
  const handleAnneSuggest = async () => {
    try {
      const result = await askAnne({
        message: `Analise este cliente e crie UMA mensagem de WhatsApp personalizada e persuasiva para enviar agora. Considere o histórico de compras, LTV, segmento RFM e última compra. Escreva APENAS a mensagem, sem título, sem explicação, sem aspas. Use emojis com moderação. Máximo 300 caracteres.`,
        context: { client_id: c.id },
      });
      if (result?.reply) {
        setMsgText(result.reply.trim());
        setTimeout(() => msgRef.current?.focus(), 100);
      }
    } catch {
      // silencioso — mantém texto atual
    }
  };

  const handleSendMsg = async () => {
    if (!msgText.trim() || !c.phone) return;
    setIsSending(true);
    setSendResult(null);
    try {
      // Determina o tipo e body baseado nos toggles ativos
      let body: Record<string, unknown>;

      if (showCouponInput && couponCode.trim()) {
        // copy_code: botão de cópia de cupom
        body = {
          to: c.phone,
          content: msgText.trim(),
          type: 'copy_code',
          copyCode: couponCode.trim(),
          copyCodeFooter: couponFooter.trim() || undefined,
          clientId: c.id,
        };
      } else if (showMediaInput && mediaUrl.trim()) {
        // image com caption
        body = {
          to: c.phone,
          content: msgText.trim(),   // caption
          type: 'image',
          mediaUrl: mediaUrl.trim(),
          clientId: c.id,
        };
      } else {
        // texto simples
        body = {
          to: c.phone,
          content: msgText.trim(),
          type: 'text',
          clientId: c.id,
        };
      }

      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar');
      setSendResult({ ok: true, text: '✅ Mensagem enviada com sucesso!' });
    } catch (err) {
      setSendResult({ ok: false, text: `❌ ${err instanceof Error ? err.message : 'Erro ao enviar'}` });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-surface-100 text-txt-secondary transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
            style={{ backgroundColor: getAvatarColor(c.id) }}
          >
            {getInitials(c.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-txt-primary truncate">{c.name}</h1>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-txt-secondary">
              <span className="flex items-center gap-1"><Phone size={14} /> {c.phone}</span>
              {c.email && <span className="flex items-center gap-1"><Mail size={14} /> {c.email}</span>}
            </div>
          </div>
        </div>
        <Button variant="secondary">
          <Edit2 size={16} /> Editar
        </Button>
        <Button variant="primary" onClick={openMsgModal} disabled={!c.phone}>
          <MessageSquare size={16} /> Mensagem
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-crm-primary/10 flex items-center justify-center">
              <TrendingUp size={20} className="text-crm-primary" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">LTV</p>
              <p className="text-lg font-bold text-crm-primary">{formatCurrency(ltv)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
              <Star size={20} className="text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Ticket Médio</p>
              <p className="text-lg font-bold text-txt-primary">{formatCurrency(avgTicket)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <ShoppingBag size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Total Pedidos</p>
              <p className="text-lg font-bold text-txt-primary">{totalOrders}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Calendar size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Última Compra</p>
              <p className="text-lg font-bold text-txt-primary">
                {lastOrderAt ? formatRelativeTime(lastOrderAt) : '—'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna principal (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Dados Pessoais */}
          <Card>
            <CardHeader>
              <CardTitle><User size={16} /> Dados Pessoais</CardTitle>
            </CardHeader>
            <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-txt-secondary mb-1">Telefone</p>
                <p className="text-sm font-medium text-txt-primary flex items-center gap-1">
                  <Phone size={14} className="text-txt-secondary" />
                  <MaskedField value={c.phone} type="phone" copyable />
                </p>
              </div>
              {c.email && (
                <div>
                  <p className="text-xs text-txt-secondary mb-1">E-mail</p>
                  <p className="text-sm font-medium text-txt-primary flex items-center gap-1">
                    <Mail size={14} className="text-txt-secondary" />
                    <MaskedField value={c.email} type="email" copyable />
                  </p>
                </div>
              )}
              {cpfCnpj && (
                <div>
                  <p className="text-xs text-txt-secondary mb-1">CPF/CNPJ</p>
                  <p className="text-sm font-medium text-txt-primary flex items-center gap-1">
                    <Hash size={14} className="text-txt-secondary" />
                    <MaskedField value={cpfCnpj} type="cpf" copyable />
                  </p>
                </div>
              )}
              {dataNascimento && (
                <div>
                  <p className="text-xs text-txt-secondary mb-1">Data de Nascimento</p>
                  <p className="text-sm font-medium text-txt-primary flex items-center gap-1">
                    <Calendar size={14} className="text-txt-secondary" /> {dataNascimento}
                  </p>
                </div>
              )}
              {origem && (
                <div>
                  <p className="text-xs text-txt-secondary mb-1">Origem</p>
                  <p className="text-sm font-medium text-txt-primary">{origem}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-txt-secondary mb-1">Cliente desde</p>
                <p className="text-sm font-medium text-txt-primary flex items-center gap-1">
                  <Calendar size={14} className="text-txt-secondary" /> {formatDate(c.created_at)}
                </p>
              </div>
            </div>
          </Card>

          {/* Endereço */}
          {fullAddress && (
            <Card>
              <CardHeader>
                <CardTitle><MapPin size={16} /> Endereço</CardTitle>
              </CardHeader>
              <div className="p-4 pt-0">
                <p className="text-sm text-txt-primary">{fullAddress}</p>
              </div>
            </Card>
          )}

          {/* Histórico de Pedidos */}
          <Card>
            <CardHeader>
              <CardTitle>
                <ShoppingBag size={16} /> Histórico de Pedidos ({orders.length})
              </CardTitle>
            </CardHeader>
            <div className="p-4 pt-0">
              <OrderHistory orders={orders} />
            </div>
          </Card>

          {/* Notas */}
          {(c.notes || c.notas) && (
            <Card>
              <CardHeader>
                <CardTitle>Notas</CardTitle>
              </CardHeader>
              <div className="p-4 pt-0">
                <p className="text-sm text-txt-secondary whitespace-pre-wrap">
                  {typeof (c.notes || c.notas) === 'object' ? JSON.stringify(c.notes || c.notas) : (c.notes || c.notas)}
                </p>
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar (1/3) */}
        <div className="space-y-6">
          {/* Saúde do Cliente (Sentinela) */}
          <CustomerHealthPanel clientId={clientId} />

          {/* Preferências de Pagamento */}
          {Object.keys(paymentMethods).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle><CreditCard size={16} /> Formas de Pagamento</CardTitle>
              </CardHeader>
              <div className="p-4 pt-0 space-y-2">
                {Object.entries(paymentMethods)
                  .sort(([, a], [, b]) => b - a)
                  .map(([method, count]) => (
                    <div key={method} className="flex items-center justify-between">
                      <span className="text-sm text-txt-primary">{method}</span>
                      <span className="text-xs text-txt-secondary bg-surface-100 px-2 py-0.5 rounded-full">
                        {count}x
                      </span>
                    </div>
                  ))}
              </div>
            </Card>
          )}

          {/* Preferências de Entrega */}
          {Object.keys(deliveryMethods).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle><Truck size={16} /> Formas de Entrega</CardTitle>
              </CardHeader>
              <div className="p-4 pt-0 space-y-2">
                {Object.entries(deliveryMethods)
                  .sort(([, a], [, b]) => b - a)
                  .map(([method, count]) => (
                    <div key={method} className="flex items-center justify-between">
                      <span className="text-sm text-txt-primary">{method}</span>
                      <span className="text-xs text-txt-secondary bg-surface-100 px-2 py-0.5 rounded-full">
                        {count}x
                      </span>
                    </div>
                  ))}
              </div>
            </Card>
          )}

          {/* Tags */}
          <Card>
            <CardHeader>
              <CardTitle><Tag size={16} /> Tags</CardTitle>
            </CardHeader>
            <div className="p-4 pt-0">
              {tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag: string) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 bg-crm-primary/10 text-crm-primary text-xs rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-txt-secondary">Nenhuma tag</p>
              )}
            </div>
          </Card>

          {/* Detalhes Extras (custom_fields) */}
          {custom.grupos && (
            <Card>
              <CardHeader>
                <CardTitle>Grupos</CardTitle>
              </CardHeader>
              <div className="p-4 pt-0">
                <p className="text-sm text-txt-primary">
                  {Array.isArray(custom.grupos)
                    ? custom.grupos.map((g: any) => typeof g === 'object' ? g.nome || JSON.stringify(g) : g).join(', ')
                    : String(custom.grupos)}
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* ── Modal de Envio de Mensagem WhatsApp ──────────────── */}
      {showMsgModal && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
            onClick={() => !isSending && !isAnneLoading && setShowMsgModal(false)}
          />
          <div className="fixed inset-0 z-51 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden pointer-events-auto animate-in zoom-in-95 duration-200">

              {/* Header */}
              <div className="px-5 py-4 bg-linear-to-r from-green-600 to-emerald-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                    <MessageSquare size={16} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Enviar Mensagem</h3>
                    <p className="text-[11px] text-white/70">
                      {c.name} · {c.phone}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowMsgModal(false)}
                  disabled={isSending || isAnneLoading}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X size={16} className="text-white" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4">

                {/* ── Anne IA ───────────────────────── */}
                <div className="bg-linear-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-xl p-3 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles size={14} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-violet-800">Anne IA</p>
                    <p className="text-[11px] text-violet-600 leading-snug mt-0.5">
                      Analisa o histórico deste cliente (LTV, pedidos, segmento) e sugere uma mensagem personalizada.
                    </p>
                  </div>
                  <button
                    onClick={handleAnneSuggest}
                    disabled={isAnneLoading || isSending}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    {isAnneLoading ? (
                      <><Loader2 size={11} className="animate-spin" /> Gerando...</>
                    ) : (
                      <><Sparkles size={11} /> Sugerir</>
                    )}
                  </button>
                </div>

                {/* ── Textarea (mensagem / caption) ── */}
                <div>
                  <label className="text-xs font-semibold text-txt-secondary block mb-1.5">
                    {showMediaInput && mediaUrl.trim() ? 'Legenda da imagem' : 'Mensagem'}
                  </label>
                  <textarea
                    ref={msgRef}
                    value={msgText}
                    onChange={e => setMsgText(e.target.value)}
                    rows={4}
                    disabled={isSending || isAnneLoading}
                    className="w-full border border-surface-border rounded-xl px-3 py-2.5 text-sm text-txt-primary resize-none focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 disabled:opacity-60"
                    placeholder={showMediaInput && mediaUrl.trim() ? 'Legenda para a imagem...' : 'Digite sua mensagem...'}
                  />
                  <p className="text-[10px] text-txt-muted mt-1 text-right">{msgText.length} caracteres</p>
                </div>

                {/* ── Toggle: Imagem ─────────────────── */}
                <div className="border border-surface-border rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => { setShowMediaInput(v => !v); if (!showMediaInput) setShowCouponInput(false); }}
                    disabled={isSending || isAnneLoading}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-surface-50 hover:bg-surface-100 transition-colors text-sm disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2 font-medium text-txt-primary">
                      <ImageIcon size={14} className="text-blue-500" />
                      Enviar com imagem
                    </span>
                    {showMediaInput
                      ? <ChevronUp size={14} className="text-txt-muted" />
                      : <ChevronDown size={14} className="text-txt-muted" />}
                  </button>
                  {showMediaInput && (
                    <div className="px-4 pb-3 pt-2 space-y-2 border-t border-surface-border bg-white">
                      <label className="text-[11px] font-semibold text-txt-secondary">URL da imagem</label>
                      <input
                        type="url"
                        value={mediaUrl}
                        onChange={e => setMediaUrl(e.target.value)}
                        disabled={isSending}
                        placeholder="https://exemplo.com/imagem.jpg"
                        className="w-full border border-surface-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:opacity-60"
                      />
                      {mediaUrl.trim() && (
                        <p className="text-[10px] text-blue-600 flex items-center gap-1">
                          <ImageIcon size={10} /> A imagem será enviada com a legenda acima.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Toggle: Cupom ──────────────────── */}
                <div className="border border-surface-border rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => { setShowCouponInput(v => !v); if (!showCouponInput) setShowMediaInput(false); }}
                    disabled={isSending || isAnneLoading}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-surface-50 hover:bg-surface-100 transition-colors text-sm disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2 font-medium text-txt-primary">
                      <Ticket size={14} className="text-amber-500" />
                      Adicionar cupom
                    </span>
                    {showCouponInput
                      ? <ChevronUp size={14} className="text-txt-muted" />
                      : <ChevronDown size={14} className="text-txt-muted" />}
                  </button>
                  {showCouponInput && (
                    <div className="px-4 pb-3 pt-2 space-y-3 border-t border-surface-border bg-white">
                      <div>
                        <label className="text-[11px] font-semibold text-txt-secondary block mb-1">Código do cupom</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={couponCode}
                            onChange={e => setCouponCode(e.target.value.toUpperCase())}
                            disabled={isSending}
                            placeholder="EX: VOLTA10"
                            className="flex-1 border border-surface-border rounded-lg px-3 py-2 text-sm font-mono uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 disabled:opacity-60"
                          />
                          {couponCode.trim() && (
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(couponCode.trim());
                                setCouponCopied(true);
                                setTimeout(() => setCouponCopied(false), 2000);
                              }}
                              className="p-2 border border-surface-border rounded-lg hover:bg-surface-50 transition-colors"
                              title="Copiar código"
                            >
                              {couponCopied
                                ? <Check size={14} className="text-green-600" />
                                : <Copy size={14} className="text-txt-muted" />}
                            </button>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-txt-secondary block mb-1">Rodapé (validade, etc.)</label>
                        <input
                          type="text"
                          value={couponFooter}
                          onChange={e => setCouponFooter(e.target.value)}
                          disabled={isSending}
                          placeholder="Ex: Válido até 30/06 · Compras acima de R$ 50"
                          className="w-full border border-surface-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 disabled:opacity-60"
                        />
                      </div>
                      {couponCode.trim() && (
                        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          🎟 O cliente receberá um botão <strong>Copiar código</strong> com o código <strong>{couponCode}</strong>.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Resultado do envio */}
                {sendResult && (
                  <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${
                    sendResult.ok
                      ? 'bg-green-50 border border-green-200 text-green-800'
                      : 'bg-red-50 border border-red-200 text-red-800'
                  }`}>
                    {sendResult.ok
                      ? <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                      : <AlertCircle size={16} className="text-red-600 shrink-0" />}
                    {sendResult.text}
                  </div>
                )}

                {/* Ações */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setShowMsgModal(false)}
                    disabled={isSending || isAnneLoading}
                    className="flex-1 py-2.5 rounded-xl border border-surface-border text-sm font-medium text-txt-secondary hover:bg-surface-50 transition-colors disabled:opacity-50"
                  >
                    {sendResult?.ok ? 'Fechar' : 'Cancelar'}
                  </button>
                  {!sendResult?.ok && (
                    <button
                      onClick={handleSendMsg}
                      disabled={isSending || isAnneLoading || !msgText.trim() || (showMediaInput && !mediaUrl.trim())}
                      className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSending ? (
                        <><Loader2 size={14} className="animate-spin" /> Enviando...</>
                      ) : showCouponInput && couponCode.trim() ? (
                        <><Ticket size={14} /> Enviar com cupom</>
                      ) : showMediaInput && mediaUrl.trim() ? (
                        <><ImageIcon size={14} /> Enviar imagem</>
                      ) : (
                        <><Send size={14} /> Enviar WhatsApp</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
