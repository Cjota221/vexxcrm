import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { sendTextMessage, sendMediaMessage, sendContactMessage, sendButtonsMessage, getTenantEvolutionConfig } from '@/lib/services/evolution.service';
import { PhoneNormalizer } from '@/lib/phone-normalizer';
import { createServerSupabaseClient } from '@/lib/supabase';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';

/**
 * POST /api/whatsapp/send
 * 
 * SaaS Send — Envia mensagem via WhatsApp usando credenciais globais.
 * Isolamento: config montada a partir do tenantId, impossível acessar instância de outro.
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);

    // Rate limiting por tenant
    const rl = checkRateLimit(`whatsapp-send:${tenantId}`, RATE_LIMITS.WHATSAPP_SEND);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Muitas mensagens enviadas. Aguarde um momento.' },
        { status: 429 }
      );
    }

    // Config montada a partir do tenantId (credenciais globais + instanceName isolado)
    const config = getTenantEvolutionConfig(tenantId);

    const body = await request.json();
    const {
      to, content: rawContent, type = 'text', mediaUrl, caption, clientId: clientIdFromBody,
      // Campos específicos do Pix (type === 'pix')
      pixKey, pixKeyType, holderName, pixOrganization,
      // Campos específicos do copy_code (type === 'copy_code')
      copyCode, copyCodeFooter,
    } = body;

    // Conteúdo que será salvo no banco (pode ser modificado por tipos especiais, ex: pix)
    let content = rawContent;

    if (!to) {
      return NextResponse.json(
        { error: 'Campo obrigatório: to' },
        { status: 400 }
      );
    }

    if (type !== 'pix' && type !== 'copy_code' && !content) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: to, content' },
        { status: 400 }
      );
    }

    // Detectar Instagram: to começa com "ig:" (PSID armazenado como ig:{senderId})
    const isInstagram = typeof to === 'string' && to.startsWith('ig:');
    const instagramPsid = isInstagram ? to.replace(/^ig:/, '') : null;

    // Detectar grupo: clientId termina em @g.us (enviado pelo ChatList para grupos)
    const isGroup = !isInstagram && (clientIdFromBody?.endsWith('@g.us') || to?.endsWith('@g.us'));
    // JID para envio: grupos usam o JID completo; individuais normalizam o telefone
    const groupJid = isGroup
      ? (clientIdFromBody?.endsWith('@g.us') ? clientIdFromBody : `${to}@g.us`)
      : null;

    // Normalizar telefone para ENVIO: usar normalize() que garante DDI + 9º dígito
    // NUNCA usar canonical() aqui — canonical remove o 9º dígito (para matching no banco)
    // e a Evolution API não encontra o destinatário sem ele.
    const phoneNormalized = isInstagram ? to : (isGroup ? groupJid! : PhoneNormalizer.normalize(to));
    // Canonical separado apenas para busca/criação do cliente no banco
    const phoneCanonical = isInstagram ? to : (isGroup ? '' : PhoneNormalizer.canonical(to));

    let messageId: string;

    // ── Instagram Direct: enviar via Meta Graph API ───────────────────────────
    if (isInstagram) {
      if (type !== 'text') {
        return NextResponse.json(
          { error: 'Instagram Direct suporta apenas mensagens de texto por enquanto.' },
          { status: 400 }
        );
      }
      // Buscar token Meta do tenant no banco (não de variável de ambiente)
      const supabaseForToken = createServerSupabaseClient();
      const { data: metaCfg } = await supabaseForToken
        .from('ai_provider_config')
        .select('meta_access_token, meta_instagram_id')
        .eq('tenant_id', tenantId)
        .single();
      const pageToken = metaCfg?.meta_access_token || process.env.META_PAGE_TOKEN;
      if (!pageToken) {
        return NextResponse.json(
          { error: 'Token Meta não configurado. Configure em Configurações → Social Mídia.' },
          { status: 503 }
        );
      }
      // Usar meta_instagram_id em vez de /me — /me não funciona com user access token
      const igAccountId = metaCfg?.meta_instagram_id || 'me';
      const igRes = await fetch(
        `https://graph.facebook.com/v19.0/${igAccountId}/messages?access_token=${pageToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: instagramPsid },
            message: { text: content },
          }),
        }
      );
      if (!igRes.ok) {
        const igErr = await igRes.json().catch(() => ({})) as { error?: { message?: string } };
        console.error('[Instagram Send] Erro na Graph API:', igErr);
        return NextResponse.json(
          { error: `Instagram: ${igErr?.error?.message || 'Falha ao enviar mensagem.'}` },
          { status: 502 }
        );
      }
      const igBody = await igRes.json() as { message_id?: string };
      messageId = igBody.message_id || `ig_local_${Date.now()}`;

    // ── WhatsApp / Evolution API ──────────────────────────────────────────────
    } else if (type === 'text') {
      messageId = await sendTextMessage(config, phoneNormalized, content);

    } else if (type === 'copy_code') {
      // Botões interativos (copy_code) SÓ funcionam com WhatsApp Business API oficial.
      // Contas conectadas via QR Code (Evolution) recebem "mensagem não suportada".
      // Solução: enviar texto simples com o cupom formatado e bem visível.
      if (!copyCode) {
        return NextResponse.json({ error: 'copyCode obrigatório para type=copy_code' }, { status: 400 });
      }
      const footer = copyCodeFooter ? `\n_${copyCodeFooter}_` : '';
      const msgText = `${content || '🎁 Seu cupom exclusivo:'}\n\n*━━━━━━━━━━━━━━━*\n🏷️ *CUPOM:* \`${copyCode}\`\n*━━━━━━━━━━━━━━━*${footer}\n\n📋 Copie o código acima e use no checkout!`;
      content = msgText; // salvar o texto completo no banco
      console.log(`[Send] Enviando cupom (texto) — para: ${phoneNormalized} | código: ${copyCode}`);
      messageId = await sendTextMessage(config, phoneNormalized, msgText);

    } else if (type === 'pix') {
      // Envio de Pix como contato vCard
      if (!pixKey) {
        return NextResponse.json({ error: 'pixKey obrigatório para type=pix' }, { status: 400 });
      }

      const contactFullName = holderName || pixOrganization || 'Loja';
      // Texto de fallback que ficará no histórico
      content = `Chave Pix: ${pixKey}`;

      console.log(`[Send] Enviando Pix (vCard) — para: ${phoneNormalized} | holder: ${contactFullName}`);
      messageId = await sendContactMessage(config, phoneNormalized, {
        fullName: contactFullName,
        organization: pixOrganization,
        pixKey,
        phone: undefined,
      });

    } else {
      if (!mediaUrl) {
        return NextResponse.json(
          { error: 'mediaUrl obrigatório para envio de mídia' },
          { status: 400 }
        );
      }

      console.log(`[Send] Enviando mídia — type: ${type} | url: ${mediaUrl?.substring(0, 80)}...`);
      messageId = await sendMediaMessage(
        config,
        phoneNormalized,
        mediaUrl,
        caption || content,
        type as 'image' | 'video' | 'audio' | 'document'
      );
      console.log(`[Send] Mídia enviada — messageId: ${messageId || 'VAZIO'}`);
    }

    // Guardar: se a Evolution API não retornou ID, gerar um ID local temporário.
    // Sem external_id válido, a deduplicação com o webhook falha e a mensagem fica
    // duplicada no banco. O ID temporário garante que o upsert salva e o webhook
    // atualiza via external_id quando chegar.
    if (!messageId) {
      messageId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      console.warn(`[Send] Evolution API não retornou messageId — usando ID temporário: ${messageId}`);
    }

    // Salvar mensagem no banco de dados
    const supabase = createServerSupabaseClient();

    let clientId: string | null = null;
    let conversationId: string;

    if (isGroup) {
      // ── GRUPO: sem cliente, buscar conversa por remote_jid ──────────────────
      console.log(`[Send] Grupo detectado — JID: ${groupJid}`);
      const { data: existingConvs } = await supabase
        .from('conversations')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('remote_jid', groupJid!)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1);

      const existingConv = existingConvs?.[0] ?? null;
      if (existingConv) {
        conversationId = existingConv.id;
      } else {
        const { data: newConv, error: convErr } = await supabase
          .from('conversations')
          .insert({ tenant_id: tenantId, client_id: null, remote_jid: groupJid, channel: 'whatsapp', status: 'open', is_group: true })
          .select('id').single();
        if (convErr || !newConv) throw new Error('Erro ao criar conversa de grupo');
        conversationId = newConv.id;
      }
    } else {
      // ── INDIVIDUAL: buscar/criar cliente por UUID ou phone ─────────────────
      // Se o front-end passou clientId (UUID real), usar direto.
      if (clientIdFromBody && !clientIdFromBody.includes('@')) {
        const { data: validClient } = await supabase
          .from('clients').select('id')
          .eq('tenant_id', tenantId).eq('id', clientIdFromBody).single();
        if (validClient) {
          clientId = validClient.id;
          console.log(`[Send] clientId do body: ${clientId}`);
        }
      }

      if (!clientId) {
        // Fallback: buscar por phone_normalized
        const { data: byPhone } = await supabase
          .from('clients').select('id')
          .eq('tenant_id', tenantId)
          .eq('phone_normalized', phoneCanonical)
          .single();

        if (byPhone) {
          clientId = byPhone.id;
          console.log(`[Send] clientId por phone: ${clientId}`);
        } else {
          // Criar cliente novo
          const phoneDisplay = isInstagram ? to : PhoneNormalizer.normalize(to);
          const { data: newClient, error: clientErr } = await supabase
            .from('clients')
            .upsert(
              { tenant_id: tenantId, phone: phoneDisplay, phone_normalized: phoneCanonical, name: phoneDisplay, source: isInstagram ? 'instagram' : undefined },
              { onConflict: 'tenant_id,phone_normalized', ignoreDuplicates: false }
            )
            .select('id').single();
          if (clientErr || !newClient) {
            console.error('[Send] Erro ao criar cliente:', clientErr);
            return NextResponse.json({ error: 'Erro ao criar contato' }, { status: 500 });
          }
          clientId = newClient.id;
          console.log(`[Send] clientId novo: ${clientId}`);
        }
      }

      // Buscar ou criar conversa individual
      const { data: existingConvs } = await supabase
        .from('conversations')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('client_id', clientId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1);

      const existingConv = existingConvs?.[0] ?? null;
      if (existingConv) {
        conversationId = existingConv.id;
      } else {
        const convChannel = isInstagram ? 'instagram' : 'whatsapp';
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({ tenant_id: tenantId, client_id: clientId, channel: convChannel, canal: convChannel, status: 'open' })
          .select('id').single();
        if (!newConv) throw new Error('Erro ao criar conversa');
        conversationId = newConv.id;
      }
    }

    // Salvar mensagem enviada.
    // Estratégia: INSERT direto. Se o webhook chegou antes (erro 23505 = duplicata),
    // buscar a linha existente pelo external_id. Evita dependência de named constraint
    // (o índice parcial WHERE external_id IS NOT NULL não funciona com onConflict no PostgREST).

    // Mapear tipos especiais para tipos válidos no banco (messages_type_check constraint):
    // Tipos válidos: 'text','image','video','audio','document','sticker','location','contact','reaction','system'
    // 'copy_code' e 'pix' não existem no schema → salvar como 'text', detalhes no metadata
    const dbType = (type === 'copy_code' || type === 'pix') ? 'text' : type;

    // Montar metadata: copy_code e pix ficam aqui para a bolha renderizar o botão/info
    let metadata: Record<string, unknown> | undefined;
    if (type === 'copy_code' && copyCode) {
      metadata = { copy_code: copyCode, copy_code_footer: copyCodeFooter ?? null };
    } else if (type === 'pix' && pixKey) {
      metadata = { pix_key: pixKey, pix_key_type: pixKeyType ?? null, holder_name: holderName ?? null };
    }

    const msgPayload = {
      tenant_id: tenantId,
      conversation_id: conversationId,
      client_id: clientId,
      external_id: messageId,   // ← ID da Evolution/Graph API = chave de dedup
      canal: isInstagram ? 'instagram' : 'whatsapp',
      direction: 'outbound' as const,
      sender_name: 'Atendente',
      sender_phone: null,
      content,
      type: dbType,
      media_url: mediaUrl || null,
      status: 'sent',
      created_at: new Date().toISOString(),
      ...(metadata ? { metadata } : {}),
    };

    let { data: savedMessage, error: msgError } = await supabase
      .from('messages')
      .insert(msgPayload)
      .select()
      .single();

    if (msgError) {
      if (msgError.code === '23505') {
        // Duplicata: webhook chegou antes → buscar linha existente
        console.log(`[Send] Duplicata (23505) — buscando por external_id: ${messageId}`);
        const { data: fetched } = await supabase
          .from('messages')
          .select()
          .eq('tenant_id', tenantId)
          .eq('external_id', messageId)
          .single();
        if (fetched) savedMessage = fetched;
      } else {
        // Logar erro completo para diagnóstico
        console.error(`[Send] ERRO INSERT mensagem — code: ${msgError.code} | message: ${msgError.message} | details: ${msgError.details} | hint: ${msgError.hint}`);
        console.error(`[Send] Payload que falhou:`, JSON.stringify(msgPayload));
      }
    }

    // Fallback: INSERT retornou null sem erro (caso raro no Supabase)
    if (!savedMessage && !msgError) {
      const { data: fetched } = await supabase
        .from('messages')
        .select()
        .eq('tenant_id', tenantId)
        .eq('external_id', messageId)
        .single();
      if (fetched) {
        savedMessage = fetched;
        console.log(`[Send] INSERT retornou null — recuperado por external_id: ${messageId}`);
      }
    }

    // Se ainda não tem mensagem salva, a Evolution API enviou mas o banco falhou
    // Retornar erro explícito para o front-end tratar (não sumir silenciosamente)
    if (!savedMessage) {
      console.error(`[Send] Mensagem enviada pela Evolution mas NÃO salva no banco. messageId=${messageId}, tenantId=${tenantId}, conversationId=${conversationId}`);
      return NextResponse.json({
        success: true,        // whatsapp enviou
        message: null,
        messageId,
        warning: 'Mensagem enviada mas não registrada no histórico. Recarregue a conversa.',
      });
    }

    // Atualizar last_message na conversa (para reordenação na lista de chats)
    console.log(`[Send] ✅ Mensagem salva — id: ${savedMessage.id} | external_id: ${savedMessage.external_id} | conv: ${conversationId} | client: ${clientId}`);
    await supabase
      .from('conversations')
      .update({
        last_message_at: savedMessage.created_at,
        last_message_text: content?.substring(0, 120) || '',
        last_message_from_me: true,
        status: 'open',
      })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId);

    // Traduzir para o formato Message do TypeScript — igual ao GET /api/messages/[clientId]
    // Garante que o front-end (onSuccess) recebe from_me, timestamp, message_id corretos
    const translatedMessage = {
      id: savedMessage.id,
      tenant_id: savedMessage.tenant_id,
      client_id: savedMessage.client_id || clientId,
      remote_jid: savedMessage.sender_phone
        ? `${savedMessage.sender_phone}@s.whatsapp.net`
        : '',
      message_id: savedMessage.external_id || savedMessage.id,
      from_me: true,   // sempre outbound no send
      content: savedMessage.content || '',
      type: savedMessage.type,
      media_url: savedMessage.media_url || undefined,
      media_type: savedMessage.media_mime_type || undefined,
      media_size: savedMessage.media_size || undefined,
      timestamp: savedMessage.created_at,
      status: savedMessage.status,
      metadata: savedMessage.metadata || {},
      created_at: savedMessage.created_at,
    };

    return NextResponse.json({
      success: true,
      message: translatedMessage,
      messageId,
    });

  } catch (error: any) {
    console.error('[Send] Erro:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao enviar mensagem' },
      { status: 500 }
    );
  }
}

