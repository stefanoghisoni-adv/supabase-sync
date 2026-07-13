import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { verifyWebhook } from '~/lib/webhooks/verify.server';
import { transformProduct } from '~/lib/transformers/product.server';
import { createSupabaseClient } from '~/lib/supabase.server';
import { prisma } from '~/db.server';
import type { ShopifyProduct } from '~/types/shopify';

export async function action({ request }: ActionFunctionArgs) {
  // Verify HMAC signature
  const body = await request.text();
  const hmac = request.headers.get('X-Shopify-Hmac-Sha256');

  if (!hmac || !verifyWebhook(body, hmac)) {
    return json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Extract shop domain
  const shopDomain = request.headers.get('X-Shopify-Shop-Domain');
  if (!shopDomain) {
    return json({ error: 'Missing shop domain' }, { status: 400 });
  }

  try {
    const product: ShopifyProduct = JSON.parse(body);

    if (!product.id || !Array.isArray(product.variants) || product.variants.length === 0) {
      console.warn('Invalid product payload: missing id or empty variants');
      return json({ ok: true }, { status: 200 });
    }

    // Load shop config
    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
      include: { supabaseConfig: true },
    });

    if (!shop || !shop.supabaseConfig) {
      console.log(`Shop ${shopDomain} not configured for sync`);
      return json({ ok: true }, { status: 200 }); // Acknowledge anyway
    }

    if (!shop.supabaseConfig.syncEnabled) {
      console.log(`Sync disabled for shop ${shopDomain}`);
      return json({ ok: true }, { status: 200 });
    }

    // Transform product to Supabase rows
    const rows = transformProduct(product);

    // Create Supabase client
    const supabase = createSupabaseClient(shop.supabaseConfig);
    const tableName = shop.supabaseConfig.tableNameProducts;

    // Separate variant rows from non-variant row
    const variantRows = rows.filter(r => r.is_variant);
    const nonVariantRows = rows.filter(r => !r.is_variant);

    // Upsert variant rows with variant-specific conflict resolution
    if (variantRows.length > 0) {
      const { error } = await supabase
        .from(tableName)
        .upsert(variantRows, {
          onConflict: 'shopify_variant_id',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error('Supabase variant upsert error:', error);
        await prisma.syncJob.create({
          data: {
            shopId: shop.id,
            jobType: 'webhook',
            status: 'failed',
            productsSynced: 0,
            variantsSynced: 0,
            errors: { message: error.message, code: error.code },
          },
        });
        return json({ ok: true }, { status: 200 });
      }
    }

    // Upsert non-variant row with product-specific conflict resolution
    if (nonVariantRows.length > 0) {
      const { error } = await supabase
        .from(tableName)
        .upsert(nonVariantRows, {
          onConflict: 'shopify_product_id',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error('Supabase non-variant upsert error:', error);
        await prisma.syncJob.create({
          data: {
            shopId: shop.id,
            jobType: 'webhook',
            status: 'failed',
            productsSynced: 0,
            variantsSynced: 0,
            errors: { message: error.message, code: error.code },
          },
        });
        return json({ ok: true }, { status: 200 });
      }
    }

    // Clean up stale variants: delete any rows for this product not in current payload
    const currentVariantIds = variantRows.map(r => r.shopify_variant_id);
    if (currentVariantIds.length > 0) {
      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .eq('shopify_product_id', product.id)
        .not('shopify_variant_id', 'in', `(${currentVariantIds.map(id => `'${id}'`).join(',')})`);

      if (deleteError) {
        console.warn('Could not clean stale variants:', deleteError);
      }
    }

    // Clean up non-variant rows if product now has variants
    if (variantRows.length > 0) {
      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .eq('shopify_product_id', product.id)
        .is('shopify_variant_id', null);

      if (deleteError) {
        console.warn('Could not clean old non-variant row:', deleteError);
      }
    } else if (nonVariantRows.length > 0) {
      // Conversely, if product is now single-variant, delete old variant rows
      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .eq('shopify_product_id', product.id)
        .not('shopify_variant_id', 'is', null);

      if (deleteError) {
        console.warn('Could not clean old variant rows:', deleteError);
      }
    }

    // Log successful sync
    await prisma.syncJob.create({
      data: {
        shopId: shop.id,
        jobType: 'webhook',
        status: 'completed',
        productsSynced: 1,
        variantsSynced: rows.length,
        completedAt: new Date(),
      },
    });

    return json({ ok: true }, { status: 200 });

  } catch (error) {
    console.error('Webhook processing error:', error);

    // Try to log failed job (shop config may not exist)
    try {
      const shop = await prisma.shop.findUnique({
        where: { shopDomain: shopDomain || '' },
      });
      if (shop) {
        await prisma.syncJob.create({
          data: {
            shopId: shop.id,
            jobType: 'webhook',
            status: 'failed',
            productsSynced: 0,
            variantsSynced: 0,
            errors: { message: String(error) },
          },
        });
      }
    } catch {
      // Silent fail on logging
    }

    return json({ ok: true }, { status: 200 });
  }
}
