import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { decrypt } from '~/utils/crypto.server';
import { validateSupabaseUrl } from '~/utils/supabase-url.server';
import { PRODUCTS_TABLE_SQL, CUSTOMERS_TABLE_SQL } from '~/lib/supabase-schema';

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: { supabaseConfig: true },
  });

  if (!shop?.supabaseConfig) {
    return json({ error: 'Supabase not configured' }, { status: 400 });
  }

  // Defense in depth: revalidate the stored URL before sending the service key.
  const urlCheck = validateSupabaseUrl(shop.supabaseConfig.supabaseUrl);
  if (!urlCheck.ok) {
    return json({ error: 'Invalid Supabase URL configured' }, { status: 400 });
  }
  const supabaseUrl = urlCheck.url!;

  try {
    const serviceRoleKey = decrypt(shop.supabaseConfig.supabaseServiceRoleKey);

    // Note: the Supabase JS client cannot run raw DDL. This calls an `exec_sql`
    // Postgres function that must exist in the merchant database (documented in
    // the setup instructions). Without it the request returns an error.
    const response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/exec_sql`,
      {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: PRODUCTS_TABLE_SQL + CUSTOMERS_TABLE_SQL,
        }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to create tables');
    }

    await prisma.supabaseConfig.update({
      where: { shopId: shop.id },
      data: { connectionVerifiedAt: new Date() },
    });

    return json({ ok: true, message: 'Tables created successfully' });
  } catch (error) {
    await prisma.supabaseConfig.update({
      where: { shopId: shop.id },
      data: { connectionVerifiedAt: null },
    }).catch(() => {});

    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
