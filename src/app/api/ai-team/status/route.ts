import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { getAgentStatus } from '@/lib/services/ai-team-orchestrator.service';

export async function GET(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const status = await getAgentStatus(profile.tenant_id);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
