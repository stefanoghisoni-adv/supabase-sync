import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { isMarketId } from '~/lib/i18n/markets';

/**
 * Lingua e valuta scelte dal merchant.
 *
 * Una scelta esplicita, che da qui in poi vince su quella dedotta dall'admin:
 * se cambia l'admin, l'app resta dove il merchant l'ha messa. Si salva
 * nell'unica colonna `locale`, che ora contiene un mercato ("it", "en-GB") e
 * non piu' la sola lingua.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const form = await request.formData();
  const locale = String(form.get('locale') ?? '');
  if (!isMarketId(locale)) {
    return json({ ok: false, error: 'Lingua non disponibile' }, { status: 400 });
  }

  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) {
    return json({ ok: false, error: 'Negozio non trovato' }, { status: 404 });
  }

  await prisma.shop.update({ where: { id: shop.id }, data: { locale } });
  return json({ ok: true });
}
