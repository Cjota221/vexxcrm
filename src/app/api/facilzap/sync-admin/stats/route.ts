/**
 * GET /api/facilzap/sync-admin/stats
 *
 * Retorna estatísticas gerais do tenant: totais, órfãos, score de qualidade.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/auth-admin';
import { SyncAuditorService } from '@/lib/services/sync-auditor';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const auditor = new SyncAuditorService(
      auth.supabase,
      auth.tenantId,
      { token: auth.facilzapToken || '', storeUrl: '' }
    );

    const stats = await auditor.getStats();

    return NextResponse.json({ success: true, data: stats });
  } catch (error: unknown) {
    console.error('[API] sync-admin/stats error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
