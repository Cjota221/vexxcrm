import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { eventBus } from '@/lib/event-bus';

/**
 * POST /api/anne/media-callback
 * 
 * Callback do n8n — recebe transcrições de áudio e descrições de imagens.
 * 
 * Body esperado:
 * {
 *   messageId: string,      // ID da mensagem no Supabase
 *   tenantId: string,
 *   clientId: string,
 *   mediaType: 'audio' | 'image' | 'video',
 *   transcription?: string, // Transcrição de áudio (Whisper)
 *   description?: string,   // Descrição de imagem (Vision)
 *   confidence?: number,    // Confiança da transcrição (0-1)
 *   language?: string,      // Idioma detectado
 *   labels?: string[],      // Labels detectados na imagem
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Validar origem (n8n webhook secret)
    const n8nSecret = process.env.N8N_WEBHOOK_SECRET;
    if (n8nSecret) {
      const headerSecret = request.headers.get('x-webhook-secret') || '';
      if (headerSecret !== n8nSecret) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const body = await request.json();
    const { messageId, tenantId, clientId, mediaType, transcription, description, confidence, language, labels } = body;

    if (!messageId || !tenantId) {
      return NextResponse.json(
        { error: 'messageId e tenantId são obrigatórios' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Buscar mensagem existente
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .select('id, metadata, tenant_id')
      .eq('id', messageId)
      .eq('tenant_id', tenantId)
      .single();

    if (msgError || !message) {
      return NextResponse.json(
        { error: 'Mensagem não encontrada' },
        { status: 404 }
      );
    }

    // Montar metadata atualizada
    const existingMetadata = (message.metadata as Record<string, unknown>) || {};
    const updatedMetadata: Record<string, unknown> = {
      ...existingMetadata,
      ai_processed: true,
      ai_processed_at: new Date().toISOString(),
    };

    if (mediaType === 'audio' && transcription) {
      updatedMetadata.transcription = transcription;
      updatedMetadata.transcription_confidence = confidence;
      updatedMetadata.transcription_language = language || 'pt-BR';
    }

    if ((mediaType === 'image' || mediaType === 'video') && description) {
      updatedMetadata.ai_description = description;
      updatedMetadata.ai_labels = labels || [];
    }

    // Atualizar mensagem com metadata de IA
    const { error: updateError } = await supabase
      .from('messages')
      .update({ metadata: updatedMetadata })
      .eq('id', messageId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      console.error('[Anne Callback] Erro ao atualizar:', updateError);
      return NextResponse.json(
        { error: 'Erro ao atualizar mensagem' },
        { status: 500 }
      );
    }

    // Emitir evento SSE para atualizar UI em tempo real
    eventBus.emitToTenant('media_transcription', tenantId, {
      message_id: messageId,
      client_id: clientId,
      media_type: mediaType,
      transcription: transcription || null,
      description: description || null,
    });

    console.log(`[Anne Callback] ${mediaType} processado para msg ${messageId.slice(0, 8)}...`);

    return NextResponse.json({
      success: true,
      message: 'Callback processado',
    });
  } catch (error) {
    console.error('[Anne Callback] Erro:', error);
    return NextResponse.json(
      { error: 'Erro interno' },
      { status: 500 }
    );
  }
}
