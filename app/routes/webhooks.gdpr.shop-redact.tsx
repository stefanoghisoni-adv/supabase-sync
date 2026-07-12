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
    const payload = JSON.parse(body);
    const { shop_domain } = payload;

    if (!shop_domain) {
      console.error('GDPR shop redact: missing shop_domain');
      return json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Delete all app metadata for this shop
    // CASCADE will delete supabaseConfig, syncJobs, customFields, etc.
    const shop = await prisma.shop.findUnique({
      where: { shopDomain: shop_domain },
    });

    if (!shop) {
      console.log(`GDPR shop redact: Shop ${shop_domain} not found, assuming already deleted`);
      return json({ ok: true }, { status: 200 });
    }

    await prisma.shop.delete({
      where: { shopDomain: shop_domain },
    });

    console.log(`GDPR shop redacted: ${shop_domain}`);

    // Log successful shop redaction for audit
    // Note: Can't create SyncJob as shop is now deleted
    // This audit trail would need to exist in a separate audit table (future improvement)

    // NOTE: We do NOT delete data from merchant's Supabase
    // That database belongs to the merchant, not our app

    return json({ ok: true }, { status: 200 });

  } catch (error) {
    console.error('GDPR shop redact error:', error);

    // Try to find shop for audit logging
    try {
      const payload = JSON.parse(body);
      const shop = await prisma.shop.findUnique({
        where: { shopDomain: payload.shop_domain || '' },
      });
      if (shop) {
        await prisma.syncJob.create({
          data: {
            shopId: shop.id,
            jobType: 'gdpr_shop_redact',
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

    return json({ error: 'Redaction failed' }, { status: 500 });
  }
}
