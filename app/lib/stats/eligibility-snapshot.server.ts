import { prisma } from '~/db.server';
import { ShopifyAPIClient } from '~/lib/shopify-api.server';
import { countEligibleProducts } from './product-readiness';
import { enrichVariantCosts } from './inventory-cost.server';
import type { Shop } from '@prisma/client';

// Mezzanotte UTC di oggi: la chiave del giorno deve essere stabile a prescindere
// dall'ora in cui il cron passa.
export function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function recordEligibilitySnapshotIfMissing(
  shop: Shop,
): Promise<'written' | 'skipped'> {
  const day = today();

  // Guard: se esiste gia' uno snapshot per oggi, non tocchiamo Shopify.
  // Il cron gira ogni 30 minuti: senza questo check rifarebbe la scansione completa
  // del catalogo a ogni giro.
  const existing = await prisma.productEligibilitySnapshot.findUnique({
    where: { shopId_day: { shopId: shop.id, day } },
  });
  if (existing) return 'skipped';

  const client = new ShopifyAPIClient(shop.shopDomain, shop.accessToken);

  let totalEligible = 0;
  let pageInfo: string | undefined;

  // Paginazione del catalogo come in api.stats.products: minimo indispensabile
  // (fields=id,variants), enrichVariantCosts per popolare i costi, poi il conteggio.
  do {
    const { products, nextPageInfo } = await client.getProducts({
      limit: 250,
      pageInfo,
      fields: 'id,variants',
    });
    const enriched = await enrichVariantCosts(client, products ?? []);
    totalEligible += countEligibleProducts(enriched);
    pageInfo = nextPageInfo ?? undefined;
  } while (pageInfo);

  await prisma.productEligibilitySnapshot.create({
    data: {
      shopId: shop.id,
      day,
      eligibleCount: totalEligible,
    },
  });

  return 'written';
}

// Aggiorna (o crea) lo snapshot di OGGI. Serve a tenere il punto del giorno
// corrente allineato a quello che il merchant vede in dashboard: il cron lo
// scrive una volta sola, ma i prodotti possono diventare idonei durante la
// giornata, appena qualcuno inserisce i costi mancanti.
export async function upsertTodayEligibilitySnapshot(
  shopId: string,
  eligibleCount: number,
): Promise<void> {
  const day = today();

  await prisma.productEligibilitySnapshot.upsert({
    where: { shopId_day: { shopId, day } },
    create: { shopId, day, eligibleCount },
    update: { eligibleCount },
  });
}
