import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/auth-admin';
import { fetchKanbanCards } from '@/lib/services/facilzap.service';

/**
 * GET /api/facilzap/kanban
 * Proxy para GET /kanban/cards da API FacilZap.
 *
 * Query params:
 * - coluna_id: filtrar por coluna específica (number)
 * - arquivado: '1' = arquivados, '0' = ativos (padrão: todos)
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
    const coluna_id = searchParams.get('coluna_id');
    const arquivado = searchParams.get('arquivado');

    const cards = await fetchKanbanCards(
      { token: facilzapToken },
      {
        coluna_id: coluna_id ? Number(coluna_id) : undefined,
        arquivado: arquivado === '1' ? true : arquivado === '0' ? false : undefined,
      }
    );

    return NextResponse.json({ data: cards, total: cards.length });
  } catch (error: any) {
    console.error('[facilzap/kanban] Erro:', error?.message);
    return NextResponse.json({ error: error?.message ?? 'Erro interno' }, { status: 500 });
  }
}
