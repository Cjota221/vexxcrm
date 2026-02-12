import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/facilzap/cart-link
 * Gera link de carrinho FacilZap.
 */
export async function POST(request: NextRequest) {
  // TODO: Implementar geração de link de carrinho
  return NextResponse.json({
    data: { url: null, message: 'Funcionalidade em implementação' },
  });
}
