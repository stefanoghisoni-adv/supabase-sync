import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import { getAccountEmail } from '~/lib/supabase-management.server';

/**
 * Con quale account Supabase e' stato fatto l'accesso.
 *
 * Sta fuori dal loader della dashboard di proposito: e' una chiamata verso
 * Supabase, e farla a ogni caricamento della pagina ne rallenterebbe l'apertura
 * per un dettaglio che si puo' riempire dopo.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    select: { id: true },
  });
  if (!shop) {
    throw new Response('Shop non trovato', { status: 404 });
  }

  try {
    const token = await getValidAccessToken(shop.id);
    return json({ email: await getAccountEmail(token) });
  } catch (e) {
    // Nessun accesso valido: nulla da dire, e non e' un errore da mostrare.
    console.warn(
      '[api.supabase.account]',
      e instanceof Error ? e.message : 'errore sconosciuto',
    );
    return json({ email: null });
  }
}
