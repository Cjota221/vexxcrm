/**
 * POST /api/meta/publicos/video
 * Cria Custom Audience de engajamento com vídeos selecionados.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { criarPublicoEngajamentoVideo } from '@/lib/services/meta-publicos-cj.service';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const { video_ids, percentual = 25, dias = 30 } = await req.json() as {
    video_ids: string[];
    percentual?: number;
    dias?: number;
  };

  if (!video_ids?.length) {
    return NextResponse.json({ error: 'Selecione ao menos um vídeo' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: config } = await supabase
    .from('ai_provider_config')
    .select('meta_access_token, meta_ad_account_id')
    .eq('tenant_id', tenantId)
    .single();

  if (!config?.meta_access_token || !config?.meta_ad_account_id) {
    return NextResponse.json({ error: 'Meta Ads não configurado' }, { status: 400 });
  }

  try {
    const id = await criarPublicoEngajamentoVideo(
      config.meta_ad_account_id,
      config.meta_access_token,
      tenantId,
      video_ids,
      percentual,
      dias,
    );

    if (!id) {
      return NextResponse.json({ error: 'Meta não retornou ID do público' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, meta_audience_id: id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
