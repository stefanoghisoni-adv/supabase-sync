import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { verifyWebhook } from '~/lib/webhooks/verify.server';
import { transformCustomer } from '~/lib/transformers/customer.server';
import { createSupabaseClient } from '~/lib/supabase.server';
import { prisma } from '~/db.server';
import { isCustomerOptedIn } from '~/lib/stats/customer-consent-stats';
import type { ShopifyCustomer } from '~/types/shopify';

export async function action({ request }: ActionFunctionArgs) {
  // Verify HMAC signature
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
    const customer: ShopifyCustomer = JSON.parse(body);

    if (!customer.id) {
      console.warn('Invalid customer payload: missing id');
      return json({ ok: true }, { status: 200 });
    }

    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
      include: { supabaseConfig: true },
    });

    if (!shop || !shop.supabaseConfig || !shop.supabaseConfig.syncEnabled) {
      console.log(`Shop ${shopDomain} not configured for sync`);
      return json({ ok: true }, { status: 200 });
    }

    // Customer sync is gated by plan entitlement.
    const plan = await prisma.plan.findUnique({
      where: { planName: shop.currentPlan },
    });

    if (!plan?.customersSyncEnabled) {
      console.log(`Customer sync not enabled for plan ${shop.currentPlan}`);
      return json({ ok: true }, { status: 200 });
    }

    const supabase = createSupabaseClient(shop.supabaseConfig);
    const table = shop.supabaseConfig.tableNameCustomers;

    // Consenziente: riga completa. Non consenziente: nessuna insert, solo la
    // marcatura della colonna su cui il proxy decide il 403 (no-op se il cliente
    // non era mai stato sincronizzato).
    const { error } = isCustomerOptedIn(customer)
      ? await supabase.from(table).upsert(transformCustomer(customer), {
          onConflict: 'shopify_customer_id',
          ignoreDuplicates: false,
        })
      : await supabase
          .from(table)
          .update({ accepts_marketing: false })
          .eq('shopify_customer_id', customer.id);

    if (error) {
      console.error('Supabase customer upsert error:', error);
      await prisma.syncJob.create({
        data: {
          shopId: shop.id,
          jobType: 'webhook',
          status: 'failed',
          customersSynced: 0,
          errors: { message: error.message, code: error.code },
        },
      });
      return json({ ok: true }, { status: 200 });
    }

    await prisma.syncJob.create({
      data: {
        shopId: shop.id,
        jobType: 'webhook',
        status: 'completed',
        customersSynced: 1,
        completedAt: new Date(),
      },
    });

    return json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('Customer webhook processing error:', error);

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
            customersSynced: 0,
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
