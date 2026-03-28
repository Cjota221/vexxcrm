import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { getTenantEvolutionConfig, subscribeToPresence } from '@/lib/services/evolution.service';

/**
 * POST /api/whatsapp/subscribe-presence
 * Body: { remoteJid: string }
 *
 * Assina presença de um contato para receber eventos presence.update
 * (digitando / gravando áudio). Deve ser chamado ao abrir uma conversa.
 * Falha silenciosa — nem todas as versões da Evolution suportam.
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const { remoteJid } = await request.json() as { remoteJid?: string };

    if (!remoteJid) {
      return NextResponse.json({ ok: false, error: 'remoteJid obrigatório' }, { status: 400 });
    }

    const config = getTenantEvolutionConfig(tenantId);
    await subscribeToPresence(config, remoteJid);

    return NextResponse.json({ ok: true });
  } catch {
    // Não retornar erro — presence é best-effort
    return NextResponse.json({ ok: false });
  }
}
