/**
 * POST /api/facilzap/sync-admin/audit
 *
 * Executa auditoria forense completa: checksum + divergências + score.
 * Body: { mode?: 'full' | 'quick' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/auth-admin';
import { SyncAuditorService } from '@/lib/services/sync-auditor';

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

    let body: { mode?: string } = {};
    try { body = await request.json(); } catch { body = {}; }
    const mode = body.mode || 'full';

    const auditor = new SyncAuditorService(
      auth.supabase,
      auth.tenantId,
      { token: auth.facilzapToken, storeUrl: '' }
    );

    if (mode === 'quick') {
      const result = await auditor.runQuickAudit();
      return NextResponse.json({ success: true, mode: 'quick', data: result });
    }

    const result = await auditor.runFullAudit();
    return NextResponse.json({ success: true, mode: 'full', data: result });
  } catch (error: unknown) {
    console.error('[API] sync-admin/audit error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
