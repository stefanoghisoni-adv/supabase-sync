import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { verifyWebhook } from '~/lib/webhooks/verify.server';
import { createSupabaseClient } from '~/lib/supabase.server';
import { prisma } from '~/db.server';

export async function action({ request }: ActionFunctionArgs) {
  const body = await request.text();
  const hmac = request.headers.get('X-Shopify-Hmac-Sha256');

  if (!hmac || !verifyWebhook(body, hmac)) {
    return json({ error: 'Invalid signature' }, { status: 401 });
  }

  const shopDomain = request.headers.get('X-Shopify-Shop-Domain');
  if (!shopDomain) {
    return json({ error: 'Missing shop domain' }, { status: 400 });
  }

  try {
    const { id: productId } = JSON.parse(body);

    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
      include: { supabaseConfig: true },
    });

    if (!shop?.supabaseConfig?.syncEnabled) {
      return json({ ok: true }, { status: 200 });
    }

    const supabase = createSupabaseClient(shop.supabaseConfig);

    // Hard delete all rows for this product
    const { error } = await supabase
      .from(shop.supabaseConfig.tableNameProducts)
      .delete()
      .eq('shopify_product_id', productId);

    if (error) {
      console.error('Supabase delete error:', error);
      await prisma.syncJob.create({
        data: {
          shopId: shop.id,
          jobType: 'webhook',
          status: 'failed',
          errors: { message: error.message },
        },
      });
    } else {
      await prisma.syncJob.create({
        data: {
          shopId: shop.id,
          jobType: 'webhook',
          status: 'completed',
          productsSynced: 0, // Deletion
          completedAt: new Date(),
        },
      });
    }

    return json({ ok: true }, { status: 200 });

  } catch (error) {
    console.error('Delete webhook error:', error);
    return json({ ok: true }, { status: 200 });
  }
}
