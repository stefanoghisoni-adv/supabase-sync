// Processor implementations for background sync jobs
import type { Job } from 'bullmq';
import type { SyncJobData } from '../queue/queues.server';
import { ShopifyAPIClient } from '../shopify-api.server';
import { transformProduct } from '../transformers/product.server';
import { createSupabaseClient } from '../supabase.server';
import { prisma } from '../../db.server';

/**
 * Process periodic sync check for a shop
 * Task 9: Implement periodic sync checking logic
 */
export async function processPeriodicSyncCheck(shopId: string): Promise<void> {
  throw new Error('processPeriodicSyncCheck not yet implemented (Task 9)');
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

      // Separate variant rows from non-variant rows (CRITICAL for NULL handling)
      const variantRows = allRows.filter(r => r.is_variant);
      const nonVariantRows = allRows.filter(r => !r.is_variant);

      // Batch upsert variant rows (chunks of 1000)
      if (variantRows.length > 0) {
        const chunkSize = 1000;
        for (let i = 0; i < variantRows.length; i += chunkSize) {
          const chunk = variantRows.slice(i, i + chunkSize);

          const { error } = await supabase
            .from(shop.supabaseConfig.tableNameProducts)
            .upsert(chunk, {
              onConflict: 'shopify_variant_id',
              ignoreDuplicates: false,
            });

          if (error) {
            throw new Error(`Supabase variant upsert failed: ${error.message}`);
          }
        }
      }

      // Batch upsert non-variant rows (chunks of 1000)
      if (nonVariantRows.length > 0) {
        const chunkSize = 1000;
        for (let i = 0; i < nonVariantRows.length; i += chunkSize) {
          const chunk = nonVariantRows.slice(i, i + chunkSize);

          const { error } = await supabase
            .from(shop.supabaseConfig.tableNameProducts)
            .upsert(chunk, {
              onConflict: 'shopify_product_id',
              ignoreDuplicates: false,
            });

          if (error) {
            throw new Error(`Supabase non-variant upsert failed: ${error.message}`);
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

      nextPageInfo = nextPage;

    } while (nextPageInfo);

    // Mark sync job as completed
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });

    console.log(`Bulk sync completed: ${totalProducts} products, ${totalVariants} variants`);

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
 * Process retry of failed webhook
 * Task 11: Implement webhook retry logic
 */
export async function processRetryWebhook(data: Extract<SyncJobData, { type: 'retry-failed-webhook' }>): Promise<void> {
  throw new Error('processRetryWebhook not yet implemented (Task 11)');
}
