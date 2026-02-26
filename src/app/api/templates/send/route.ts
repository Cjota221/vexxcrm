import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { sendTextMessage, sendMediaMessage, getTenantEvolutionConfig } from '@/lib/services/evolution.service';
import { PhoneNormalizer } from '@/lib/phone-normalizer';
import type { TemplateBlock } from '@/types';

/**
 * POST /api/templates/send
 *
 * Envia um template composto (multi-bubble) para um destinatário.
 * Cada bloco é disparado em sequência com delay humano E salvo no banco de
 * dados (tabela `messages`) para aparecer no painel de atendimento.
 *
 * Body: { templateId, to, variables?: Record<string, string>, clientId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const config = getTenantEvolutionConfig(tenantId);

    const body = await request.json();
    const { templateId, to, variables: variablesFromBody = {}, clientId: clientIdFromBody } = body as {
      templateId: string;
      to: string;
      variables?: Record<string, string>;
      clientId?: string;
    };

    // Variáveis mutáveis — serão enriquecidas com dados do cliente antes de interpolar
    let variables: Record<string, string> = { ...variablesFromBody };

    if (!templateId || !to) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: templateId, to' },
        { status: 400 }
      );
    }

    // ── Buscar template ──────────────────────────────────────────
    const { data: template, error: tplErr } = await supabase
      .from('message_templates')
      .select('*')
      .eq('id', templateId)
      .eq('tenant_id', tenantId)
      .eq('status', 'ativo')
      .single();

    if (tplErr || !template) {
      console.error('[templates/send] Template não encontrado:', templateId, tplErr?.message);
      return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 });
    }

    const phoneNormalized = PhoneNormalizer.canonical(to);

    // ── Normalizar blocos ────────────────────────────────────────
    const rawBlocks = (template.blocos ?? template.blocks ?? []) as Array<Record<string, unknown>>;
    const blocks: TemplateBlock[] = rawBlocks
      .map((b, i) => ({
        id: (b.id as string) ?? String(i),
        type: (b.type ?? b.tipo ?? 'text') as TemplateBlock['type'],
        order: (b.order as number) ?? i,
        content: (b.content ?? b.conteudo ?? b.texto) as string | undefined,
        media_url: (b.media_url ?? b.url) as string | undefined,
        image_url: b.image_url as string | undefined,
        media_caption: (b.media_caption ?? b.caption ?? b.legenda) as string | undefined,
        image_caption: b.image_caption as string | undefined,
        link_url: (b.link_url ?? b.url) as string | undefined,
        link_title: (b.link_title ?? b.titulo) as string | undefined,
        cta_url: b.cta_url as string | undefined,
        cta_label: b.cta_label as string | undefined,
        delay_ms: b.delay_ms as number | undefined,
      } as TemplateBlock))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const interpolate = (str?: string) => {
      if (!str) return str;
      return str.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
    };

    // ── Resolver cliente e conversa ──────────────────────────────
    let clientId: string | undefined;
    let clientName: string | undefined;

    if (clientIdFromBody) {
      const { data: valid } = await supabase
        .from('clients').select('id, name')
        .eq('tenant_id', tenantId).eq('id', clientIdFromBody).single();
      if (valid) { clientId = valid.id; clientName = valid.name; }
    }

    if (!clientId) {
      const { data: byPhone } = await supabase
        .from('clients').select('id, name')
        .eq('tenant_id', tenantId)
        .eq('phone_normalized', phoneNormalized)
        .single();
      if (byPhone) { clientId = byPhone.id; clientName = byPhone.name; }
    }

    if (!clientId) {
      const phoneDisplay = PhoneNormalizer.normalize(to);
      const { data: newClient } = await supabase
        .from('clients')
        .upsert(
          { tenant_id: tenantId, phone: phoneDisplay, phone_normalized: phoneNormalized, name: phoneDisplay },
          { onConflict: 'tenant_id,phone_normalized', ignoreDuplicates: false }
        )
        .select('id, name').single();
      clientId = newClient?.id;
      clientName = clientName ?? newClient?.name;
    }

    // ── Enriquecer variáveis com dados do cliente ────────────────
    // Garante que {{nome}} seja substituído mesmo se o frontend não enviou
    if (clientName && !variables['nome']) {
      variables['nome'] = clientName;
    }
    // Primeiro nome (ex: "João Silva" → "João")
    if (!variables['primeiro_nome']) {
      const nomeCompleto = variables['nome'] || clientName || '';
      variables['primeiro_nome'] = nomeCompleto.split(' ')[0] || nomeCompleto;
    }
    // Saudação automática por horário de Brasília
    if (!variables['saudacao']) {
      const hora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false });
      const h = parseInt(hora, 10);
      variables['saudacao'] = h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite';
    }

    // Buscar ou criar conversa
    let conversationId: string | undefined;
    if (clientId) {
      const { data: convs } = await supabase
        .from('conversations').select('id')
        .eq('tenant_id', tenantId)
        .eq('client_id', clientId)
        .eq('channel', 'whatsapp')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1);

      if (convs?.[0]) {
        conversationId = convs[0].id;
      } else {
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({ tenant_id: tenantId, client_id: clientId, channel: 'whatsapp', status: 'open' })
          .select('id').single();
        conversationId = newConv?.id;
      }
    }

    // ── Enviar blocos ────────────────────────────────────────────
    const results: Array<{ blockId: string; messageId: string; status: 'sent' | 'error'; error?: string }> = [];
    let lastContent = '';
    let lastType = 'text';
    let lastMediaUrl: string | undefined;

    for (const block of blocks) {
      const delayMs = block.delay_ms ?? (results.length === 0 ? 0 : 1200);
      if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));

      try {
        let messageId: string;
        let msgContent = '';
        let msgType = 'text';
        let msgMediaUrl: string | undefined;
        let msgMetadata: Record<string, unknown> | undefined;

        switch (block.type) {
          case 'text': {
            msgContent = interpolate(block.content) || '';
            if (!msgContent.trim()) { results.push({ blockId: block.id, messageId: '', status: 'error', error: 'Bloco vazio' }); continue; }
            msgType = 'text';
            messageId = await sendTextMessage(config, phoneNormalized, msgContent);
            break;
          }

          case 'copy_code': {
            const code = interpolate((block as any).copy_code || block.content) || '';
            const text = interpolate((block as any).text || '') || '📋 Toque para copiar seu código:';
            msgContent = text;
            msgType = 'copy_code';
            msgMetadata = { copy_code: code };
            messageId = await sendTextMessage(config, phoneNormalized, `${text}\n\`${code}\``);
            break;
          }

          case 'image':
          case 'video':
          case 'audio':
          case 'document': {
            const url = block.media_url || block.image_url || '';
            if (!url) { results.push({ blockId: block.id, messageId: '', status: 'error', error: 'URL de mídia ausente' }); continue; }
            const caption = interpolate(block.media_caption || block.image_caption) || '';
            msgContent = caption;
            msgType = block.type;
            msgMediaUrl = url;
            messageId = await sendMediaMessage(config, phoneNormalized, url, caption, block.type as 'image' | 'video' | 'audio' | 'document');
            break;
          }

          case 'link':
          case 'cta': {
            const label = interpolate(block.link_title || block.cta_label) || '';
            const url = interpolate(block.link_url || block.cta_url || block.media_url) || '';
            msgContent = label ? `${label}\n${url}` : url;
            if (!msgContent.trim()) { results.push({ blockId: block.id, messageId: '', status: 'error', error: 'Link vazio' }); continue; }
            msgType = 'text';
            messageId = await sendTextMessage(config, phoneNormalized, msgContent);
            break;
          }

          default:
            results.push({ blockId: block.id, messageId: '', status: 'error', error: `Tipo desconhecido: ${block.type}` });
            continue;
        }

        // Garantir ID para dedup
        if (!messageId) {
          messageId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        }

        // ── Salvar mensagem no banco ──────────────────────────
        if (clientId && conversationId) {
          const msgPayload: Record<string, unknown> = {
            tenant_id: tenantId,
            conversation_id: conversationId,
            client_id: clientId,
            external_id: messageId,
            direction: 'outbound',
            sender_name: 'Atendente',
            sender_phone: null,
            content: msgContent,
            type: msgType,
            media_url: msgMediaUrl || null,
            status: 'sent',
            created_at: new Date().toISOString(),
            ...(msgMetadata ? { metadata: msgMetadata } : {}),
          };

          const { error: insertErr } = await supabase.from('messages').insert(msgPayload);
          if (insertErr && insertErr.code !== '23505') {
            console.warn('[templates/send] Erro ao salvar mensagem no banco:', insertErr.message);
          }

          lastContent = msgContent;
          lastType = msgType;
          lastMediaUrl = msgMediaUrl;
        }

        results.push({ blockId: block.id, messageId, status: 'sent' });
      } catch (err: any) {
        results.push({ blockId: block.id, messageId: '', status: 'error', error: err.message });
      }
    }

    // ── Atualizar last_message na conversa ───────────────────────
    if (conversationId && results.some(r => r.status === 'sent')) {
      await supabase
        .from('conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_text: lastContent?.substring(0, 120) || '',
          last_message_from_me: true,
          status: 'open',
        })
        .eq('id', conversationId)
        .eq('tenant_id', tenantId);
    }

    const sent = results.filter(r => r.status === 'sent').length;
    const errors = results.filter(r => r.status === 'error').length;

    return NextResponse.json({
      success: errors === 0,
      summary: { sent, errors, total: blocks.length },
      results,
    });
  } catch (error: any) {
    console.error('[POST /api/templates/send]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
