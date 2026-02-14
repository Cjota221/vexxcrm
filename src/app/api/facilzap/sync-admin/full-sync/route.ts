/**
 * POST /api/facilzap/sync-admin/full-sync
 *
 * Executa sync completo resiliente com paginação, retry e checkpoints.
 * Body: { pageSize?: number, maxPages?: number, checkpointInterval?: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/auth-admin';
import { ResilientSyncService } from '@/lib/services/resilient-sync';
import type { SyncConfig } from '@/lib/services/resilient-sync';

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request);
    if (auth instanceof NextResponse) return auth;

    if (!auth.facilzapToken) {
      return NextResponse.json(
        { error: 'Token FacilZap não configurado', needsConfig: true },
        { status: 400 }
      );
    }

    let body: Partial<SyncConfig> = {};
    try { body = await request.json(); } catch { body = {}; }

    const config: SyncConfig = {
      pageSize: body.pageSize || 100,
      maxPages: body.maxPages || 500,
      checkpointInterval: body.checkpointInterval || 10,
      triggerSource: 'manual',
    };

    const syncService = new ResilientSyncService(
      auth.supabase,
      auth.tenantId,
      { token: auth.facilzapToken, storeUrl: '' }
    );

    const result = await syncService.executeFullSync(config);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    console.error('[API] sync-admin/full-sync error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
