/**
 * GET  /api/meta/leads — Verificação do webhook pelo Meta (hub challenge)
 * POST /api/meta/leads — Recebimento de leads + mensagens Instagram Direct
 *
 * Configurar no Meta for Developers:
 *   Webhook URL: https://seu-dominio.netlify.app/api/meta/leads
 *   Verify Token: valor de META_VERIFY_TOKEN no Netlify
 *   Eventos: leadgen, messages (para Instagram)
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase';

/* ─── GET — Verificação do webhook (Meta faz isso uma vez ao configurar) ───── */

export async function GET(req: NextRequest) {
  const mode      = req.nextUrl.searchParams.get('hub.mode');
  const token     = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    console.log('[Meta Webhook] Verificação OK');
    return new Response(challenge ?? '', { status: 200 });
  }

  console.warn('[Meta Webhook] Verificação falhou — token inválido');
  return new Response('Forbidden', { status: 403 });
}

/* ─── POST — Recebimento de eventos ────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const body = await req.text();

  // Validar assinatura HMAC — segurança obrigatória
  const signature = req.headers.get('x-hub-signature-256') || '';
  const secret    = process.env.META_APP_SECRET;

  if (secret) {
    const hmac     = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const expected = `sha256=${hmac}`;
    if (expected !== signature) {
      console.error('[Meta Webhook] Assinatura inválida — possível ataque');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  const payload = JSON.parse(body) as {
    object: string;
    entry: Array<{
      id: string;
      changes?: Array<{ field: string; value: unknown }>;
      messaging?: Array<{
        sender: { id: string };
        recipient: { id: string };
        timestamp: number;
        message?: { mid: string; text?: string; is_echo?: boolean };
      }>;
    }>;
  };

  for (const entry of payload.entry || []) {
    // ─── Leads de formulário (Facebook/Instagram Ads) ─────────────────────
    for (const change of entry.changes || []) {
      if (change.field === 'leadgen') {
        await processarLeadMeta(change.value as LeadgenValue).catch((err) =>
          console.error('[Meta Webhook] Erro ao processar lead:', err)
        );
      }

      // ─── Mensagens Instagram Direct ───────────────────────────────────
      if (change.field === 'messages' && payload.object === 'instagram') {
        const value = change.value as { messaging?: InstagramMessaging[] };
        for (const msg of value.messaging || []) {
          await processarMensagemInstagram(msg, entry.id).catch((err) =>
            console.error('[Meta Webhook] Erro ao processar Instagram DM:', err)
          );
        }
      }
    }

    // Formato alternativo do Instagram (entry.messaging direto)
    if (payload.object === 'instagram') {
      for (const msg of entry.messaging || []) {
        await processarMensagemInstagram(msg, entry.id).catch((err) =>
          console.error('[Meta Webhook] Erro Instagram DM:', err)
        );
      }
    }
  }

  return NextResponse.json({ status: 'ok' });
}

/* ─── Tipos internos ────────────────────────────────────────────────────────── */

interface LeadgenValue {
  leadgen_id: string;
  ad_id: string;
  campaign_id: string;
  adset_id: string;
  form_id: string;
  page_id: string;
  created_time: number;
}

interface InstagramMessaging {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: { mid: string; text?: string; is_echo?: boolean };
}

/* ─── Processar lead de formulário do Meta Ads ─────────────────────────────── */

async function processarLeadMeta(leadData: LeadgenValue): Promise<void> {
  const pageToken = process.env.META_PAGE_TOKEN;
  if (!pageToken) {
    console.warn('[Meta Leads] META_PAGE_TOKEN não configurado');
    return;
  }

  // Buscar dados completos do lead via Graph API
  const leadRes = await fetch(
    `https://graph.facebook.com/v23.0/${leadData.leadgen_id}` +
    `?fields=field_data,created_time&access_token=${pageToken}`
  );

  if (!leadRes.ok) {
    console.error('[Meta Leads] Erro ao buscar lead:', await leadRes.text());
    return;
  }

  const lead = await leadRes.json() as {
    field_data?: Array<{ name: string; values: string[] }>;
  };

  // Extrair campos do formulário (normaliza nomes em PT/EN)
  const campos: Record<string, string> = {};
  for (const campo of lead.field_data || []) {
    campos[campo.name] = campo.values?.[0] || '';
  }

  const phone = normalizarTelefone(
    campos['phone_number'] || campos['telefone'] || campos['phone'] || ''
  );
  const nome  = campos['full_name'] || campos['nome'] || campos['first_name'] || 'Lead Meta Ads';
  const email = campos['email'] || null;

  const supabase = createServerSupabaseClient();

  // Encontrar tenant pelo page_id
  const tenantId = await resolverTenant(supabase, leadData.page_id);

  if (!tenantId) {
    console.warn('[Meta Leads] Tenant não encontrado para page_id:', leadData.page_id);
    return;
  }

  // Upsert do contato
  if (phone) {
    await supabase.from('contacts').upsert(
      {
        tenant_id: tenantId,
        phone,
        name: nome,
        email,
        tags: ['meta-ads'],
        canal: 'meta_leads',
      },
      { onConflict: 'phone,tenant_id' }
    );
  }

  // Criar card no kanban — coluna "novo_lead_meta"
  await supabase.from('kanban_cards').insert({
    tenant_id: tenantId,
    contact_phone: phone,
    contact_name: nome,
    contact_email: email || '',
    column_id: 'novo_lead_meta',
    labels: ['meta-ads'],
    metadata: {
      origem: 'meta_ads',
      campaign_id: leadData.campaign_id,
      ad_id: leadData.ad_id,
      form_id: leadData.form_id,
      campos_raw: campos,
    },
  });

  console.log(`[Meta Leads] Lead processado: ${nome} (${phone})`);
}

/* ─── Processar mensagem Instagram Direct ──────────────────────────────────── */

async function processarMensagemInstagram(
  messaging: InstagramMessaging,
  pageId: string,
): Promise<void> {
  if (messaging.message?.is_echo) return; // ignorar mensagens enviadas pela conta

  const text      = messaging.message?.text;
  const messageId = messaging.message?.mid;
  const senderId  = messaging.sender.id;

  if (!text || !messageId) return;

  const pageToken = process.env.META_PAGE_TOKEN;
  if (!pageToken) return;

  // Buscar nome + foto do remetente
  const profileRes = await fetch(
    `https://graph.facebook.com/v23.0/${senderId}` +
    `?fields=name,profile_pic&access_token=${pageToken}`
  );
  const profile = profileRes.ok
    ? await profileRes.json() as { name?: string; profile_pic?: string }
    : {};

  const supabase = createServerSupabaseClient();
  const tenantId = await resolverTenant(supabase, pageId);
  if (!tenantId) return;

  // Salvar mensagem com canal 'instagram'
  await supabase.from('messages').upsert(
    {
      tenant_id:    tenantId,
      external_id:  messageId,
      canal:        'instagram',
      sender_id:    senderId,
      sender_name:  profile.name || 'Usuário Instagram',
      content:      text,
      direction:    'inbound',
      type:         'text',
    },
    { onConflict: 'external_id' }
  );

  // TODO: Anne responde via Instagram Messaging API
  // Quando estiver pronto, integrar com anne.service.ts e enviar via:
  // POST https://graph.facebook.com/v23.0/me/messages?access_token=${pageToken}
  // { recipient: { id: senderId }, message: { text: reply } }

  console.log(`[Instagram DM] Mensagem de ${profile.name || senderId}: "${text.substring(0, 50)}"`);
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

async function resolverTenant(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  pageId: string,
): Promise<string | null> {
  // Procurar tenant pelo meta_page_id configurado
  const { data } = await supabase
    .from('ai_provider_config')
    .select('tenant_id')
    .eq('meta_page_id', pageId)
    .single();

  if (data?.tenant_id) return data.tenant_id;

  // Fallback: pegar o primeiro tenant com Meta configurado
  const { data: fallback } = await supabase
    .from('ai_provider_config')
    .select('tenant_id')
    .not('meta_access_token', 'is', null)
    .limit(1)
    .single();

  return fallback?.tenant_id || null;
}

function normalizarTelefone(tel: string): string {
  if (!tel) return '';
  const digits = tel.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 11 || digits.length === 10) return `55${digits}`;
  return digits;
}
