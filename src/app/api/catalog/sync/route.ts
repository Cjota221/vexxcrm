import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

import { META_BASE } from '@/lib/meta-config';

/**
 * POST /api/catalog/sync
 * Imports catalogs and products from Meta Business API into local DB.
 * All network calls run in parallel to fit within the 26s Netlify timeout.
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const supabase = createServerSupabaseClient();

    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token) {
      return NextResponse.json({ error: 'Token Meta não configurado' }, { status: 400 });
    }

    const token = config.meta_access_token;

    // Step 1: fetch businesses + personal catalogs in parallel
    const [bizRes, myCatRes] = await Promise.all([
      fetch(`${META_BASE}/me/businesses?fields=id,name&limit=5&access_token=${token}`),
      fetch(`${META_BASE}/me/owned_product_catalogs?fields=id,name&limit=10&access_token=${token}`),
    ]);

    const allCatalogIds = new Set<string>();
    const catalogsToSync: Array<{ meta_catalog_id: string; nome: string }> = [];

    // Collect personal catalogs
    if (myCatRes.ok) {
      const d = await myCatRes.json() as { data: Array<{ id: string; name: string }> };
      for (const c of d.data || []) {
        if (!allCatalogIds.has(c.id)) {
          allCatalogIds.add(c.id);
          catalogsToSync.push({ meta_catalog_id: c.id, nome: c.name });
        }
      }
    }

    // Collect business catalogs — fetch all businesses' catalogs in parallel
    if (bizRes.ok) {
      const bizData = await bizRes.json() as { data: Array<{ id: string; name: string }> };
      const businesses = bizData.data || [];
      const bizCatResults = await Promise.all(
        businesses.map(biz =>
          fetch(`${META_BASE}/${biz.id}/owned_product_catalogs?fields=id,name&limit=10&access_token=${token}`)
            .then(r => r.ok ? r.json() as Promise<{ data: Array<{ id: string; name: string }> }> : { data: [] })
            .catch(() => ({ data: [] as Array<{ id: string; name: string }> }))
        )
      );
      for (const res of bizCatResults) {
        for (const c of res.data || []) {
          if (!allCatalogIds.has(c.id)) {
            allCatalogIds.add(c.id);
            catalogsToSync.push({ meta_catalog_id: c.id, nome: c.name });
          }
        }
      }
    }

    if (catalogsToSync.length === 0) {
      return NextResponse.json({ ok: true, message: 'Nenhum catálogo encontrado no Meta', synced: 0 });
    }

    // Step 2: upsert all catalogs and fetch their products — all in parallel
    const results = await Promise.all(
      catalogsToSync.map(async (catalog) => {
        // Upsert catalog record
        const { data: localCatalog } = await supabase
          .from('meta_catalog')
          .upsert({
            tenant_id: profile.tenant_id,
            meta_catalog_id: catalog.meta_catalog_id,
            nome: catalog.nome,
          }, { onConflict: 'tenant_id,meta_catalog_id' })
          .select('id')
          .single();

        if (!localCatalog) return 0;

        // Fetch first page of products (50 items) — enough to populate the catalog
        const prodRes = await fetch(
          `${META_BASE}/${catalog.meta_catalog_id}/products` +
          `?fields=id,title,description,price,availability,condition,image_url,brand,retailer_id` +
          `&limit=50&access_token=${token}`
        ).catch(() => null);

        if (!prodRes?.ok) return 0;

        const prodData = await prodRes.json() as {
          data: Array<{
            id: string; title: string; description?: string; price?: string;
            availability?: string; condition?: string; image_url?: string;
            brand?: string; retailer_id?: string;
          }>;
        };

        const products = prodData.data || [];
        if (products.length === 0) return 0;

        // Upsert all products in one batch
        const rows = products.map(p => {
          const priceMatch = (p.price || '').match(/([\d.]+)/);
          const precoCentavos = priceMatch ? Math.round(parseFloat(priceMatch[1]) * 100) : 0;
          return {
            tenant_id: profile.tenant_id,
            catalog_id: localCatalog.id,
            meta_item_id: p.id,
            titulo: p.title || '(sem nome)',
            descricao: p.description,
            preco: precoCentavos,
            disponibilidade: (p.availability || 'in stock') as 'in stock' | 'out of stock' | 'preorder',
            condicao: (p.condition || 'new') as 'new' | 'used' | 'refurbished',
            image_url: p.image_url,
            marca: p.brand,
            sku: p.retailer_id,
            sincronizado_em: new Date().toISOString(),
          };
        });

        await supabase
          .from('meta_catalog_products')
          .upsert(rows, { onConflict: 'tenant_id,meta_item_id' });

        return products.length;
      })
    );

    const totalProducts = results.reduce((s, n) => s + n, 0);
    const catalogNames = catalogsToSync.map(c => c.nome).join(', ');

    return NextResponse.json({
      ok: true,
      message: `Importados ${totalProducts} produtos de ${catalogsToSync.length} catálogo(s): ${catalogNames}`,
      synced: totalProducts,
      catalogs: catalogsToSync.map(c => c.nome),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
