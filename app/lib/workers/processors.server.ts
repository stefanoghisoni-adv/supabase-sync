// Processor implementations for background sync jobs
import type { Job } from 'bullmq';
import type { SyncJobData } from '../queue/queues.server';
import { ShopifyAPIClient } from '../shopify-api.server';
import { transformProduct } from '../transformers/product.server';
import { createSupabaseClient } from '../supabase.server';
import { prisma } from '../../db.server';

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
        // Fetch existing rows from Supabase for this product
        const { data: existingRows } = await supabase
          .from(shop.supabaseConfig.tableNameProducts)
          .select('shopify_variant_id')
          .eq('shopify_product_id', product.id);

        const existingVariantIds = new Set(
          existingRows?.map(row => row.shopify_variant_id).filter(Boolean) || []
        );

        // Transform current product
        const currentRows = transformProduct(product);
        const currentVariantIds = new Set(
          currentRows
            .filter(r => r.is_variant)
            .map(r => r.shopify_variant_id)
            .filter(Boolean)
        );

        // Find orphaned variants (exist in Supabase but not in Shopify anymore)
        const orphanedVariantIds = [...existingVariantIds].filter(
          id => !currentVariantIds.has(id)
        );

        // Delete orphaned variants (scoped by product to prevent cross-product deletes)
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

        // Separate variant rows from non-variant rows (CRITICAL for NULL handling)
        const variantRows = currentRows.filter(r => r.is_variant);
        const nonVariantRows = currentRows.filter(r => !r.is_variant);

        // Upsert variant rows
        if (variantRows.length > 0) {
          const { error } = await supabase
            .from(shop.supabaseConfig.tableNameProducts)
            .upsert(variantRows, {
              onConflict: 'shopify_variant_id',
              ignoreDuplicates: false,
            });

          if (error) {
            console.error(`Periodic sync variant upsert error for product ${product.id}:`, error);
            continue;
          }
        }

        // Upsert non-variant rows
        if (nonVariantRows.length > 0) {
          const { error } = await supabase
            .from(shop.supabaseConfig.tableNameProducts)
            .upsert(nonVariantRows, {
              onConflict: 'shopify_product_id',
              ignoreDuplicates: false,
            });

          if (error) {
            console.error(`Periodic sync non-variant upsert error for product ${product.id}:`, error);
            continue;
          }
        }

        // Handle single↔multi variant transitions (mirroring Part 1 webhook pattern)
        // Clean up non-variant rows if product now has variants (multi-variant product)
        if (variantRows.length > 0) {
          const { error: deleteError } = await supabase
            .from(shop.supabaseConfig.tableNameProducts)
            .delete()
            .eq('shopify_product_id', product.id)
            .not('shopify_variant_id', 'is', null);

          if (deleteError) {
            console.warn(`Could not clean old non-variant row for product ${product.id}:`, deleteError);
          }
        } else if (nonVariantRows.length > 0) {
          // Conversely, if product is now single-variant, delete old variant rows
          const { error: deleteError } = await supabase
            .from(shop.supabaseConfig.tableNameProducts)
            .delete()
            .eq('shopify_product_id', product.id)
            .not('shopify_variant_id', 'is', null);

          if (deleteError) {
            console.warn(`Could not clean old variant rows for product ${product.id}:`, deleteError);
          }
        }

        totalProducts++;
        totalVariants += currentRows.length;
      }

      nextPageInfo = nextPage;

    } while (nextPageInfo);

    // Mark completed
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        productsSynced: totalProducts,
        variantsSynced: totalVariants,
      },
    });

    console.log(`Periodic sync check completed: ${totalProducts} products checked, ${totalVariants} variants synced`);

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
