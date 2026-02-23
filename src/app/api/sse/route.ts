import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/sse
 *
 * ⚠️  DEPRECATED — Este endpoint SSE foi desativado.
 *
 * O SSE via Node EventEmitter NÃO funciona em ambiente serverless (Netlify/Vercel)
 * porque cada invocação de função roda em processo isolado. O webhook chega na
 * instância A, o SSE está escutando na instância B → eventos nunca cruzam.
 *
 * Substituto: Supabase Realtime (WebSocket direto ao Supabase), implementado em
 * src/hooks/useRealtimeMessages.ts — canal global-new-messages SUBSCRIBED ✅
 *
 * Retornamos 204 imediatamente para evitar conexões abertas por 60s desperdiçando
 * memória e timeout do Netlify.
 */
export async function GET(_request: NextRequest) {
  // Encerrar imediatamente — não há eventos para enviar via SSE nesta arquitetura.
  // O cliente usa Supabase Realtime WebSocket diretamente.
  return new NextResponse(null, { status: 204 });

}
