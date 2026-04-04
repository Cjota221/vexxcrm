/**
 * GET /api/meta/criativos-cache
 * Retorna itens de meta_creatives_cache para o tenant.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

async function getTenantId(req: NextRequest): Promise<string | null> {
  const tenantId = req.headers.get('x-tenant-id');
  if (tenantId) return tenantId;
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
  return data?.tenant_id ?? null;
}

export async function GET(req: NextRequest) {
  const tenantId = await getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('meta_creatives_cache')
    .select('id, nome, tipo, url_thumb, url_full, duracao, sincronizado_em')
    .eq('tenant_id', tenantId)
    .order('sincronizado_em', { ascending: false })
    .limit(100);

  return NextResponse.json(data ?? []);
}
