/**
 * GET /api/v2/anne/feed
 * Retorna as últimas execuções da Anne para o feed em tempo real do painel.
 *
 * Query params:
 *   limit → máx 50, padrão 20
 *
 * Response: AnneFeedEntry[]
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

export interface AnneFeedEntry {
  id: string;
  created_at: string;
  duration_ms: number | null;
  intent: string | null;
  agent_used: string | null;
  is_crisis: boolean;
  action_taken: string | null;
  client_name: string | null;
  client_phone: string | null;
}

export async function GET(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId ?? auth.profile?.tenant_id;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || '20'), 50);

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('anne_logs_v2')
    .select(`
      id,
      created_at,
      duration_ms,
      intent,
      agent_used,
      is_crisis,
      action_taken,
      clients ( name, phone )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const feed: AnneFeedEntry[] = (data ?? []).map((row: Record<string, unknown>) => {
    const client = row.clients as { name?: string; phone?: string } | null;
    return {
      id: row.id as string,
      created_at: row.created_at as string,
      duration_ms: row.duration_ms as number | null,
      intent: row.intent as string | null,
      agent_used: row.agent_used as string | null,
      is_crisis: Boolean(row.is_crisis),
      action_taken: row.action_taken as string | null,
      client_name: client?.name ?? null,
      client_phone: client?.phone ?? null,
    };
  });

  return NextResponse.json(feed);
}
