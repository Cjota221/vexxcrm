/**
 * POST /api/jarvis/criar-campanha
 * Endpoint interno chamado pelo executor de tools do Jarvis.
 * Cria campanha completa no Meta Ads v25.0 (sempre PAUSED).
 *
 * Body: { tenantId, campaign, adset, creative, adName }
 * Retorna: FullCampaignResult
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import {
  createFullCampaign,
  type CampaignParams,
  type AdSetParams,
  type AdCreativeParams,
} from '@/lib/meta/campaign-creator';

// Por enquanto apenas CJ — multi-tenant vem depois
const CJ_TENANT_ID = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      tenantId: string;
      campaign: CampaignParams;
      adset:    Omit<AdSetParams, 'campaignId'>;
      creative: AdCreativeParams;
      adName:   string;
    };

    if (!body.tenantId || body.tenantId !== CJ_TENANT_ID) {
      return NextResponse.json({ error: 'Tenant não autorizado' }, { status: 403 });
    }

    if (!body.campaign?.name || !body.creative?.link || !body.adset?.dailyBudget) {
      return NextResponse.json(
        { error: 'Parâmetros obrigatórios ausentes: campaign.name, creative.link, adset.dailyBudget' },
        { status: 400 },
      );
    }

    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token')
      .eq('tenant_id', body.tenantId)
      .single();

    const token = config?.meta_access_token ?? process.env.META_ACCESS_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: 'Token Meta não configurado. Configure em Tráfego → Configurações.' },
        { status: 400 },
      );
    }

    const result = await createFullCampaign(
      body.campaign,
      body.adset,
      body.creative,
      body.adName ?? `${body.campaign.name} — Anúncio`,
      token,
    );

    // Registrar na jarvis_memoria para fechar o loop de aprendizado
    if (result?.campaignId) {
      supabase.from('jarvis_memoria').insert({
        tenant_id:    body.tenantId,
        tipo:         'campanha_resultado',
        referencia_id: result.campaignId,
        titulo:       body.campaign.name,
        contexto: {
          origem:              'jarvis_chat',
          meta_campaign_id:    result.campaignId,
          objetivo:            body.campaign.objective ?? 'OUTCOME_TRAFFIC',
          orcamento_diario:    body.adset.dailyBudget,
          criado_em:           new Date().toISOString(),
        },
        resultado:   null,
        aprendizado: null,
      }).then(({ error: memErr }) => {
        if (memErr) console.warn('[jarvis/criar-campanha] Erro ao salvar memória:', memErr.message);
      });
    }

    return NextResponse.json(result);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[jarvis/criar-campanha] Erro:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
