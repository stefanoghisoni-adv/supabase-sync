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
      console.error('GDPR data request: missing required fields');
      return json({ error: 'Invalid payload' }, { status: 400 });
    }

    const shop = await prisma.shop.findUnique({
      where: { shopDomain: shop_domain },
      include: { supabaseConfig: true },
    });

    if (!shop?.supabaseConfig) {
      console.log(`GDPR data request: Shop ${shop_domain} not configured`);
      return json({ ok: true }, { status: 200 });
    }

    const supabase = createSupabaseClient(shop.supabaseConfig);

    // Fetch customer data
    const { data, error } = await supabase
      .from(shop.supabaseConfig.tableNameCustomers)
      .select('*')
      .eq('shopify_customer_id', customer.id)
      .single();

    if (error) {
      console.error(`GDPR data request failed for customer ${customer.id}:`, error);

      // Log failed data request for audit
      await prisma.syncJob.create({
        data: {
          shopId: shop.id,
          jobType: 'gdpr_data_request',
          status: 'failed',
          productsSynced: 0,
          variantsSynced: 0,
          errors: { message: error.message, code: error.code, customer_id: customer.id },
        },
      });

      // Return 500 so Shopify retries
      return json({ error: 'Data retrieval failed' }, { status: 500 });
    }

    if (data) {
      console.log(`GDPR data request for customer ${customer.id} from shop ${shop_domain}`);

      // Log successful data request for audit
      await prisma.syncJob.create({
        data: {
          shopId: shop.id,
          jobType: 'gdpr_data_request',
          status: 'completed',
          productsSynced: 0,
          variantsSynced: 0,
        },
      });

      // In production: send email to merchant with customer data
      // For now: just log
    }

    return json({ ok: true }, { status: 200 });

  } catch (error) {
    console.error('GDPR data request error:', error);

    // Try to log failed attempt
    try {
      const payload = JSON.parse(body);
      const shop = await prisma.shop.findUnique({
        where: { shopDomain: payload.shop_domain || '' },
      });
      if (shop) {
        await prisma.syncJob.create({
          data: {
            shopId: shop.id,
            jobType: 'gdpr_data_request',
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
