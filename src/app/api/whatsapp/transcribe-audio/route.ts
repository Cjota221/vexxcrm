import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * POST /api/whatsapp/transcribe-audio
 *
 * Transcreve um áudio manualmente via n8n (webhook) ou diretamente via OpenAI Whisper.
 * Body: { messageId: string }
 * Retorna: { transcription: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { messageId } = await req.json();
    if (!messageId) {
      return NextResponse.json({ error: 'messageId obrigatório' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Buscar a mensagem e tenant
    const { data: message, error: msgErr } = await supabase
      .from('messages')
      .select('id, media_url, media_mime_type, tenant_id, metadata')
      .eq('id', messageId)
      .single();

    if (msgErr || !message) {
      return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });
    }

    if (!message.media_url) {
      return NextResponse.json({ error: 'Mensagem sem URL de mídia' }, { status: 400 });
    }

    // Se já tem transcrição no metadata, retornar direto
    const existing = (message.metadata as Record<string, unknown>)?.transcription as string | undefined;
    if (existing) {
      return NextResponse.json({ transcription: existing });
    }

    let transcription: string | null = null;

    // ── Opção 1: via n8n webhook ───────────────────────────────────────────
    const n8nUrl = process.env.N8N_WEBHOOK_URL || process.env.N8N_BASE_URL;
    if (n8nUrl) {
      try {
        const webhookUrl = n8nUrl.replace(/\/$/, '') + '/webhook/transcribe-audio';
        const n8nRes = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId: message.id,
            mediaUrl: message.media_url,
            mimeType: message.media_mime_type || 'audio/ogg',
            tenantId: message.tenant_id,
          }),
          signal: AbortSignal.timeout(30_000),
        });
        if (n8nRes.ok) {
          const result = await n8nRes.json();
          transcription = result?.transcription || result?.text || null;
        }
      } catch (err) {
        console.warn('[transcribe-audio] n8n falhou, tentando OpenAI direto:', err);
      }
    }

    // ── Opção 2: OpenAI Whisper direto ────────────────────────────────────
    if (!transcription) {
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        return NextResponse.json({ error: 'Serviço de transcrição não configurado. Configure N8N_WEBHOOK_URL ou OPENAI_API_KEY.' }, { status: 503 });
      }

      // Baixar o áudio
      const audioRes = await fetch(message.media_url, { signal: AbortSignal.timeout(20_000) });
      if (!audioRes.ok) {
        return NextResponse.json({ error: 'Não foi possível baixar o áudio' }, { status: 502 });
      }

      const audioBuffer = await audioRes.arrayBuffer();
      const mimeType = message.media_mime_type || 'audio/ogg';
      const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a' : 'webm';

      const formData = new FormData();
      formData.append('file', new Blob([audioBuffer], { type: mimeType }), `audio.${ext}`);
      formData.append('model', 'whisper-1');
      formData.append('language', 'pt');

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}` },
        body: formData,
        signal: AbortSignal.timeout(60_000),
      });

      if (!whisperRes.ok) {
        const err = await whisperRes.text();
        console.error('[transcribe-audio] OpenAI error:', err);
        return NextResponse.json({ error: 'Falha na transcrição via OpenAI' }, { status: 502 });
      }

      const whisperData = await whisperRes.json();
      transcription = whisperData?.text || null;
    }

    if (!transcription) {
      return NextResponse.json({ error: 'Não foi possível transcrever o áudio' }, { status: 502 });
    }

    // Salvar transcrição no metadata da mensagem
    const currentMetadata = (message.metadata as Record<string, unknown>) || {};
    await supabase
      .from('messages')
      .update({
        metadata: {
          ...currentMetadata,
          transcription,
          transcribed_at: new Date().toISOString(),
          transcribed_manually: true,
        },
      })
      .eq('id', messageId);

    return NextResponse.json({ transcription });
  } catch (err) {
    console.error('[transcribe-audio] Erro:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
