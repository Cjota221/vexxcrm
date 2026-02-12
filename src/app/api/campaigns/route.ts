import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/campaigns
 * Lista campanhas do tenant.
 *
 * POST /api/campaigns
 * Cria nova campanha.
 */
export async function GET() {
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
    return NextResponse.json({ data: body }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
