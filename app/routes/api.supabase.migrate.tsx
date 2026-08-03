import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { applyMerchantSchemaUpdate } from '~/lib/supabase/apply-schema-update.server';

/**
 * Aggiornamento delle tabelle del merchant richiesto dal pulsante in dashboard.
 *
 * L'aggiornamento parte da solo (alla sincronizzazione e all'apertura della
 * dashboard); questa rotta serve a chi non vuole aspettare, e a rimediare
 * quando il tentativo automatico non e' andato a buon fine.
 *
 * Nessun gate sull'autorizzazione: un negozio sospeso deve poter comunque
 * riallineare le proprie tabelle — e' manutenzione del suo database, non uso
 * dell'app.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    select: { id: true },
  });
  if (!shop) {
    return json({ ok: false, error: 'Shop non trovato' }, { status: 404 });
  }

  const result = await applyMerchantSchemaUpdate(shop.id);

  if (result.status === 'failed') {
    return json(
      {
        ok: false,
        error:
          'Aggiornamento non riuscito. Riprova fra qualche minuto: se il problema resta, scrivici.',
      },
      { status: 502 },
    );
  }

  return json({ ok: true, status: result.status });
}
