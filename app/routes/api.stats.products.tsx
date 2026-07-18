// app/routes/api.stats.products.tsx
import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { ShopifyAPIClient } from '~/lib/shopify-api.server';
import { computeProductReadiness } from '~/lib/stats/product-readiness';
import { enrichVariantCosts } from '~/lib/stats/inventory-cost.server';
import { getReadinessCache, setReadinessCache } from '~/lib/cache/stats-cache.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!shop) {
    throw new Response('Shop not found', { status: 404 });
  }

  // Cache-then-refresh: senza ?refresh=1 restituiamo SUBITO l'ultimo valore in
  // cache (riapertura istantanea). Il client, vedendo cached:true, richiama poi
  // l'endpoint con ?refresh=1 per il ricalcolo live in background.
  const refresh = new URL(request.url).searchParams.get('refresh') === '1';
  if (!refresh) {
    const cached = await getReadinessCache(shop.id);
    if (cached) {
      return json({
        totalProducts: cached.totalProducts,
        readyCount: cached.readyCount,
        problemCount: cached.problemCount,
        cached: true,
      });
    }
  }

  const client = new ShopifyAPIClient(shop.shopDomain, shop.accessToken);

  let totalProducts = 0;
  let readyCount = 0;
  let problemCount = 0;
  let pageInfo: string | undefined;

  // Scomposizione pronti/problemi: richiede il dato per-variante, quindi la
  // paginazione completa è inevitabile. La alleggeriamo però al minimo indispensabile
  // (`fields=id,variants`): la readiness legge solo variants.cost, non serve scaricare
  // immagini, tag, descrizioni. I conteggi totali stanno nell'endpoint /api/stats/counts.
  do {
    const { products, nextPageInfo } = await client.getProducts({
      limit: 250,
      pageInfo,
      fields: 'id,variants',
    });
    // Il cost_per_item vive sull'InventoryItem: lo popoliamo prima di classificare,
    // altrimenti variant.cost sarebbe sempre vuoto e tutto risulterebbe "problema".
    const enriched = await enrichVariantCosts(client, products ?? []);
    const counts = computeProductReadiness(enriched);
    totalProducts += counts.totalProducts;
    readyCount += counts.readyCount;
    problemCount += counts.problemCount;
    pageInfo = nextPageInfo ?? undefined;
  } while (pageInfo);

  const result = { totalProducts, readyCount, problemCount };
  await setReadinessCache(shop.id, result);

  return json({ ...result, cached: false });
}
