import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { verifyWebhook } from '~/lib/webhooks/verify.server';
import { prisma } from '~/db.server';

export async function action({ request }: ActionFunctionArgs) {
  const body = await request.text();
  const hmac = request.headers.get('X-Shopify-Hmac-Sha256');

  if (!hmac || !verifyWebhook(body, hmac)) {
    return json({ error: 'Invalid signature' }, { status: 401 });
  }

  try {
    const { shop_domain } = JSON.parse(body);

    // Delete all app metadata for this shop
    // CASCADE will delete supabaseConfig, syncJobs, customFields, etc.
    await prisma.shop.delete({
      where: { shopDomain: shop_domain },
    });

    console.log(`GDPR shop redacted: ${shop_domain}`);

    // NOTE: We do NOT delete data from merchant's Supabase
    // That database belongs to the merchant, not our app

    return json({ ok: true }, { status: 200 });

  } catch (error) {
    console.error('GDPR shop redact error:', error);
    return json({ ok: true }, { status: 200 });
  }
}
