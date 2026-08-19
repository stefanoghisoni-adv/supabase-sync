import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { isAuthorized } from '~/utils/authorization.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import { deleteProject, listProjects } from '~/lib/supabase-management.server';
import { dictionaryForShop } from '~/lib/i18n/server';

/**
 * Eliminazione di un database che il merchant non sta usando.
 *
 * Il gesto e' irreversibile e riguarda dati suoi, quindi qui ci sono due
 * verifiche che non dipendono da cosa dichiara il browser: il progetto deve
 * risultare fra i suoi, e non deve essere quello collegato all'app. La seconda
 * conta piu' della prima — cancellare il database collegato significherebbe
 * portarsi via i dati che l'app sta sincronizzando, e da qui non si torna
 * indietro.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Richiesta non valida' }, { status: 405 });
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    include: { supabaseConfig: true },
  });
  if (!shop) {
    return json({ ok: false, error: 'Negozio non trovato' }, { status: 404 });
  }
  if (!isAuthorized(shop.authorization)) {
    return json(
      { ok: false, error: (await dictionaryForShop(session.shop)).errors.suspended },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { ref?: unknown };
  const ref = typeof body.ref === 'string' ? body.ref.trim() : '';
  if (!ref) {
    return json({ ok: false, error: 'ref del progetto mancante' }, { status: 400 });
  }

  const t = await dictionaryForShop(session.shop);

  // Il database collegato non si elimina da qui: prima lo si stacca, e quella
  // e' una strada che chiede le sue conferme.
  if (shop.supabaseConfig?.supabaseProjectRef === ref) {
    return json({ ok: false, error: t.errors.deleteConnected }, { status: 400 });
  }

  try {
    const token = await getValidAccessToken(shop.id);

    // Che il progetto sia suo lo dice Supabase, non il browser.
    const projects = await listProjects(token);
    if (!projects.some((p) => p.id === ref)) {
      return json({ ok: false, error: t.errors.deleteUnknown }, { status: 404 });
    }

    await deleteProject(token, ref);
    return json({ ok: true });
  } catch (e) {
    console.error(
      '[api.supabase.delete-project]',
      e instanceof Error ? e.message : 'errore sconosciuto',
    );
    return json({ ok: false, error: t.errors.deleteFailed }, { status: 502 });
  }
}
