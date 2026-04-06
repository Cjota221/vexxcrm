import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import {
  editarTextoAnuncio,
  mudarOrcamento,
  alterarStatus,
  duplicarCampanha,
} from '@/lib/services/meta-editor.service';
import { META_BASE } from '@/lib/meta-config';

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
        // Resolver o ad_id real a partir do campaign_id
        const campaignId = body.campaign_id as string;
        const adsetRes = await fetch(
          `${META_BASE}/${campaignId}/adsets?fields=id&limit=1&access_token=${token}`
        );
        const adsetData = await adsetRes.json() as { data: Array<{ id: string }> };
        const adsetId = adsetData.data?.[0]?.id;
        if (!adsetId) return NextResponse.json({ error: 'Nenhum conjunto encontrado nesta campanha' }, { status: 404 });

        const adsRes = await fetch(
          `${META_BASE}/${adsetId}/ads?fields=id&limit=1&access_token=${token}`
        );
        const adsData = await adsRes.json() as { data: Array<{ id: string }> };
        const adId = adsData.data?.[0]?.id;
        if (!adId) return NextResponse.json({ error: 'Nenhum anúncio encontrado neste conjunto' }, { status: 404 });

        const result = await editarTextoAnuncio({
          adId,
          accountId,
          titulo: body.titulo as string,
          texto: body.texto_principal as string,
          cta: body.cta as string,
          imageUrl: body.imageUrl as string | undefined,
          videoId: body.videoId as string | undefined,
          token,
        });
        return NextResponse.json(result);
      }

      case 'mudar_orcamento': {
        const result = await mudarOrcamento({
          campaignId: body.campaign_id as string,
          novoOrcamentoCentavos: body.novo_orcamento_diario as number,
          orcamentoAtualCentavos: (body.orcamento_atual_centavos as number) ?? 0,
          token,
        });
        return NextResponse.json(result);
      }

      case 'alterar_status': {
        const result = await alterarStatus({
          id: body.campaign_id as string,
          novoStatus: body.status as 'ACTIVE' | 'PAUSED',
          token,
        });
        return NextResponse.json(result);
      }

      case 'duplicar': {
        const result = await duplicarCampanha({
          campaignId: body.campaign_id as string,
          token,
        });
        return NextResponse.json(result);
      }

      case 'deletar_campanha': {
        const campaignId = body.campaign_id as string;
        if (!campaignId) return NextResponse.json({ error: 'campaign_id obrigatório' }, { status: 400 });

        // 1. Tentar deletar na Meta API (falha silenciosamente se ID inválido/já deletado)
        try {
          const metaRes = await fetch(
            `${META_BASE}/${campaignId}?access_token=${token}`,
            { method: 'DELETE' },
          );
          const metaJson = await metaRes.json() as { success?: boolean; error?: { message: string } };
          if (!metaRes.ok && metaJson.error) {
            console.warn('[deletar_campanha] Meta API:', metaJson.error.message);
          }
        } catch (e) {
          console.warn('[deletar_campanha] Meta API falhou:', e);
        }

        // 2. Remover do cache local — tentar por id (UUID do Supabase) e por campaign_id (ID Meta)
        await supabase
          .from('meta_campaigns_cache')
          .delete()
          .eq('id', campaignId)
          .eq('tenant_id', profile.tenant_id);

        await supabase
          .from('meta_campaigns_cache')
          .delete()
          .eq('campaign_id', campaignId)
          .eq('tenant_id', profile.tenant_id);

        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: `Ação desconhecida: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
