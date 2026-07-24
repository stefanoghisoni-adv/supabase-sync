// Processor implementations for background sync jobs
import type { Job } from 'bullmq';
import type { SyncJobData } from '../queue/queues.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ShopifyAPIClient } from '../shopify-api.server';
import { transformProduct } from '../transformers/product.server';
import { transformCustomer } from '../transformers/customer.server';
import { createSupabaseClient } from '../supabase.server';
import { prisma } from '../../db.server';
import { isAuthorized } from '../../utils/authorization.server';
import { isProductLimitReached } from '../limits/product-limit';
import { enrichVariantCosts } from '../stats/inventory-cost.server';
import { filterEligibleProductRows } from '../eligibility/product-eligibility';
import type { ShopifyCustomer } from '~/types/shopify';
import { isCustomerOptedIn } from '../stats/customer-consent-stats';

/**
 * Syncs customers from Shopify into the merchant's Supabase `customers` table.
 * Paginated upsert keyed on shopify_customer_id. When `updatedAtMin` is provided
 * only customers changed since then are fetched (incremental periodic check);
 * otherwise every customer is synced (initial bulk).
 *
 * Caller is responsible for the plan entitlement check (customersSyncEnabled).
 * Returns the number of customers upserted.
 */
async function syncCustomers(
  shopifyClient: ShopifyAPIClient,
  supabase: SupabaseClient,
  tableName: string,
  updatedAtMin?: string
): Promise<number> {
  let total = 0;
  let nextPageInfo: string | null = null;

  do {
    const { customers, nextPageInfo: nextPage } = await shopifyClient.getCustomers({
      limit: 250,
      pageInfo: nextPageInfo || undefined,
      updatedAtMin,
    });

    if (!customers || customers.length === 0) break;

    // Due destini diversi per due categorie diverse.
    const page = customers as ShopifyCustomer[];
    const rows = page.filter(isCustomerOptedIn).map(transformCustomer);
    const revokedIds = page.filter((c) => !isCustomerOptedIn(c)).map((c) => c.id);

    const chunkSize = 1000;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase.from(tableName).upsert(chunk, {
        onConflict: 'shopify_customer_id',
        ignoreDuplicates: false,
      });

      if (error) {
        throw new Error(`Supabase customer upsert failed: ${error.message}`);
      }
    }

    // Chi non ha acconsentito non entra: nessuna insert. Ma se una riga sua e'
    // gia' su Supabase — sincronizzata quando il consenso c'era — va marcata,
    // perche' il proxy decide il 403 leggendo proprio questa colonna. Una
    // `update` non crea righe: sui clienti mai sincronizzati e' un no-op.
    if (revokedIds.length > 0) {
      const { error: revokeError } = await supabase
        .from(tableName)
        .update({ accepts_marketing: false })
        .in('shopify_customer_id', revokedIds);

      if (revokeError) {
        // Non fatale: gli opt-in sono gia' scritti, la corsa successiva ritenta.
        console.warn('Marcatura dei consensi revocati fallita:', revokeError.message);
      }
    }

    total += rows.length;
    nextPageInfo = nextPage;
  } while (nextPageInfo);

  return total;
}

/**
 * Legge tutti gli shopify_product_id già presenti nella tabella prodotti del
 * merchant, in pagine da 1000 (limite PostgREST). Serve a conoscere quanti
 * prodotti distinti esistono per far rispettare il tetto del piano anche nella
 * sync incrementale.
 */
async function fetchExistingProductIds(
  supabase: SupabaseClient,
  tableName: string,
): Promise<Set<number>> {
  const ids = new Set<number>();
  const pageSize = 1000;
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from(tableName)
      .select('shopify_product_id')
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Impossibile leggere i product id esistenti: ${error.message}`);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.shopify_product_id != null) ids.add(row.shopify_product_id as number);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return ids;
}

/**
 * Process periodic sync check for a shop
 * Task 11: Implements incremental sync with delta detection
 *
 * Fetches only products updated since last sync, detects orphaned variants,
 * and uses separated upserts to avoid NULL-conflict bug:
 * - Variant rows: onConflict: 'shopify_variant_id'
 * - Non-variant rows: onConflict: 'shopify_product_id'
 */
export async function processPeriodicSyncCheck(shopId: string): Promise<void> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: { supabaseConfig: true },
  });

  if (!shop || !shop.supabaseConfig || !shop.supabaseConfig.syncEnabled) {
    console.log(`Shop ${shopId} not configured for periodic sync`);
    return;
  }
  // Gate autorizzazione (vale per la sync automatica): nessuna comunicazione se
  // il negozio non è ENABLED (ban o trial scaduto).
  if (!isAuthorized(shop.authorization)) {
    console.log(`Shop ${shopId} non autorizzato: sync automatica sospesa`);
    return;
  }

  const shopifyClient = new ShopifyAPIClient(shop.shopDomain, shop.accessToken);
  const supabase = createSupabaseClient(shop.supabaseConfig);

  // Piano del negozio: tetto prodotti (maxProducts, null = illimitato) e
  // abilitazione sync clienti. Riusato più sotto per la sync dei clienti.
  const plan = await prisma.plan.findUnique({
    where: { planName: shop.currentPlan },
  });
  const maxProducts = plan?.maxProducts ?? null;

  // Get last periodic sync timestamp
  const lastSyncJob = await prisma.syncJob.findFirst({
    where: {
      shopId: shop.id,
      jobType: 'periodic_check',
      status: 'completed',
    },
    orderBy: {
      completedAt: 'desc',
    },
  });

  const lastSyncTime = lastSyncJob?.completedAt || shop.supabaseConfig.updatedAt;

  // Create sync job
  const syncJob = await prisma.syncJob.create({
    data: {
      shopId: shop.id,
      jobType: 'periodic_check',
      status: 'running',
    },
  });

  try {
    let totalProducts = 0;
    let totalVariants = 0;
    let nextPageInfo: string | null = null;

    // Per far rispettare il tetto del piano anche in delta: insieme dei prodotti
    // già presenti. I prodotti nuovi oltre il limite non vengono aggiunti; quelli
    // già presenti continuano ad aggiornarsi. null = piano illimitato (nessun cap).
    const existingProductIds = maxProducts == null
      ? null
      : await fetchExistingProductIds(supabase, shop.supabaseConfig.tableNameProducts);

    do {
      // Fetch updated products since last sync (delta)
      const { products, nextPageInfo: nextPage } = await shopifyClient.getProducts({
        limit: 250,
        pageInfo: nextPageInfo || undefined,
        updatedAtMin: lastSyncTime.toISOString(),
      });

      if (products.length === 0) break;

      // Il cost_per_item vive sull'InventoryItem: senza questo la sync scriverebbe
      // sempre cost_per_item null, azzerando anche i valori inseriti a mano.
      await enrichVariantCosts(shopifyClient, products);

      // Process each product individually for delta detection
      for (const product of products) {
        // Tetto del piano: se il prodotto è nuovo e il limite è già saturo,
        // non aggiungerlo (gli aggiornamenti ai prodotti esistenti passano).
        if (
          existingProductIds != null &&
          !existingProductIds.has(product.id) &&
          existingProductIds.size >= (maxProducts as number)
        ) {
          continue;
        }

        // Solo righe idonee: le varianti senza costo non vanno scritte e, se
        // presenti da prima, devono risultare "orfane" e quindi cancellate.
        const eligibleRows = filterEligibleProductRows(transformProduct(product));
        const currentVariantIds = new Set(
          eligibleRows.map(r => r.shopify_variant_id).filter((id): id is number => id != null)
        );

        // Fetch existing rows from Supabase for this product
        const { data: existingRows } = await supabase
          .from(shop.supabaseConfig.tableNameProducts)
          .select('shopify_variant_id')
          .eq('shopify_product_id', product.id);

        // Riconcilia: elimina le righe del prodotto il cui variant_id non è più
        // presente in Shopify. Copre sia le varianti rimosse sia le transizioni
        // multi→single (le vecchie righe variante diventano orfane). Include
        // eventuali righe legacy con variant_id NULL create prima di questo fix.
        const orphanedVariantIds = (existingRows || [])
          .map(row => row.shopify_variant_id as number | null)
          .filter((id): id is number => id != null && !currentVariantIds.has(id));
        const hasLegacyNullRows = (existingRows || []).some(row => row.shopify_variant_id == null);

        if (orphanedVariantIds.length > 0) {
          const { error: deleteError } = await supabase
            .from(shop.supabaseConfig.tableNameProducts)
            .delete()
            .eq('shopify_product_id', product.id)
            .in('shopify_variant_id', orphanedVariantIds);

          if (deleteError) {
            console.warn(`Could not delete orphaned variants for product ${product.id}:`, deleteError);
          }
        }
        if (hasLegacyNullRows) {
          const { error: deleteError } = await supabase
            .from(shop.supabaseConfig.tableNameProducts)
            .delete()
            .eq('shopify_product_id', product.id)
            .is('shopify_variant_id', null);

          if (deleteError) {
            console.warn(`Could not delete legacy null-variant row for product ${product.id}:`, deleteError);
          }
        }

        // Se non resta alcuna variante idonea, la riconciliazione sopra ha già
        // rimosso le righe del prodotto: non si upserta e non si consuma quota.
        if (eligibleRows.length === 0) continue;

        // Upsert delle sole righe idonee con la chiave univoca.
        const { error } = await supabase
          .from(shop.supabaseConfig.tableNameProducts)
          .upsert(eligibleRows, {
            onConflict: 'shopify_variant_id',
            ignoreDuplicates: false,
          });

        if (error) {
          console.error(`Periodic sync upsert error for product ${product.id}:`, error);
          continue;
        }

        totalProducts++;
        totalVariants += eligibleRows.length;
        // Aggiorna il conteggio prodotti distinti (no-op se già presente).
        if (existingProductIds != null) existingProductIds.add(product.id);
      }

      nextPageInfo = nextPage;

    } while (nextPageInfo);

    // Incremental customer sync (delta) if the shop's plan includes customer sync
    let totalCustomers = 0;
    if (plan?.customersSyncEnabled) {
      totalCustomers = await syncCustomers(
        shopifyClient,
        supabase,
        shop.supabaseConfig.tableNameCustomers,
        lastSyncTime.toISOString()
      );
    }

    // Mark completed
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        productsSynced: totalProducts,
        variantsSynced: totalVariants,
        customersSynced: totalCustomers,
      },
    });

    console.log(`Periodic sync check completed: ${totalProducts} products checked, ${totalVariants} variants synced, ${totalCustomers} customers synced`);

  } catch (error) {
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errors: {
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
    });

    console.error('Periodic sync check failed:', error);
    throw error;
  }
}

/**
 * Process initial bulk sync for a shop
 * Task 10: Syncs ALL products from Shopify to Supabase with pagination
 *
 * CRITICAL: Uses separated upserts to avoid NULL conflict bug:
 * - Variant rows (shopify_variant_id != NULL): upsert with onConflict: 'shopify_variant_id'
 * - Non-variant rows (shopify_variant_id = NULL): upsert with onConflict: 'shopify_product_id'
 *
 * This prevents infinite duplicates for single-variant products (where shopify_variant_id = NULL
 * and SQL NULL != NULL means onConflict never matches).
 */
export async function processInitialBulkSync(shopId: string, job: Job<any>): Promise<void> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: { supabaseConfig: true },
  });

  if (!shop || !shop.supabaseConfig || !shop.supabaseConfig.syncEnabled) {
    throw new Error(`Shop ${shopId} not configured for sync`);
  }
  // Gate autorizzazione (vale per manuale e automatico): blocca se non ENABLED.
  if (!isAuthorized(shop.authorization)) {
    throw new Error(`Shop ${shopId} non autorizzato all'uso dell'app`);
  }

  const shopifyClient = new ShopifyAPIClient(shop.shopDomain, shop.accessToken);
  const supabase = createSupabaseClient(shop.supabaseConfig);

  // Create sync job record
  const syncJob = await prisma.syncJob.create({
    data: {
      shopId: shop.id,
      jobType: 'initial_bulk',
      status: 'running',
    },
  });

  // Piano del negozio: definisce il tetto di prodotti sincronizzabili
  // (maxProducts) e se la sync dei clienti è inclusa. null = illimitato.
  const plan = await prisma.plan.findUnique({
    where: { planName: shop.currentPlan },
  });
  const maxProducts = plan?.maxProducts ?? null;

  let totalProducts = 0;
  let totalVariants = 0;
  let nextPageInfo: string | null = null;

  try {
    // Riconciliazione, non ripopolamento da zero: la tabella NON viene svuotata,
    // cosi' resta leggibile per tutta la sync (con l'azzeramento il tracciamento
    // leggeva zero prodotti per l'intera durata) e non si distrugge nulla su un
    // progetto gia' popolato. Le righe non toccate da questa corsa vengono
    // spazzate alla fine confrontando `synced_at` con questo istante.
    const runStartedAt = new Date().toISOString();

    do {
      // Fetch products batch (250 per page)
      const { products, nextPageInfo: nextPage } = await shopifyClient.getProducts({
        limit: 250,
        pageInfo: nextPageInfo || undefined,
      });

      if (products.length === 0) break;

      // Il cost_per_item vive sull'InventoryItem: popolalo prima di trasformare,
      // altrimenti verrebbe scritto sempre null su Supabase.
      await enrichVariantCosts(shopifyClient, products);

      // Trasforma, filtra le idonee e applica il tetto DOPO il filtro: un prodotto
      // consuma quota solo se ha ≥1 variante idonea.
      const allRows = [];
      for (const product of products) {
        if (maxProducts != null && totalProducts >= maxProducts) break;
        const eligibleRows = filterEligibleProductRows(transformProduct(product));
        if (eligibleRows.length === 0) continue; // nessuna variante idonea: niente quota
        allRows.push(...eligibleRows);
        totalProducts++;
        totalVariants += eligibleRows.length;
      }

      // Ogni riga ha ora un shopify_variant_id reale (anche i prodotti a
      // variante singola) → un solo upsert con la chiave univoca, senza
      // separare variant/non-variant.
      if (allRows.length > 0) {
        const chunkSize = 1000;
        for (let i = 0; i < allRows.length; i += chunkSize) {
          const chunk = allRows.slice(i, i + chunkSize);

          const { error } = await supabase
            .from(shop.supabaseConfig.tableNameProducts)
            .upsert(chunk, {
              onConflict: 'shopify_variant_id',
              ignoreDuplicates: false,
            });

          if (error) {
            throw new Error(`Supabase products upsert failed: ${error.message}`);
          }
        }
      }

      // Update job progress
      await job.updateProgress({
        products: totalProducts,
        variants: totalVariants,
      });

      await prisma.syncJob.update({
        where: { id: syncJob.id },
        data: {
          productsSynced: totalProducts,
          variantsSynced: totalVariants,
        },
      });

      // Limite del piano raggiunto: interrompi la paginazione.
      if (isProductLimitReached(totalProducts, maxProducts)) break;

      nextPageInfo = nextPage;

    } while (nextPageInfo);

    // Spazzata: le righe con synced_at anteriore all'inizio corsa sono quelle che
    // la scansione non ha toccato, cioe' esattamente le due categorie da togliere
    // — prodotti non piu' presenti su Shopify e varianti che hanno perso il
    // cost_per_item. Una sola query, indipendente dal numero di prodotti.
    //
    // Sta QUI di proposito: ci si arriva solo se la paginazione e' terminata
    // regolarmente (anche per raggiunto tetto del piano). Se una pagina lancia,
    // il controllo salta al catch e non si cancella nulla: meglio qualche riga
    // obsoleta che perdere prodotti veri per un errore di rete.
    //
    // Le righe con synced_at NULL sopravvivono (in SQL un confronto con NULL non
    // e' mai vero): non le ha scritte l'app, non le tocchiamo.
    const { error: sweepError } = await supabase
      .from(shop.supabaseConfig.tableNameProducts)
      .delete()
      .lt('synced_at', runStartedAt);

    if (sweepError) {
      // Non fatale: i prodotti idonei sono gia' stati scritti. Le righe obsolete
      // verranno rimosse alla corsa successiva.
      console.warn('Spazzata dei prodotti obsoleti fallita:', sweepError);
    }

    // Sync customers if the shop's plan includes customer sync
    let totalCustomers = 0;
    if (plan?.customersSyncEnabled) {
      totalCustomers = await syncCustomers(
        shopifyClient,
        supabase,
        shop.supabaseConfig.tableNameCustomers
      );
    }

    // Mark sync job as completed
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        customersSynced: totalCustomers,
      },
    });

    // Il piano con cui questa sync e' stata eseguita: se in futuro currentPlan
    // differisce, la dashboard sa che c'e' altro da sincronizzare e riabilita il
    // pulsante. Si riallinea da solo a ogni sync completata.
    await prisma.shop.update({
      where: { id: shop.id },
      data: { lastSyncedPlan: shop.currentPlan },
    });

    console.log(`Bulk sync completed: ${totalProducts} products, ${totalVariants} variants, ${totalCustomers} customers`);

  } catch (error) {
    // Mark sync job as failed
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errors: {
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
    });

    console.error('Bulk sync failed:', error);
    throw error;
  }
}

/**
 * Process manual sync for a shop
 * Task 10: Reuses initial bulk sync logic
 */
export async function processManualSync(shopId: string, job: Job<any>): Promise<void> {
  // Manual sync reuses the same logic as initial bulk sync
  await processInitialBulkSync(shopId, job);
}

/**
 * Process retry of a failed webhook.
 *
 * Deferred: no producer currently enqueues 'retry-failed-webhook' jobs. The
 * type and worker branch exist so the retry pipeline can be wired up in a later
 * phase without reshaping the queue contract. Throws if invoked prematurely.
 */
export async function processRetryWebhook(data: Extract<SyncJobData, { type: 'retry-failed-webhook' }>): Promise<void> {
  throw new Error('processRetryWebhook not yet implemented');
}
