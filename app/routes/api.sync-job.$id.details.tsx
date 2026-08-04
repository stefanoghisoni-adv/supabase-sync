// app/routes/api.sync-job.$id.details.tsx
// Dettaglio di una sincronizzazione: elenco paginato degli eventi (prodotti
// aggiunti/rimossi, clienti aggiunti/aggiornati/sospesi) per il modal "Vedi dettagli"
// nella tab Logs. Contiene anche i totali veri (dai contatori sul job) e il flag
// truncated per segnalare che le righe mostrate sono meno del totale.
import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { findPlanByName } from '~/lib/billing/find-plan.server';

export interface SyncDetailRow {
  id: string;
  action: 'added' | 'removed' | 'updated' | 'suspended';
  label: string;
  sublabel: string | null;
  /** BigInt serializzato come stringa: JSON non regge i BigInt. */
  shopifyId: string | null;
  variantId: string | null;
}

export interface SyncJobDetailsResponse {
  products: {
    rows: SyncDetailRow[];
    added: number;
    removed: number;
    /** true se rows contiene meno righe di added+removed. */
    truncated: boolean;
  };
  customers: {
    rows: SyncDetailRow[];
    added: number;
    updated: number;
    suspended: number;
    truncated: boolean;
  };
  /** false = il piano non include la sync dei clienti: la tab Clienti va nascosta. */
  customersEnabled: boolean;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const jobId = params.id;

  if (!jobId) {
    throw new Response(JSON.stringify({ error: 'Richiesta non valida' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });

  if (!shop) {
    throw new Response(JSON.stringify({ error: 'Negozio non trovato' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Controllo di proprietà: il job deve appartenere allo shop della sessione.
  // Un merchant non deve poter leggere il log di un altro passando un id a caso.
  const job = await prisma.syncJob.findUnique({
    where: { id: jobId },
    include: {
      // Gli eventi ordinati: prima added, poi removed/updated/suspended, e a parità
      // di azione per createdAt crescente (ordine stabile e leggibile).
      events: {
        orderBy: [{ action: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });

  if (!job || job.shopId !== shop.id) {
    throw new Response(JSON.stringify({ error: 'Sincronizzazione non trovata' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const plan = await findPlanByName(shop.currentPlan);

  const customersEnabled = plan?.customersSyncEnabled ?? false;

  // Separa gli eventi per entity e serializza i BigInt in stringa.
  const productEvents = job.events
    .filter((e) => e.entity === 'product')
    .map((e) => ({
      id: e.id,
      action: e.action as 'added' | 'removed',
      label: e.label,
      sublabel: e.sublabel,
      shopifyId: e.shopifyId ? e.shopifyId.toString() : null,
      variantId: e.variantId ? e.variantId.toString() : null,
    }));

  const customerEvents = job.events
    .filter((e) => e.entity === 'customer')
    .map((e) => ({
      id: e.id,
      action: e.action as 'added' | 'updated' | 'suspended',
      label: e.label,
      sublabel: e.sublabel,
      shopifyId: e.shopifyId ? e.shopifyId.toString() : null,
      variantId: e.variantId ? e.variantId.toString() : null,
    }));

  // truncated = true se le righe mostrate sono meno del totale vero (dai contatori).
  const productsTruncated =
    productEvents.length < job.productsAdded + job.productsRemoved;
  const customersTruncated =
    customerEvents.length <
    job.customersAdded + job.customersUpdated + job.customersSuspended;

  const response: SyncJobDetailsResponse = {
    products: {
      rows: productEvents,
      added: job.productsAdded,
      removed: job.productsRemoved,
      truncated: productsTruncated,
    },
    customers: {
      rows: customerEvents,
      added: job.customersAdded,
      updated: job.customersUpdated,
      suspended: job.customersSuspended,
      truncated: customersTruncated,
    },
    customersEnabled,
  };

  return json(response);
}
