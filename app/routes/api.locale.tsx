import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { isLocale } from '~/lib/i18n/locales';

/**
 * La lingua scelta dal merchant.
 *
 * Una scelta esplicita, che da qui in poi vince sulla lingua dell'admin: se
 * cambia l'admin, l'app resta dove il merchant l'ha messa.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const form = await request.formData();
  const locale = String(form.get('locale') ?? '');
  if (!isLocale(locale)) {
    return json({ ok: false, error: 'Lingua non disponibile' }, { status: 400 });
  }

  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) {
    return json({ ok: false, error: 'Negozio non trovato' }, { status: 404 });
  }

  await prisma.shop.update({ where: { id: shop.id }, data: { locale } });
  return json({ ok: true });
}
