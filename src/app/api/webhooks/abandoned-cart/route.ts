import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/webhooks/abandoned-cart
 * Recebe webhook de carrinho abandonado do FacilZap.
 * 
 * TODO: Implementar processamento e envio de mensagens automáticas.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    console.log('[WEBHOOK] Carrinho abandonado recebido:', JSON.stringify(body).slice(0, 500));

    // TODO: Salvar no banco e agendar mensagem de recuperação
    // 1. Identificar cliente pelo telefone
    // 2. Salvar carrinho no banco  
    // 3. Agendar mensagem de recuperação via WhatsApp

    return NextResponse.json({ success: true, message: 'Webhook recebido' });
  } catch (error: any) {
    console.error('❌ Webhook abandoned-cart error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
