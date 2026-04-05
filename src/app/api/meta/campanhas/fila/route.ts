/**
 * GET /api/meta/campanhas/fila
 * Lista campanhas aguardando aprovação (criadas pelo agente, status != publicado/rejeitado)
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
    .from('meta_campaign_drafts')
    .select(`
      id, nome, tipo, status, orcamento_diario,
      copy_headline, copy_texto, copy_cta,
      meta_campaign_id, meta_adset_id, meta_ad_id,
      created_at, criativo_id, criativo_url_preview,
      ad_creatives (nome, url_preview, classificacao)
    `)
    .eq('tenant_id', tenantId)
    .in('status', ['rascunho', 'aprovado', 'publicando', 'erro'])
    .order('created_at', { ascending: false });

  return NextResponse.json(data ?? []);
}
