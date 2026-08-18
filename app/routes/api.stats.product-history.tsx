// app/routes/api.stats.product-history.tsx
import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { buildMonthSeries, monthLabel } from '~/lib/stats/history-series';
import { localeForShop } from '~/lib/i18n/server';
import { findPlanByName } from '~/lib/billing/find-plan.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!shop) {
    throw new Response('Shop not found', { status: 404 });
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [inMonth, previous, plan] = await Promise.all([
    prisma.productEligibilitySnapshot.findMany({
      where: { shopId: shop.id, day: { gte: monthStart } },
      orderBy: { day: 'asc' },
    }),
    // L'ultima rilevazione prima del mese: da li' parte il conteggio del primo
    // giorno, altrimenti un negozio gia' avviato ricomincerebbe da zero.
    prisma.productEligibilitySnapshot.findFirst({
      where: { shopId: shop.id, day: { lt: monthStart } },
      orderBy: { day: 'desc' },
    }),
    findPlanByName(shop.currentPlan),
  ]);

  return json({
    points: buildMonthSeries(previous ? [previous, ...inMonth] : inMonth, now),
    monthLabel: monthLabel(now, await localeForShop(session.shop)),
    // Primo giorno del mese mostrato: al grafico serve per scrivere la data per
    // esteso nel riquadro del punto, dove il solo giorno non basterebbe.
    monthStart: monthStart.toISOString(),
    // null = piano senza tetto: il grafico non disegnera' la soglia
    planLimit: plan?.maxProducts ?? null,
  });
}
