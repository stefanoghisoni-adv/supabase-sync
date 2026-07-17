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

    // Ogni riga ha ora un shopify_variant_id reale (anche i single-variant) →
    // un solo upsert con la chiave univoca.
    const { error } = await supabase
      .from(tableName)
      .upsert(rows, {
        onConflict: 'shopify_variant_id',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error('Supabase products upsert error:', error);
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

    // Riconcilia: elimina le righe del prodotto il cui variant_id non è più nel
    // payload (varianti rimosse / transizione multi→single).
    const currentVariantIds = rows.map(r => r.shopify_variant_id).filter(Boolean);
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

    // Righe legacy con variant_id NULL (create prima dell'id reale): rimuovile.
    const { error: legacyDeleteError } = await supabase
      .from(tableName)
      .delete()
      .eq('shopify_product_id', product.id)
      .is('shopify_variant_id', null);

    if (legacyDeleteError) {
      console.warn('Could not clean legacy null-variant row:', legacyDeleteError);
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
