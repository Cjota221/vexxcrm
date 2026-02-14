/**
 * POST /api/facilzap/sync-admin/repair-orphans
 *
 * Repara pedidos órfãos: re-vincula + auto-cria clientes faltantes.
 * Body: { createMissingClients?: boolean, batchSize?: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/auth-admin';
import { OrphanLinkerService } from '@/lib/services/orphan-linker';

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request);
    if (auth instanceof NextResponse) return auth;

    let body: { createMissingClients?: boolean; batchSize?: number } = {};
    try { body = await request.json(); } catch { body = {}; }

    const linker = new OrphanLinkerService(auth.supabase, auth.tenantId);

    const result = await linker.repairAll({
      createMissingClients: body.createMissingClients !== false,
      batchSize: body.batchSize || 500,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    console.error('[API] sync-admin/repair-orphans error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
