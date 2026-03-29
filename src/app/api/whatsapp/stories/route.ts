import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { getTenantEvolutionConfig } from '@/lib/services/evolution.service';

/**
 * POST /api/whatsapp/stories — Postar status (story) no WhatsApp
 * GET  /api/whatsapp/stories — Listar status recentes dos contatos
 */

// ── POST: Postar status ──────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const config = getTenantEvolutionConfig(profile.tenant_id);

    const body = await request.json() as {
      type: 'text' | 'image' | 'video';
      content?: string;
      media_url?: string;
      caption?: string;
      background_color?: string;
      font?: number;
    };

    if (!body.type) {
      return NextResponse.json({ error: 'Tipo de status é obrigatório' }, { status: 400 });
    }

    let payload: Record<string, unknown>;

    if (body.type === 'text') {
      if (!body.content) {
        return NextResponse.json({ error: 'Conteúdo de texto é obrigatório' }, { status: 400 });
      }
      payload = {
        type: 'text',
        content: body.content,
        backgroundColor: body.background_color || '#1e3a5f',
        font: body.font ?? 1,  // 0 é inválido na v2 — range válido: 1-5
        allContacts: true,
      };
    } else {
      if (!body.media_url) {
        return NextResponse.json({ error: 'URL da mídia é obrigatória' }, { status: 400 });
      }
      payload = {
        type: body.type,
        content: body.media_url,
        caption: body.caption ?? '',
        backgroundColor: '#000000',
        font: 1,
        allContacts: true,
      };
    }

    const response = await fetch(
      `${config.apiUrl}/message/sendStatus/${config.instanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.apiKey,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[STORIES_POST] Evolution API error:', response.status);
      console.error('[STORIES_POST] Payload enviado:', JSON.stringify(payload));
      console.error('[STORIES_POST] Resposta da API:', errText.substring(0, 500));
      // Tentar parsear o JSON de erro da Evolution API para retornar detalhe útil
      let detail = errText.substring(0, 300);
      try {
        const errJson = JSON.parse(errText);
        detail = errJson.message || errJson.error || errJson.response?.message || detail;
        if (Array.isArray(detail)) detail = detail.join('; ');
      } catch { /* não é JSON */ }
      return NextResponse.json(
        { error: `Erro ao postar status: HTTP ${response.status}`, detail },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error('[STORIES_POST]', err);
    return NextResponse.json({ error: 'Erro ao postar status' }, { status: 500 });
  }
}

// ── GET: Listar status recentes ──────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const config = getTenantEvolutionConfig(profile.tenant_id);

    // Tentar diferentes endpoints conforme a versão da Evolution API.
    // Ordem: v2 GET first (sem body), depois v1 POST com body mínimo.
    // Em caso de 400/404/405 — pular silenciosamente e retornar lista vazia.
    const endpoints: Array<{ url: string; method: string; body?: string }> = [
      {
        url: `${config.apiUrl}/chat/findStatusMessage/${config.instanceName}`,
        method: 'GET',
      },
      {
        url: `${config.apiUrl}/status/findStatusMessage/${config.instanceName}`,
        method: 'GET',
      },
      {
        url: `${config.apiUrl}/chat/findStatusMessage/${config.instanceName}`,
        method: 'POST',
        body: JSON.stringify({ limit: 50 }),
      },
    ];

    for (const ep of endpoints) {
      try {
        const response = await fetch(ep.url, {
          method: ep.method,
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.apiKey,
          },
          ...(ep.body ? { body: ep.body } : {}),
        });

        // 400/404/405: endpoint não existe nesta versão — tentar próximo
        if (response.status === 400 || response.status === 404 || response.status === 405) {
          continue;
        }

        if (response.ok) {
          const data = await response.json();
          return NextResponse.json({ status_list: normalizeStatusList(data) });
        }
      } catch {
        continue;
      }
    }

    // Nenhum endpoint disponível — retornar lista vazia (não é erro crítico)
    return NextResponse.json({
      status_list: [],
      aviso: 'Endpoint de status não disponível nesta versão da Evolution API',
    });
  } catch (err) {
    console.error('[STORIES_GET]', err);
    return NextResponse.json({ error: 'Erro ao buscar status' }, { status: 500 });
  }
}

// ── Normalizar dados ─────────────────────────────────────────────────────────

interface NormalizedStatus {
  id: string;
  sender_jid: string;
  sender_name: string;
  type: 'text' | 'image' | 'video';
  content: string;
  caption?: string;
  thumbnail_url?: string;
  timestamp: string;
  background_color?: string;
}

function normalizeStatusList(data: unknown): NormalizedStatus[] {
  const raw = Array.isArray(data) ? data : ((data as Record<string, unknown>)?.messages ?? []);
  return (raw as Record<string, unknown>[])
    .map((item): NormalizedStatus | null => {
      const msg = (item.message ?? item) as Record<string, unknown>;
      const key = (item.key ?? msg.key) as Record<string, string> | undefined;
      const senderJid = key?.remoteJid ?? (item.remoteJid as string) ?? '';

      let type: 'text' | 'image' | 'video' = 'text';
      let content = '';
      let caption: string | undefined;
      let thumbnail: string | undefined;
      let bgColor: string | undefined;

      if (msg.imageMessage) {
        type = 'image';
        content = (msg.imageMessage as Record<string, string>)?.url || '';
        caption = (msg.imageMessage as Record<string, string>)?.caption;
        const jpg = (msg.imageMessage as Record<string, string>)?.jpegThumbnail;
        if (jpg) thumbnail = `data:image/jpeg;base64,${jpg}`;
      } else if (msg.videoMessage) {
        type = 'video';
        content = (msg.videoMessage as Record<string, string>)?.url || '';
        caption = (msg.videoMessage as Record<string, string>)?.caption;
        const jpg = (msg.videoMessage as Record<string, string>)?.jpegThumbnail;
        if (jpg) thumbnail = `data:image/jpeg;base64,${jpg}`;
      } else if (msg.extendedTextMessage) {
        type = 'text';
        content = (msg.extendedTextMessage as Record<string, string>)?.text || '';
        bgColor = (msg.extendedTextMessage as Record<string, string>)?.backgroundArgb;
      } else if (msg.conversation) {
        type = 'text';
        content = msg.conversation as string;
      }

      if (!content && !thumbnail) return null;

      return {
        id: key?.id || `${Date.now()}-${Math.random()}`,
        sender_jid: senderJid,
        sender_name: (item.pushName as string) ?? senderJid.split('@')[0],
        type,
        content,
        caption,
        thumbnail_url: thumbnail,
        timestamp: item.messageTimestamp
          ? new Date(Number(item.messageTimestamp) * 1000).toISOString()
          : new Date().toISOString(),
        background_color: bgColor,
      };
    })
    .filter((s): s is NormalizedStatus => s !== null)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
