/**
 * Meta Conversions API (CAPI) — envia eventos de servidor para o pixel do Meta.
 *
 * Por que isso importa:
 *   - Cada lead que entra no kanban deve disparar evento Lead para o pixel
 *   - Cada compra confirmada deve disparar Purchase
 *   - Sem esses eventos o algoritmo do Meta entrega anúncios para as
 *     pessoas erradas → CPL mais alto, ROAS mais baixo
 *   - Impacto estimado de 30-50% na eficiência das campanhas
 *
 * Documentação: https://developers.facebook.com/docs/marketing-api/conversions-api
 */

import crypto from 'crypto';
import { META_BASE } from '@/lib/meta-config';

/* ─── Tipos ───────────────────────────────────────────────────────────────── */

export interface CapiUserData {
  email?: string;     // será hasheado com SHA-256
  phone?: string;     // será hasheado com SHA-256
  client_ip_address?: string;
  client_user_agent?: string;
  fbc?: string;       // Facebook click ID (cookie _fbc)
  fbp?: string;       // Facebook browser ID (cookie _fbp)
}

export interface CapiEventoLead {
  type: 'Lead';
  event_time?: number;       // unix timestamp — padrão: agora
  event_source_url?: string;
  user_data: CapiUserData;
  custom_data?: {
    lead_id?: string;
    campaign_id?: string;
    form_id?: string;
  };
}

export interface CapiEventoCompra {
  type: 'Purchase';
  event_time?: number;
  event_source_url?: string;
  user_data: CapiUserData;
  custom_data: {
    value: number;   // em BRL
    currency: 'BRL';
    order_id?: string;
    content_name?: string;
  };
}

export type CapiEvento = CapiEventoLead | CapiEventoCompra;

interface CapiConfig {
  pixelId: string;
  accessToken: string;
}

/* ─── Helper: hash SHA-256 normalizado ───────────────────────────────────── */

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function hashPhone(phone: string): string {
  // Remove não-dígitos, garante formato E.164 sem +
  const digits = phone.replace(/\D/g, '');
  return sha256(digits);
}

/* ─── Enviar evento(s) para a CAPI ───────────────────────────────────────── */

/**
 * Envia um ou mais eventos para o pixel do Meta via Conversions API.
 * Falha silenciosamente com log — nunca deve bloquear o fluxo principal.
 */
export async function enviarEventoCapi(
  config: CapiConfig,
  eventos: CapiEvento | CapiEvento[],
): Promise<void> {
  const lista = Array.isArray(eventos) ? eventos : [eventos];

  const data = lista.map((ev) => {
    const userData: Record<string, string> = {};
    if (ev.user_data.email) userData.em = sha256(ev.user_data.email);
    if (ev.user_data.phone) userData.ph = hashPhone(ev.user_data.phone);
    if (ev.user_data.client_ip_address) userData.client_ip_address = ev.user_data.client_ip_address;
    if (ev.user_data.client_user_agent) userData.client_user_agent = ev.user_data.client_user_agent;
    if (ev.user_data.fbc) userData.fbc = ev.user_data.fbc;
    if (ev.user_data.fbp) userData.fbp = ev.user_data.fbp;

    const event: Record<string, unknown> = {
      event_name:       ev.type,
      event_time:       ev.event_time || Math.floor(Date.now() / 1000),
      action_source:    'website',
      user_data:        userData,
    };

    if (ev.event_source_url) event.event_source_url = ev.event_source_url;
    if (ev.type === 'Purchase') event.custom_data = ev.custom_data;
    if (ev.type === 'Lead' && ev.custom_data) event.custom_data = ev.custom_data;

    return event;
  });

  try {
    const res = await fetch(
      `${META_BASE}/${config.pixelId}/events?access_token=${config.accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      console.error('[CAPI] Erro ao enviar evento:', err.error?.message || res.status);
    } else {
      const result = await res.json() as { events_received?: number };
      console.log(`[CAPI] ${result.events_received || lista.length} evento(s) enviado(s) — pixel ${config.pixelId}`);
    }
  } catch (err) {
    // CAPI nunca deve quebrar o fluxo principal
    console.error('[CAPI] Falha de rede ao enviar evento:', String(err));
  }
}

/**
 * Atalho: dispara evento Lead para um novo lead do Meta Ads.
 * Chamar dentro de processarLeadMeta() após salvar no banco.
 */
export async function dispararLeadCapi(
  pixelId: string,
  accessToken: string,
  dados: {
    email?: string;
    phone?: string;
    leadId?: string;
    campaignId?: string;
    formId?: string;
    sourceUrl?: string;
    clientIp?: string;
    userAgent?: string;
  }
): Promise<void> {
  if (!pixelId || !accessToken) return;
  await enviarEventoCapi(
    { pixelId, accessToken },
    {
      type: 'Lead',
      event_source_url: dados.sourceUrl,
      user_data: {
        email: dados.email,
        phone: dados.phone,
        client_ip_address: dados.clientIp,
        client_user_agent: dados.userAgent,
      },
      custom_data: {
        lead_id: dados.leadId,
        campaign_id: dados.campaignId,
        form_id: dados.formId,
      },
    }
  );
}

/**
 * Atalho: dispara evento Purchase (pedido confirmado).
 * Chamar quando um pedido for marcado como pago.
 */
export async function dispararCompraCapi(
  pixelId: string,
  accessToken: string,
  dados: {
    email?: string;
    phone?: string;
    valorBrl: number;
    orderId?: string;
    produto?: string;
    sourceUrl?: string;
  }
): Promise<void> {
  if (!pixelId || !accessToken) return;
  await enviarEventoCapi(
    { pixelId, accessToken },
    {
      type: 'Purchase',
      event_source_url: dados.sourceUrl,
      user_data: {
        email: dados.email,
        phone: dados.phone,
      },
      custom_data: {
        value: dados.valorBrl,
        currency: 'BRL',
        order_id: dados.orderId,
        content_name: dados.produto,
      },
    }
  );
}
