/**
 * DELETE /api/meta/campanhas/[id]
 * Exclui um draft de campanha do banco e arquiva no Meta (se tiver meta_campaign_id).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { resolverTokenMeta } from '@/lib/services/meta-token.service';
import { META_BASE } from '@/lib/meta-config';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  // Busca o draft para pegar o meta_campaign_id
  const { data: draft } = await supabase
    .from('meta_campaign_drafts')
    .select('id, meta_campaign_id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();

  if (!draft) {
    return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });
  }

  // Arquiva no Meta se tiver ID
  let metaArquivada = false;
  let metaErro: string | null = null;
  if (draft.meta_campaign_id) {
    try {
      const config = await resolverTokenMeta(tenantId);
      const res = await fetch(`${META_BASE}/${draft.meta_campaign_id}?access_token=${config.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ARCHIVED' }),
        signal: AbortSignal.timeout(10_000),
      });
      metaArquivada = res.ok;
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { message: string } };
        metaErro = err.error?.message ?? `HTTP ${res.status}`;
      }
    } catch (err) {
      metaErro = String(err);
    }
  }

  // Remove do banco independente do resultado no Meta
  const { error: dbError } = await supabase
    .from('meta_campaign_drafts')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    meta_arquivada: metaArquivada,
    meta_erro: metaErro,
  });
}
