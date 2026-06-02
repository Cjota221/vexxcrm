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
import { META_BASE } from '@/lib/meta-config';
import { dispararLeadCapi } from '@/lib/services/meta-capi.service';

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

  const processedMids = new Set<string>(); // evita processar a mesma DM duas vezes

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
          const mid = msg.message?.mid;
          if (mid && processedMids.has(mid)) continue;
          if (mid) processedMids.add(mid);
          await processarMensagemInstagram(msg, entry.id).catch((err) =>
            console.error('[Meta Webhook] Erro ao processar Instagram DM:', err)
          );
        }
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
  // Validar leadgen_id antes de usar — payload inesperado pode trazer undefined
  if (!leadData.leadgen_id || leadData.leadgen_id === 'undefined') {
    console.error('[Meta Leads] leadgen_id inválido no payload:', leadData);
    return;
  }

  // Resolver tenant antes do token para usar token por tenant quando possível
  const supabaseEarly = createServerSupabaseClient();
  const earlyTenantId = await resolverTenant(supabaseEarly, leadData.page_id);

  const { resolverTokenMeta } = await import('@/lib/services/meta-token.service');
  const tokenConfig = earlyTenantId ? await resolverTokenMeta(earlyTenantId) : null;
  const pageToken = tokenConfig?.token ?? process.env.META_PAGE_TOKEN;

  if (!pageToken) {
    console.warn('[Meta Leads] Nenhum token configurado para page_id:', leadData.page_id);
    return;
  }

  // Buscar dados completos do lead via Graph API
  const leadRes = await fetch(
    `${META_BASE}/${leadData.leadgen_id}` +
    `?fields=field_data,created_time&access_token=${pageToken}`
  );

  if (!leadRes.ok) {
    console.error('[Meta Leads] Erro ao buscar lead:', await leadRes.text());
    return;
  }

  // Verificar erro em resposta 200 (Meta às vezes retorna 200 com error object)
  const leadBody = await leadRes.json() as {
    field_data?: Array<{ name: string; values: string[] }>;
    error?: { message: string; code: number };
  };
  if (leadBody.error) {
    console.error('[Meta Leads] Erro na resposta do lead:', leadBody.error.message);
    return;
  }

  const lead = leadBody;

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

  // Upsert do contato na tabela clients (tabela correta do CRM)
  if (phone) {
    await supabase.from('clients').upsert(
      {
        tenant_id:        tenantId,
        phone:            phone,
        phone_normalized: phone,
        name:             nome,
        email,
        tags:             ['meta-ads'],
        source:           'meta_leads',
      },
      { onConflict: 'tenant_id,phone_normalized' }
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

  // ─── Disparar evento Lead para a Conversions API (CAPI) ──────────────────
  // Buscar pixel_id do tenant para otimização do algoritmo Meta
  const { data: capiConfig } = await supabase
    .from('ai_provider_config')
    .select('meta_pixel_id, meta_access_token')
    .eq('tenant_id', tenantId)
    .single();

  if (capiConfig?.meta_pixel_id && capiConfig?.meta_access_token) {
    await dispararLeadCapi(capiConfig.meta_pixel_id, capiConfig.meta_access_token, {
      email: email ?? undefined,
      phone,
      nome,
      leadId: leadData.leadgen_id,
      campaignId: leadData.campaign_id,
      formId: leadData.form_id,
    });
  }
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

  const supabaseForToken = createServerSupabaseClient();
  const igTenantId = await resolverTenant(supabaseForToken, pageId);
  const { resolverTokenMeta: resolverTokenMetaIg } = await import('@/lib/services/meta-token.service');
  const igTokenConfig = igTenantId ? await resolverTokenMetaIg(igTenantId) : null;
  const pageToken = igTokenConfig?.token ?? process.env.META_PAGE_TOKEN;
  if (!pageToken) return;

  // Buscar nome + foto do remetente
  const profileRes = await fetch(
    `${META_BASE}/${senderId}` +
    `?fields=name,profile_pic&access_token=${pageToken}`
  );
  const profile = profileRes.ok
    ? await profileRes.json() as { name?: string; profile_pic?: string }
    : {};

  const supabase = createServerSupabaseClient();
  const tenantId = await resolverTenant(supabase, pageId);
  if (!tenantId) return;

  // 1. Upsert cliente usando ig:{senderId} como identificador único
  //    (phone é NOT NULL na tabela; usamos prefixo ig: para distinguir de telefones)
  const igPhone = `ig:${senderId}`;
  const { data: clientData, error: clientError } = await supabase
    .from('clients')
    .upsert(
      {
        tenant_id:        tenantId,
        phone:            igPhone,
        phone_normalized: igPhone,
        name:             profile.name || `Usuário Instagram`,
        avatar_url:       (profile as { profile_pic?: string }).profile_pic || null,
        source:           'instagram',
        custom_fields:    { instagram_id: senderId },
      },
      { onConflict: 'phone,tenant_id' }
    )
    .select('id')
    .single();

  if (clientError || !clientData) {
    console.error('[Instagram DM] Erro ao upsert cliente:', clientError);
    return;
  }

  const clientId = clientData.id;

  // 2. Encontrar conversa aberta existente ou criar uma nova
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let conversationId = existingConv?.id;

  if (!conversationId) {
    const { data: newConv, error: convError } = await supabase
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        client_id: clientId,
        channel:   'instagram',
        canal:     'instagram',
        status:    'open',
      })
      .select('id')
      .single();

    if (convError || !newConv) {
      console.error('[Instagram DM] Erro ao criar conversa:', convError);
      return;
    }
    conversationId = newConv.id;
  }

  // 3. Salvar mensagem — trigger trg_messages_update_conversation atualiza
  //    last_message_text/at/count na conversation automaticamente
  const { error: msgError } = await supabase.from('messages').upsert(
    {
      tenant_id:       tenantId,
      conversation_id: conversationId,
      client_id:       clientId,
      external_id:     messageId,
      canal:           'instagram',
      sender_name:     profile.name || 'Usuário Instagram',
      content:         text,
      direction:       'inbound',
      type:            'text',
    },
    { onConflict: 'external_id' }
  );

  if (msgError) {
    console.error('[Instagram DM] Erro ao salvar mensagem:', msgError);
    return;
  }

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

  // Sem page_id mapeado → rejeitar para evitar vazamento de dados entre tenants
  if (!data?.tenant_id) {
    console.warn('[Meta Webhook] page_id não mapeado para nenhum tenant:', pageId);
    return null;
  }

  return data.tenant_id;
}

function normalizarTelefone(tel: string): string {
  if (!tel) return '';
  const digits = tel.replace(/\D/g, '');

  // Já tem DDI 55
  if (digits.startsWith('55')) {
    // 55 + DDD(2) + 9 + número(8) = 13 → celular com DDI — válido
    if (digits.length === 13 && digits[4] === '9') return digits;
    // 55 + DDD(2) + número(8) = 12 → fixo com DDI — válido
    if (digits.length === 12) return digits;
    // 14+ dígitos → provavelmente já correto ou lixo, retornar como está
    if (digits.length >= 12) return digits;
  }

  // Sem DDI: celular (DDD + 9 + 8 dígitos = 11) ou fixo (DDD + 8 dígitos = 10)
  if (digits.length === 11 || digits.length === 10) return `55${digits}`;

  return digits;
}
