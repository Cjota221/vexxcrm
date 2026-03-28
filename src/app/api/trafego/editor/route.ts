import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import {
  editarTextoAnuncio,
  mudarOrcamento,
  alterarStatus,
  duplicarCampanha,
} from '@/lib/services/meta-editor.service';

/**
 * POST /api/trafego/editor
 * Executa uma ação de edição no Meta Ads.
 * Body: { action, ...params }
 * Actions: 'editar_texto' | 'mudar_orcamento' | 'alterar_status' | 'duplicar'
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as Record<string, unknown>;
    const { action } = body;

    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_ad_account_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token) {
      return NextResponse.json({ error: 'Meta Ads não configurado' }, { status: 400 });
    }

    const token = config.meta_access_token;
    const accountId = config.meta_ad_account_id;

    switch (action) {
      case 'editar_texto': {
        const result = await editarTextoAnuncio({
          adId: body.adId as string,
          accountId,
          titulo: body.titulo as string,
          texto: body.texto as string,
          cta: body.cta as string,
          imageUrl: body.imageUrl as string | undefined,
          videoId: body.videoId as string | undefined,
          token,
        });
        return NextResponse.json(result);
      }

      case 'mudar_orcamento': {
        const result = await mudarOrcamento({
          campaignId: body.campaignId as string,
          novoOrcamentoCentavos: body.novoOrcamentoCentavos as number,
          orcamentoAtualCentavos: body.orcamentoAtualCentavos as number,
          token,
        });
        return NextResponse.json(result);
      }

      case 'alterar_status': {
        const result = await alterarStatus({
          id: body.id as string,
          novoStatus: body.novoStatus as 'ACTIVE' | 'PAUSED',
          token,
        });
        return NextResponse.json(result);
      }

      case 'duplicar': {
        const result = await duplicarCampanha({
          campaignId: body.campaignId as string,
          token,
        });
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: `Ação desconhecida: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
