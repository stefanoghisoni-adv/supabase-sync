// Processor implementations for background sync jobs
import type { Job } from 'bullmq';
import type { SyncJobData } from '../queue/queues.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ShopifyAPIClient } from '../shopify-api.server';
import { transformProduct } from '../transformers/product.server';
import { transformCustomer } from '../transformers/customer.server';
import { createSupabaseClient } from '../supabase.server';
import { prisma } from '../../db.server';
import type { ShopifyCustomer } from '~/types/shopify';

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

    const rows = (customers as ShopifyCustomer[]).map(transformCustomer);

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

    total += rows.length;
    nextPageInfo = nextPage;
  } while (nextPageInfo);

  return total;
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

  const shopifyClient = new ShopifyAPIClient(shop.shopDomain, shop.accessToken);
  const supabase = createSupabaseClient(shop.supabaseConfig);

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

    do {
      // Fetch updated products since last sync (delta)
      const { products, nextPageInfo: nextPage } = await shopifyClient.getProducts({
        limit: 250,
        pageInfo: nextPageInfo || undefined,
        updatedAtMin: lastSyncTime.toISOString(),
      });

      if (products.length === 0) break;

      // Process each product individually for delta detection
      for (const product of products) {
        // Righe correnti: ogni riga ha un shopify_variant_id reale (anche i
        // prodotti a variante singola).
        const currentRows = transformProduct(product);
        const currentVariantIds = new Set(
          currentRows.map(r => r.shopify_variant_id).filter((id): id is number => id != null)
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

        // Upsert di tutte le righe correnti con la chiave univoca.
        const { error } = await supabase
          .from(shop.supabaseConfig.tableNameProducts)
          .upsert(currentRows, {
            onConflict: 'shopify_variant_id',
            ignoreDuplicates: false,
          });

        if (error) {
          console.error(`Periodic sync upsert error for product ${product.id}:`, error);
          continue;
        }

        totalProducts++;
        totalVariants += currentRows.length;
      }

      nextPageInfo = nextPage;

    } while (nextPageInfo);

    // Incremental customer sync (delta) if the shop's plan includes customer sync
    let totalCustomers = 0;
    const plan = await prisma.plan.findUnique({
      where: { planName: shop.currentPlan },
    });
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

  let totalProducts = 0;
  let totalVariants = 0;
  let nextPageInfo: string | null = null;

  try {
    do {
      // Fetch products batch (250 per page)
      const { products, nextPageInfo: nextPage } = await shopifyClient.getProducts({
        limit: 250,
        pageInfo: nextPageInfo || undefined,
      });

      if (products.length === 0) break;

      // Transform all products to Supabase rows
      const allRows = [];
      for (const product of products) {
        const rows = transformProduct(product);
        allRows.push(...rows);
        totalProducts++;
        totalVariants += rows.length;
      }

      // Ogni riga ha ora un shopify_variant_id reale (anche i prodotti a
      // variante singola) → un solo upsert con la chiave univoca, senza
      // separare variant/non-variant.
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

      nextPageInfo = nextPage;

    } while (nextPageInfo);

    // Sync customers if the shop's plan includes customer sync
    let totalCustomers = 0;
    const plan = await prisma.plan.findUnique({
      where: { planName: shop.currentPlan },
    });
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
