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

  try {
    const payload = JSON.parse(body);
    const { shop_domain, customer } = payload;

    if (!shop_domain || !customer?.id) {
      console.error('GDPR payload missing required fields:', { shop_domain, customer_id: customer?.id });
      return json({ error: 'Invalid payload' }, { status: 400 });
    }

    const shop = await prisma.shop.findUnique({
      where: { shopDomain: shop_domain },
      include: { supabaseConfig: true },
    });

    if (!shop?.supabaseConfig) {
      console.log(`Shop ${shop_domain} not configured; skipping customer redaction`);
      return json({ ok: true }, { status: 200 });
    }

    const supabase = createSupabaseClient(shop.supabaseConfig);

    // Hard delete customer data (GDPR right to be forgotten)
    const { error } = await supabase
      .from(shop.supabaseConfig.tableNameCustomers)
      .delete()
      .eq('shopify_customer_id', customer.id);

    if (error) {
      console.error(`GDPR customer redact failed for ${customer.id}:`, error);

      // Log failed GDPR action for audit
      await prisma.syncJob.create({
        data: {
          shopId: shop.id,
          jobType: 'gdpr_redact',
          status: 'failed',
          productsSynced: 0,
          variantsSynced: 0,
          errors: { message: error.message, code: error.code, customer_id: customer.id },
        },
      });

      // Return 500 so Shopify retries
      return json({ error: 'Redaction failed' }, { status: 500 });
    }

    console.log(`GDPR redacted customer ${customer.id} for shop ${shop_domain}`);

    // Log successful GDPR action for audit
    await prisma.syncJob.create({
      data: {
        shopId: shop.id,
        jobType: 'gdpr_redact',
        status: 'completed',
        productsSynced: 0,
        variantsSynced: 0,
      },
    });

    return json({ ok: true }, { status: 200 });

  } catch (error) {
    console.error('GDPR customer redact error:', error);

    // Try to log failed attempt
    try {
      const body = await request.text();
      const payload = JSON.parse(body);
      const shop = await prisma.shop.findUnique({
        where: { shopDomain: payload.shop_domain || '' },
      });
      if (shop) {
        await prisma.syncJob.create({
          data: {
            shopId: shop.id,
            jobType: 'gdpr_redact',
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

    return json({ error: 'Processing failed' }, { status: 500 });
  }
}
