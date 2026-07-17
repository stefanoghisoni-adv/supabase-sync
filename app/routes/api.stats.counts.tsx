// app/routes/api.stats.counts.tsx
// Conteggi "leggeri" e sempre live: totale prodotti (products/count.json) e
// totale clienti (customers/count.json). Una sola chiamata ciascuno, eseguite in
// parallelo: alimentano subito PlanBanner, card "Prodotti totali"/"Clienti" e
// l'anteprima di sync, senza attendere la paginazione completa della readiness.
import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { ShopifyAPIClient } from '~/lib/shopify-api.server';

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

  const [totalProducts, customerCount] = await Promise.all([
    client.getProductsCount(),
    customersEnabled ? client.getCustomersCount() : Promise.resolve(null),
  ]);

  return json({ totalProducts, customersEnabled, customerCount });
}
