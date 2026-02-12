import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/products
 * Lista produtos do tenant.
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    data: [],
    total: 0,
    page: 1,
    per_page: 50,
    total_pages: 0,
  });
}
