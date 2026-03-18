import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/auth-admin';
import { fetchClients } from '@/lib/services/facilzap.service';

/**
 * GET /api/facilzap/clients
 * Busca clientes diretamente da API FacilZap (sem passar pelo banco).
 *
 * Query params:
 * - page: número da página (padrão: 1)
 * - length: itens por página (padrão: 100)
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

    const { clients, hasMore } = await fetchClients({ token: facilzapToken }, page, length);

    return NextResponse.json({
      data: clients,
      total: clients.length,
      page,
      per_page: length,
      has_more: hasMore,
    });
  } catch (error: any) {
    console.error('[facilzap/clients] Erro:', error?.message);
    return NextResponse.json({ error: error?.message ?? 'Erro interno' }, { status: 500 });
  }
}
