import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/campaigns/send-sequence
 * Inicia envio de sequência de campanha.
 */
export async function POST(request: NextRequest) {
  try {
    const { campaign_id } = await request.json();

    if (!campaign_id) {
      return NextResponse.json({ error: 'campaign_id é obrigatório' }, { status: 400 });
    }

    // TODO: Implementar envio de sequência
    return NextResponse.json({
      data: {
        campaign_id,
        status: 'queued',
        message: 'Campanha adicionada à fila de envio',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
