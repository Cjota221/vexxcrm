import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/clients
 * Lista clientes do tenant.
 *
 * POST /api/clients
 * Cria novo cliente.
 */
export async function GET(request: NextRequest) {
  // TODO: Implementar busca real no Supabase com filtros
  return NextResponse.json({
    data: [],
    total: 0,
    page: 1,
    per_page: 20,
    total_pages: 0,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // TODO: Criar cliente no Supabase com PhoneNormalizer
    return NextResponse.json({ data: body }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
