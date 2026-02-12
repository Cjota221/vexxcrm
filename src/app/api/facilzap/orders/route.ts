import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/facilzap/orders
 * Busca pedidos da FacilZap.
 */
export async function GET(request: NextRequest) {
  // TODO: Implementar integração real com FacilZap API
  return NextResponse.json({
    data: [],
    total: 0,
    page: 1,
    per_page: 50,
    total_pages: 0,
  });
}
