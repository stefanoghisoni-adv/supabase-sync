// app/routes/api.stats.product-history.tsx
import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { buildHistorySeries } from '~/lib/stats/history-series';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!shop) {
    throw new Response('Shop not found', { status: 404 });
  }

  // Ultimi 30 giorni: la data di inizio e' 30 giorni fa da oggi
  const from = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const snapshots = await prisma.productEligibilitySnapshot.findMany({
    where: { shopId: shop.id, day: { gte: from } },
    orderBy: { day: 'asc' },
  });

  const plan = await prisma.plan.findUnique({
    where: { planName: shop.currentPlan },
  });

  return json({
    points: buildHistorySeries(snapshots, new Date()),
    // null = piano senza tetto: il grafico non disegnera' la soglia
    planLimit: plan?.maxProducts ?? null,
  });
}
