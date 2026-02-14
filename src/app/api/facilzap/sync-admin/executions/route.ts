/**
 * GET /api/facilzap/sync-admin/executions
 *
 * Histórico de execuções de sync do tenant.
 * Query: ?limit=20
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/auth-admin';
import { SyncAuditorService } from '@/lib/services/sync-auditor';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);

    const auditor = new SyncAuditorService(
      auth.supabase,
      auth.tenantId,
      { token: auth.facilzapToken || '', storeUrl: '' }
    );

    const executions = await auditor.getExecutionHistory(limit);

    return NextResponse.json({ success: true, data: executions });
  } catch (error: unknown) {
    console.error('[API] sync-admin/executions error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
