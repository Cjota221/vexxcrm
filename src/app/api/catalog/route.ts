import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

import { META_BASE } from '@/lib/meta-config';

/** GET /api/catalog — list catalogs and products */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const supabase = createServerSupabaseClient();

    const [catalogRes, productsRes] = await Promise.all([
      supabase.from('meta_catalog').select('*').eq('tenant_id', profile.tenant_id),
      supabase.from('meta_catalog_products').select('*').eq('tenant_id', profile.tenant_id).order('created_at', { ascending: false }).limit(100),
    ]);

    return NextResponse.json({
      catalogs: catalogRes.data || [],
      products: productsRes.data || [],
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** POST /api/catalog — create product locally + optionally sync to Meta */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as {
      catalog_id?: string; // local UUID
      titulo: string;
      descricao?: string;
      preco: number; // em reais
      disponibilidade?: string;
      condicao?: string;
      image_url?: string;
      link_produto?: string;
      marca?: string;
      sku?: string;
      sincronizar_meta?: boolean;
    };

    const supabase = createServerSupabaseClient();

    const { data: product, error } = await supabase
      .from('meta_catalog_products')
      .insert({
        tenant_id: profile.tenant_id,
        catalog_id: body.catalog_id || null,
        titulo: body.titulo,
        descricao: body.descricao,
        preco: Math.round((body.preco || 0) * 100),
        disponibilidade: body.disponibilidade || 'in stock',
        condicao: body.condicao || 'new',
        image_url: body.image_url,
        link_produto: body.link_produto,
        marca: body.marca,
        sku: body.sku,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Sync to Meta catalog if requested and catalog has meta_catalog_id
    let metaItemId: string | undefined;
    if (body.sincronizar_meta && body.catalog_id) {
      try {
        const { data: catalog } = await supabase
          .from('meta_catalog')
          .select('meta_catalog_id')
          .eq('id', body.catalog_id)
          .single();

        const { data: config } = await supabase
          .from('ai_provider_config')
          .select('meta_access_token')
          .eq('tenant_id', profile.tenant_id)
          .single();

        if (catalog?.meta_catalog_id && config?.meta_access_token) {
          const res = await fetch(`${META_BASE}/${catalog.meta_catalog_id}/items_batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              access_token: config.meta_access_token,
              requests: [{
                method: 'CREATE',
                data: {
                  id: product!.id,
                  availability: body.disponibilidade || 'in stock',
                  condition: body.condicao || 'new',
                  description: body.descricao || body.titulo,
                  image_link: body.image_url || '',
                  link: body.link_produto || '',
                  title: body.titulo,
                  price: `${body.preco} BRL`,
                  brand: body.marca || '',
                },
              }],
            }),
          });
          if (res.ok) {
            const data = await res.json() as { handles?: string[] };
            metaItemId = data.handles?.[0];
            await supabase.from('meta_catalog_products').update({ meta_item_id: metaItemId, sincronizado_em: new Date().toISOString() }).eq('id', product!.id);
          }
        }
      } catch { /* sync failure is non-fatal */ }
    }

    return NextResponse.json({ ok: true, product, metaItemId });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** PATCH /api/catalog — create Meta catalog via API */
export async function PATCH(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as { nome: string; criar_meta?: boolean };
    const supabase = createServerSupabaseClient();

    let metaCatalogId: string | undefined;

    if (body.criar_meta) {
      const { data: config } = await supabase
        .from('ai_provider_config')
        .select('meta_access_token')
        .eq('tenant_id', profile.tenant_id)
        .single();

      if (config?.meta_access_token) {
        const res = await fetch(`${META_BASE}/me/owned_product_catalogs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: body.nome, access_token: config.meta_access_token }),
        });
        if (res.ok) {
          const data = await res.json() as { id?: string };
          metaCatalogId = data.id;
        }
      }
    }

    const { data, error } = await supabase.from('meta_catalog').insert({
      tenant_id: profile.tenant_id,
      nome: body.nome,
      meta_catalog_id: metaCatalogId,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, catalog: data, metaCatalogId });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** DELETE /api/catalog?product_id=UUID — remove product */
export async function DELETE(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const productId = req.nextUrl.searchParams.get('product_id');
    if (!productId) return NextResponse.json({ error: 'product_id obrigatório' }, { status: 400 });

    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from('meta_catalog_products')
      .delete()
      .eq('id', productId)
      .eq('tenant_id', profile.tenant_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
