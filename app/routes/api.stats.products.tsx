// app/routes/api.stats.products.tsx
import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { ShopifyAPIClient } from '~/lib/shopify-api.server';
import { computeProductReadiness } from '~/lib/stats/product-readiness';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!shop) {
    throw new Response('Shop not found', { status: 404 });
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
    const counts = computeProductReadiness(products ?? []);
    totalProducts += counts.totalProducts;
    readyCount += counts.readyCount;
    problemCount += counts.problemCount;
    pageInfo = nextPageInfo ?? undefined;
  } while (pageInfo);

  return json({
    totalProducts,
    readyCount,
    problemCount,
  });
}
