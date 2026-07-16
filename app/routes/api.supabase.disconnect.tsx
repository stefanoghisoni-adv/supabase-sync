import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ ok: false, error: 'Shop non trovato' }, { status: 404 });

  // deleteMany è idempotente: non fallisce se le righe non esistono.
  await prisma.supabaseOAuthToken.deleteMany({ where: { shopId: shop.id } });
  await prisma.supabaseConfig.deleteMany({ where: { shopId: shop.id } });

  return json({ ok: true });
}
