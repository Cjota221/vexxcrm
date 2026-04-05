import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { META_BASE } from '@/lib/meta-config';

function n(v: string | undefined | null): number {
  return parseFloat(v || '0') || 0;
}

/**
 * GET  /api/meta/catalog          — lista catálogos de produtos da conta
 * GET  /api/meta/catalog?catalog_id=X — lista produtos de um catálogo
 * POST /api/meta/catalog           — cria anúncio dinâmico (DPA) a partir de um catálogo
 */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const catalogId   = req.nextUrl.searchParams.get('catalog_id');

    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_ad_account_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token) {
      return NextResponse.json({ error: 'Meta não configurado' }, { status: 400 });
    }

    const token     = config.meta_access_token;
    const accountId = config.meta_ad_account_id;

    // Listar produtos de um catálogo específico
    if (catalogId) {
      const fields = 'id,name,description,price,sale_price,availability,url,image_url,brand,category,currency';
      const res = await fetch(
        `${META_BASE}/${catalogId}/products` +
        `?fields=${encodeURIComponent(fields)}&limit=50&access_token=${token}`
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
        return NextResponse.json({ error: err.error?.message || `Meta API ${res.status}` }, { status: 502 });
      }

      const data = await res.json() as {
        data: Array<{
          id: string; name: string; description?: string; price?: string; sale_price?: string;
          availability?: string; url?: string; image_url?: string; brand?: string;
          category?: string; currency?: string;
        }>;
        paging?: { cursors?: { after?: string }; next?: string };
      };

      const products = (data.data || []).map(p => ({
        id:           p.id,
        nome:         p.name,
        descricao:    p.description || '',
        preco:        n(p.price) / 100,
        preco_oferta: p.sale_price ? n(p.sale_price) / 100 : null,
        disponivel:   p.availability === 'in stock',
        url:          p.url || '',
        imagem:       p.image_url || '',
        marca:        p.brand || '',
        categoria:    p.category || '',
        moeda:        p.currency || 'BRL',
      }));

      return NextResponse.json({ catalog_id: catalogId, products, total: products.length });
    }

    // Listar todos os catálogos da conta
    if (!accountId) {
      return NextResponse.json({ error: 'meta_ad_account_id não configurado' }, { status: 400 });
    }

    const res = await fetch(
      `${META_BASE}/${accountId}/product_catalogs` +
      `?fields=id,name,product_count,feed_count,vertical&access_token=${token}`
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      return NextResponse.json({ error: err.error?.message || `Meta API ${res.status}` }, { status: 502 });
    }

    const data = await res.json() as {
      data: Array<{
        id: string; name: string; product_count?: number; feed_count?: number; vertical?: string;
      }>;
    };

    const catalogs = (data.data || []).map(c => ({
      id:             c.id,
      nome:           c.name,
      total_produtos: c.product_count || 0,
      total_feeds:    c.feed_count || 0,
      vertical:       c.vertical || 'commerce',
    }));

    return NextResponse.json({ catalogs });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as {
      catalog_id: string;
      campaign_id?: string;
      adset_name?: string;
      ad_name?: string;
      daily_budget?: number;
      // Targeting
      age_min?: number;
      age_max?: number;
      genders?: number[];
      geo_locations?: { countries?: string[]; cities?: Array<{ key: string; name: string }> };
    };

    if (!body.catalog_id) {
      return NextResponse.json({ error: 'catalog_id obrigatório' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_ad_account_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token || !config?.meta_ad_account_id) {
      return NextResponse.json({ error: 'Meta não configurado' }, { status: 400 });
    }

    const token     = config.meta_access_token;
    const accountId = config.meta_ad_account_id;

    // 1. Criar product set (todos os produtos do catálogo)
    const psParams = new URLSearchParams();
    psParams.set('name', `Set - ${body.ad_name || 'Todos os produtos'}`);
    psParams.set('filter', JSON.stringify({})); // todos
    psParams.set('access_token', token);

    const psRes = await fetch(`${META_BASE}/${body.catalog_id}/product_sets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: psParams.toString(),
    });

    const psData = await psRes.json() as { id?: string; error?: { message?: string } };
    if (!psData.id) {
      return NextResponse.json({ error: `Erro ao criar product set: ${psData.error?.message || 'desconhecido'}` }, { status: 502 });
    }
    const productSetId = psData.id;

    // 2. Se campaign_id foi fornecido, só criar adset + ad; caso contrário criar campanha também
    let campaignId = body.campaign_id;

    if (!campaignId) {
      const campParams = new URLSearchParams();
      campParams.set('name', `[DPA] ${body.adset_name || 'Campanha dinâmica'}`);
      campParams.set('objective', 'PRODUCT_CATALOG_SALES');
      campParams.set('promoted_object', JSON.stringify({ product_catalog_id: body.catalog_id }));
      campParams.set('status', 'PAUSED');
      campParams.set('access_token', token);

      const campRes = await fetch(`${META_BASE}/${accountId}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: campParams.toString(),
      });

      const campData = await campRes.json() as { id?: string; error?: { message?: string } };
      if (!campData.id) {
        return NextResponse.json({ error: `Erro ao criar campanha: ${campData.error?.message || 'desconhecido'}` }, { status: 502 });
      }
      campaignId = campData.id;
    }

    // 3. Criar adset
    const targeting = {
      age_min:       body.age_min || 25,
      age_max:       body.age_max || 55,
      genders:       body.genders || [1, 2],
      geo_locations: body.geo_locations || { countries: ['BR'] },
    };

    const adsetParams = new URLSearchParams();
    adsetParams.set('name', body.adset_name || 'Conjunto dinâmico');
    adsetParams.set('campaign_id', campaignId!);
    adsetParams.set('promoted_object', JSON.stringify({ product_set_id: productSetId }));
    adsetParams.set('optimization_goal', 'OFFSITE_CONVERSIONS');
    adsetParams.set('billing_event', 'IMPRESSIONS');
    adsetParams.set('daily_budget', String(Math.round((body.daily_budget || 50) * 100)));
    adsetParams.set('targeting', JSON.stringify(targeting));
    adsetParams.set('status', 'PAUSED');
    adsetParams.set('access_token', token);

    const adsetRes = await fetch(`${META_BASE}/${accountId}/adsets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: adsetParams.toString(),
    });

    const adsetData = await adsetRes.json() as { id?: string; error?: { message?: string } };
    if (!adsetData.id) {
      return NextResponse.json({ error: `Erro ao criar conjunto: ${adsetData.error?.message || 'desconhecido'}` }, { status: 502 });
    }

    // 4. Criar ad criativo dinâmico
    const creativeParams = new URLSearchParams();
    creativeParams.set('name', `Criativo dinâmico - ${body.ad_name || 'DPA'}`);
    creativeParams.set('object_story_spec', JSON.stringify({
      template_data: {
        message: '{{product.description}}',
        link:     '{{product.url}}',
        name:     '{{product.name}}',
        call_to_action: { type: 'SHOP_NOW' },
      },
    }));
    creativeParams.set('product_set_id', productSetId);
    creativeParams.set('access_token', token);

    const creativeRes = await fetch(`${META_BASE}/${accountId}/adcreatives`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: creativeParams.toString(),
    });

    const creativeData = await creativeRes.json() as { id?: string; error?: { message?: string } };
    if (!creativeData.id) {
      // Retornar sucesso parcial (campanha + conjunto criados)
      return NextResponse.json({
        ok: true,
        campaign_id: campaignId,
        adset_id: adsetData.id,
        product_set_id: productSetId,
        aviso: `Criativo dinâmico não criado: ${creativeData.error?.message || 'erro desconhecido'}. Configure manualmente no Gerenciador.`,
      });
    }

    // 5. Criar anúncio
    const adParams = new URLSearchParams();
    adParams.set('name', body.ad_name || 'Anúncio dinâmico');
    adParams.set('adset_id', adsetData.id);
    adParams.set('creative', JSON.stringify({ creative_id: creativeData.id }));
    adParams.set('status', 'PAUSED');
    adParams.set('access_token', token);

    const adRes = await fetch(`${META_BASE}/${accountId}/ads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: adParams.toString(),
    });

    const adData = await adRes.json() as { id?: string; error?: { message?: string } };

    return NextResponse.json({
      ok: true,
      campaign_id:    campaignId,
      adset_id:       adsetData.id,
      creative_id:    creativeData.id,
      ad_id:          adData.id,
      product_set_id: productSetId,
      status:         'PAUSED',
      aviso:          'Campanha DPA criada em status PAUSED. Ative no Gerenciador após revisar.',
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
