import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { samePlanName } from '~/lib/billing/plan-name';

/**
 * Piano in uso e listino, per l'avviso sul limite prodotti.
 *
 * Solo database: nessuna chiamata a Shopify. L'avviso compare su tre pagine
 * diverse, e farlo costare una lettura del catalogo ogni volta lo renderebbe un
 * peso proprio dove il merchant sta facendo altro. Il conteggio dei prodotti
 * arriva dalla readiness, che ha gia' la sua cache.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    include: { supabaseConfig: true },
  });
  if (!shop) return json({ connected: false, currentPlan: null, plans: [] });

  const plans = await prisma.plan.findMany();

  return json({
    // Il tetto prodotti parla di una sincronizzazione che senza database non
    // esiste: chi mostra l'avviso deve poter tacere finche' il collegamento non
    // c'e'. La regola sta qui e non nelle tre pagine che lo ospitano, cosi' non
    // puo' valere in una e non nelle altre.
    connected: !!shop.supabaseConfig?.connectionVerifiedAt,
    currentPlanName: shop.currentPlan,
    plans: plans.map((p) => ({
      planName: p.planName,
      priceMonthly: Number(p.priceMonthly),
      priceYearly: Number(p.priceYearly),
      maxProducts: p.maxProducts,
      maxCustomers: p.maxCustomers,
      customersSyncEnabled: p.customersSyncEnabled,
    })),
    currentPlan:
      plans
        .filter((p) => samePlanName(p.planName, shop.currentPlan))
        .map((p) => ({
          planName: p.planName,
          priceMonthly: Number(p.priceMonthly),
          priceYearly: Number(p.priceYearly),
          maxProducts: p.maxProducts,
          maxCustomers: p.maxCustomers,
          customersSyncEnabled: p.customersSyncEnabled,
        }))[0] ?? null,
  });
}
