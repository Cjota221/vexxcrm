/**
 * POST /api/trafego/publicos/[id]/publicar-meta
 * Cria Custom Audience real no Meta para públicos de remarketing ou lookalike.
 * Públicos de interesse não precisam ser criados no Meta (targeting é aplicado no adset).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { criarPublicoRemarketing } from '@/lib/services/meta-audiences.service';
import { criarLookalikeClientes } from '@/lib/services/meta-publicos-cj.service';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  // Buscar o público no banco
  const { data: publico, error: fetchError } = await supabase
    .from('meta_audiences')
    .select('id, tipo, meta_audience_id, nome')
    .eq('id', params.id)
    .eq('tenant_id', tenantId)
    .single();

  if (fetchError || !publico) {
    return NextResponse.json({ error: 'Público não encontrado' }, { status: 404 });
  }

  if (publico.meta_audience_id) {
    return NextResponse.json({ ok: true, meta_audience_id: publico.meta_audience_id, already_exists: true });
  }

  if (publico.tipo === 'interesse') {
    return NextResponse.json({
      error: 'Públicos de interesse não precisam ser criados no Meta — são aplicados diretamente no adset.',
    }, { status: 400 });
  }

  // Buscar config Meta do tenant
  const { data: config } = await supabase
    .from('ai_provider_config')
    .select('meta_access_token, meta_ad_account_id, meta_page_id')
    .eq('tenant_id', tenantId)
    .single();

  if (!config?.meta_access_token || !config?.meta_ad_account_id) {
    return NextResponse.json({ error: 'Meta Ads não configurado' }, { status: 400 });
  }

  const accountId = config.meta_ad_account_id.replace('act_', '');
  const token = config.meta_access_token;
  const pageId = config.meta_page_id ?? '';

  try {
    let metaAudienceId: string | null = null;

    if (publico.tipo === 'remarketing') {
      const resultado = await criarPublicoRemarketing(accountId, token, tenantId, pageId, 30);
      metaAudienceId = resultado.meta_audience_id ?? null;
    } else if (publico.tipo === 'lookalike') {
      metaAudienceId = await criarLookalikeClientes(accountId, token, tenantId);
    } else {
      return NextResponse.json({ error: `Tipo '${publico.tipo}' não suportado` }, { status: 400 });
    }

    if (!metaAudienceId) {
      return NextResponse.json({ error: 'Meta não retornou ID do público' }, { status: 500 });
    }

    // Atualizar banco com o ID real do Meta
    await supabase
      .from('meta_audiences')
      .update({ meta_audience_id: metaAudienceId, status: 'pronto' })
      .eq('id', params.id);

    return NextResponse.json({ ok: true, meta_audience_id: metaAudienceId });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
