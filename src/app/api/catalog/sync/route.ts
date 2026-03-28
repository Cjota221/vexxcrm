import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

const META_BASE = 'https://graph.facebook.com/v23.0';

/**
 * POST /api/catalog/sync
 * Imports all catalogs and products from Meta Business API into local DB.
 * Flow: /me/businesses → /owned_product_catalogs → catalog products
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

    // Step 1: get businesses
    const bizRes = await fetch(`${META_BASE}/me/businesses?fields=id,name&access_token=${token}`);
    if (!bizRes.ok) {
      const err = await bizRes.json().catch(() => ({})) as { error?: { message?: string } };
      return NextResponse.json({ error: err.error?.message || 'Erro ao buscar negócios Meta' }, { status: 502 });
    }
    const bizData = await bizRes.json() as { data: Array<{ id: string; name: string }> };
    const businesses = bizData.data || [];

    // Also try personal account catalogs (for users without Business Manager)
    const allCatalogIds = new Set<string>();
    const catalogsToSync: Array<{ meta_catalog_id: string; nome: string }> = [];

    // Step 2: get catalogs from each business
    for (const biz of businesses) {
      const catRes = await fetch(
        `${META_BASE}/${biz.id}/owned_product_catalogs?fields=id,name&limit=10&access_token=${token}`
      );
      if (!catRes.ok) continue;
      const catData = await catRes.json() as { data: Array<{ id: string; name: string }> };
      for (const cat of catData.data || []) {
        if (!allCatalogIds.has(cat.id)) {
          allCatalogIds.add(cat.id);
          catalogsToSync.push({ meta_catalog_id: cat.id, nome: cat.name });
        }
      }
    }

    // Also try /me/owned_product_catalogs (personal token)
    const myCatRes = await fetch(
      `${META_BASE}/me/owned_product_catalogs?fields=id,name&limit=10&access_token=${token}`
    );
    if (myCatRes.ok) {
      const myCatData = await myCatRes.json() as { data: Array<{ id: string; name: string }> };
      for (const cat of myCatData.data || []) {
        if (!allCatalogIds.has(cat.id)) {
          allCatalogIds.add(cat.id);
          catalogsToSync.push({ meta_catalog_id: cat.id, nome: cat.name });
        }
      }
    }

    if (catalogsToSync.length === 0) {
      return NextResponse.json({ ok: true, message: 'Nenhum catálogo encontrado no Meta Business', synced: 0 });
    }

    let totalProducts = 0;
    const syncedCatalogs: string[] = [];

    for (const catalog of catalogsToSync) {
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

      if (!localCatalog) continue;
      syncedCatalogs.push(catalog.nome);

      // Step 3: fetch products from this catalog
      let nextUrl: string | null =
        `${META_BASE}/${catalog.meta_catalog_id}/products` +
        `?fields=id,title,description,price,availability,condition,image_url,product_feed{id},brand,retailer_id` +
        `&limit=50&access_token=${token}`;

      while (nextUrl) {
        const prodRes = await fetch(nextUrl);
        if (!prodRes.ok) break;

        const prodData = await prodRes.json() as {
          data: Array<{
            id: string;
            title: string;
            description?: string;
            price?: string;
            availability?: string;
            condition?: string;
            image_url?: string;
            brand?: string;
            retailer_id?: string;
          }>;
          paging?: { next?: string };
        };

        const products = prodData.data || [];

        for (const p of products) {
          // Parse price "25.00 BRL" → centavos
          const priceMatch = (p.price || '').match(/([\d.]+)/);
          const priceReais = priceMatch ? parseFloat(priceMatch[1]) : 0;
          const precoCentavos = Math.round(priceReais * 100);

          await supabase.from('meta_catalog_products').upsert({
            tenant_id: profile.tenant_id,
            catalog_id: localCatalog.id,
            meta_item_id: p.id,
            titulo: p.title || '(sem nome)',
            descricao: p.description,
            preco: precoCentavos,
            disponibilidade: p.availability || 'in stock',
            condicao: p.condition || 'new',
            image_url: p.image_url,
            marca: p.brand,
            sku: p.retailer_id,
            sincronizado_em: new Date().toISOString(),
          }, { onConflict: 'tenant_id,meta_item_id' });

          totalProducts++;
        }

        nextUrl = prodData.paging?.next || null;
        // Safety: max 5 pages per catalog (250 products)
        if (totalProducts > 250) break;
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Importados ${totalProducts} produtos de ${syncedCatalogs.length} catálogo(s): ${syncedCatalogs.join(', ')}`,
      synced: totalProducts,
      catalogs: syncedCatalogs,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
