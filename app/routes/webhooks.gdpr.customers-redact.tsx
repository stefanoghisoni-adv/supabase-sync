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
    const { shop_domain, customer } = JSON.parse(body);

    const shop = await prisma.shop.findUnique({
      where: { shopDomain: shop_domain },
      include: { supabaseConfig: true },
    });

    if (!shop?.supabaseConfig) {
      return json({ ok: true }, { status: 200 });
    }

    const supabase = createSupabaseClient(shop.supabaseConfig);

    // Hard delete customer data (GDPR right to be forgotten)
    await supabase
      .from(shop.supabaseConfig.tableNameCustomers)
      .delete()
      .eq('shopify_customer_id', customer.id);

    console.log(`GDPR redacted customer ${customer.id} for shop ${shop_domain}`);

    return json({ ok: true }, { status: 200 });

  } catch (error) {
    console.error('GDPR customer redact error:', error);
    return json({ ok: true }, { status: 200 });
  }
}
