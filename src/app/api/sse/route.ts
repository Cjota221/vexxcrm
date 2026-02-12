import { NextRequest, NextResponse } from 'next/server';
import { eventBus } from '@/lib/event-bus';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * GET /api/sse
 *
 * Server-Sent Events endpoint para atualizações real-time.
 * Cada conexão é isolada por tenant_id via auth.
 */
export async function GET(request: NextRequest) {
  try {
    // Autenticar via query param ou header
    const token =
      request.nextUrl.searchParams.get('token') ||
      request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Validar token e obter tenant_id
    const supabase = createServerSupabaseClient();
    const { data: { user: authUser }, error } = await supabase.auth.getUser(token);

    if (error || !authUser) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    // Buscar tenant_id do profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', authUser.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const tenantId = profile.tenant_id;

    // Criar stream SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Heartbeat a cada 30s
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch {
            clearInterval(heartbeat);
          }
        }, 30000);

        // Listener: new_message
        const onNewMessage = (data: unknown) => {
          try {
            const event = `data: ${JSON.stringify({ type: 'new_message', data, timestamp: new Date().toISOString() })}\n\n`;
            controller.enqueue(encoder.encode(event));
          } catch { /* connection closed */ }
        };

        // Listener: message_status
        const onMessageStatus = (data: unknown) => {
          try {
            const event = `data: ${JSON.stringify({ type: 'message_status', data, timestamp: new Date().toISOString() })}\n\n`;
            controller.enqueue(encoder.encode(event));
          } catch { /* connection closed */ }
        };

        // Listener: typing_indicator
        const onTyping = (data: unknown) => {
          try {
            const event = `data: ${JSON.stringify({ type: 'typing_indicator', data, timestamp: new Date().toISOString() })}\n\n`;
            controller.enqueue(encoder.encode(event));
          } catch { /* connection closed */ }
        };

        // Listener: connection_update
        const onConnection = (data: unknown) => {
          try {
            const event = `data: ${JSON.stringify({ type: 'connection_update', data, timestamp: new Date().toISOString() })}\n\n`;
            controller.enqueue(encoder.encode(event));
          } catch { /* connection closed */ }
        };

        // Registrar listeners
        eventBus.onTenant('new_message', tenantId, onNewMessage);
        eventBus.onTenant('message_status', tenantId, onMessageStatus);
        eventBus.onTenant('typing_indicator', tenantId, onTyping);
        eventBus.onTenant('connection_update', tenantId, onConnection);

        // Cleanup ao desconectar
        request.signal.addEventListener('abort', () => {
          clearInterval(heartbeat);
          eventBus.offTenant('new_message', tenantId, onNewMessage);
          eventBus.offTenant('message_status', tenantId, onMessageStatus);
          eventBus.offTenant('typing_indicator', tenantId, onTyping);
          eventBus.offTenant('connection_update', tenantId, onConnection);
          try { controller.close(); } catch { /* already closed */ }
        });

        // Enviar evento inicial de conexão
        const connectEvent = `data: ${JSON.stringify({ type: 'connected', data: { tenant_id: tenantId }, timestamp: new Date().toISOString() })}\n\n`;
        controller.enqueue(encoder.encode(connectEvent));
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
