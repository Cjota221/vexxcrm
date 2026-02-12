import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/anne/chat
 * Chat com agente Anne (OpenAI GPT-4o).
 */
export async function POST(request: NextRequest) {
  try {
    const { message, context } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Mensagem é obrigatória' }, { status: 400 });
    }

    // TODO: Implementar integração real com OpenAI
    return NextResponse.json({
      data: {
        reply: 'Anne está sendo configurada. Em breve responderei suas perguntas! 🤖',
        actions: [],
      },
    });
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
