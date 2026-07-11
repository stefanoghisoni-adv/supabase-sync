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

    if (!error && data) {
      // Log the data request
      console.log(`GDPR data request for customer ${customer.id} from shop ${shop_domain}`);
      // In production: send email to merchant with customer data
      // For now: just log
    }

    return json({ ok: true }, { status: 200 });

  } catch (error) {
    console.error('GDPR data request error:', error);
    return json({ ok: true }, { status: 200 });
  }
}
