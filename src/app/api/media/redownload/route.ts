import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantEvolutionConfig, downloadMediaToStorage } from '@/lib/services/evolution.service';

/**
 * POST /api/media/redownload
 *
 * Re-baixa uma mídia cujo URL expirou (403 no mmg.whatsapp.net).
 * Usa a Evolution API para obter o base64, faz upload para Supabase Storage,
 * e atualiza a mensagem no banco com a URL permanente.
 *
 * Body:
 *   - messageId: ID interno da mensagem (UUID)
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const { messageId } = await request.json();

    if (!messageId) {
      return NextResponse.json({ error: 'messageId é obrigatório' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // 1. Buscar mensagem no banco
    const { data: message, error: msgErr } = await supabase
      .from('messages')
      .select('id, external_id, media_url, media_mime_type, type, content, metadata')
      .eq('id', messageId)
      .eq('tenant_id', tenantId)
      .single();

    if (msgErr || !message) {
      return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });
    }

    if (!message.external_id) {
      return NextResponse.json({ error: 'Mensagem sem external_id (não pode re-baixar)' }, { status: 400 });
    }

    // 2. Verificar se já é uma URL permanente (Supabase Storage)
    const currentUrl = message.media_url || '';
    if (currentUrl.includes('supabase.co/storage') || currentUrl.includes('supabase.in/storage')) {
      return NextResponse.json({
        data: { media_url: currentUrl, already_permanent: true },
      });
    }

    // 3. Buscar a conversa para obter o remoteJid
    const { data: conversation } = await supabase
      .from('conversations')
      .select('contact_phone')
      .eq('tenant_id', tenantId)
      .eq('id', (await supabase
        .from('messages')
        .select('conversation_id')
        .eq('id', messageId)
        .eq('tenant_id', tenantId)
        .single()
      ).data?.conversation_id || '')
      .single();

    // Construir key para a Evolution API
    const config = getTenantEvolutionConfig(tenantId);
    const phone = conversation?.contact_phone || '';
    const remoteJid = phone ? `${phone.replace(/\D/g, '')}@s.whatsapp.net` : '';

    // 4. Tentar baixar via Evolution API
    // Reconstituir o objeto "message" mínimo para o getBase64
    const mediaType = message.type || 'image';
    const messageKey = `${mediaType}Message`;
    const fakeMessage: Record<string, unknown> = {
      [messageKey]: {
        url: message.media_url,
        mimetype: message.media_mime_type,
      },
    };

    const permanentUrl = await downloadMediaToStorage(
      config,
      { id: message.external_id, remoteJid, fromMe: false },
      fakeMessage,
      tenantId,
      message.media_mime_type || undefined
    );

    if (!permanentUrl) {
      return NextResponse.json(
        { error: 'Não foi possível re-baixar a mídia. Ela pode ter sido apagada do WhatsApp.' },
        { status: 422 }
      );
    }

    // 5. Atualizar no banco
    await supabase
      .from('messages')
      .update({ media_url: permanentUrl })
      .eq('id', messageId)
      .eq('tenant_id', tenantId);

    return NextResponse.json({
      data: { media_url: permanentUrl, redownloaded: true },
    });
  } catch (error: any) {
    console.error('[Redownload] Erro:', error);
    return NextResponse.json(
      { error: error.message || 'Erro interno' },
      { status: 500 }
    );
  }
}
