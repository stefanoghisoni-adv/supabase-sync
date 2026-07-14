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

  const plan = await prisma.plan.findUnique({
    where: { planName: shop.currentPlan },
  });
  const customersEnabled = plan?.customersSyncEnabled ?? false;

  const client = new ShopifyAPIClient(shop.shopDomain, shop.accessToken);

  let totalProducts = 0;
  let readyCount = 0;
  let problemCount = 0;
  let pageInfo: string | undefined;

  do {
    const { products, nextPageInfo } = await client.getProducts({
      limit: 250,
      pageInfo,
    });
    const counts = computeProductReadiness(products ?? []);
    totalProducts += counts.totalProducts;
    readyCount += counts.readyCount;
    problemCount += counts.problemCount;
    pageInfo = nextPageInfo ?? undefined;
  } while (pageInfo);

  const customerCount = customersEnabled
    ? await client.getCustomersCount()
    : null;

  return json({
    totalProducts,
    readyCount,
    problemCount,
    customersEnabled,
    customerCount,
  });
}
