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

    // Upsert rows
    const { error } = await supabase
      .from(shop.supabaseConfig.tableNameProducts)
      .upsert(rows, {
        onConflict: 'shopify_variant_id',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error('Supabase upsert error:', error);

      // Log failed sync job
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

      // Return 200 anyway to prevent Shopify retries
      return json({ ok: true }, { status: 200 });
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
    return json({ ok: true }, { status: 200 }); // Acknowledge anyway
  }
}
