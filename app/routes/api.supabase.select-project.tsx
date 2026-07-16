import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { encrypt } from '~/utils/crypto.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import {
  getProjectApiKeys,
  runQuery,
  projectUrl,
} from '~/lib/supabase-management.server';
import { MERCHANT_TABLES_SQL } from '~/lib/supabase-schema';

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!shop) {
    return json({ ok: false, error: 'Shop non trovato' }, { status: 404 });
  }

  const body = (await request.json()) as { ref?: unknown };
  if (!body.ref || typeof body.ref !== 'string') {
    return json({ ok: false, error: 'ref del progetto mancante' }, { status: 400 });
  }
  const ref = body.ref;

  try {
    const token = await getValidAccessToken(shop.id);
    const keys = await getProjectApiKeys(token, ref);
    const url = projectUrl(ref);

    await prisma.supabaseConfig.upsert({
      where: { shopId: shop.id },
      create: {
        shopId: shop.id,
        supabaseUrl: url,
        supabasePublicKey: encrypt(keys.anon),
        supabaseServiceRoleKey: encrypt(keys.serviceRole),
      },
      update: {
        supabaseUrl: url,
        supabasePublicKey: encrypt(keys.anon),
        supabaseServiceRoleKey: encrypt(keys.serviceRole),
      },
    });

    await runQuery(token, ref, MERCHANT_TABLES_SQL);

    await prisma.supabaseConfig.update({
      where: { shopId: shop.id },
      data: { connectionVerifiedAt: new Date() },
    });

    return json({ ok: true });
  } catch (e) {
    console.error('[api.supabase.select-project]', e);
    await prisma.supabaseConfig
      .update({ where: { shopId: shop.id }, data: { connectionVerifiedAt: null } })
      .catch(() => {});
    return json(
      { ok: false, error: 'Impossibile completare il collegamento. Riprova.' },
      { status: 500 },
    );
  }
}
