import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/auth-admin';
import { fetchOrders } from '@/lib/services/facilzap.service';

/**
 * GET /api/facilzap/orders
 * Busca pedidos diretamente da API FacilZap (sem passar pelo banco).
 *
 * Query params:
 * - page: número da página (padrão: 1)
 * - length: itens por página (padrão: 100)
 * - status: filtrar por status
 * - data_inicial: YYYY-MM-DD
 * - data_final: YYYY-MM-DD
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { facilzapToken } = auth;
    if (!facilzapToken) {
      return NextResponse.json(
        { error: 'Token FacilZap não configurado', needsConfig: true },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') ?? 1));
    const length = Math.min(100, Math.max(1, Number(searchParams.get('length') ?? 100)));
    const status = searchParams.get('status') ?? undefined;
    const data_inicial = searchParams.get('data_inicial') ?? undefined;
    const data_final = searchParams.get('data_final') ?? undefined;

    const { orders, hasMore } = await fetchOrders(
      { token: facilzapToken },
      page,
      length,
      { status, data_inicial, data_final }
    );

    return NextResponse.json({
      data: orders,
      total: orders.length,
      page,
      per_page: length,
      has_more: hasMore,
    });
  } catch (error: any) {
    console.error('[facilzap/orders] Erro:', error?.message);
    return NextResponse.json({ error: error?.message ?? 'Erro interno' }, { status: 500 });
  }
}
