import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';

/**
 * L'accesso a Supabase risulta fatto, si' o no.
 *
 * Serve al primo passo del collegamento, che la interroga a intervalli mentre il
 * merchant e' sulla finestra di Supabase. La finestra e' di un altro sito e non
 * possiamo sapere cosa succede dentro: se il merchant deve prima crearsi
 * l'account o l'organizzazione, Supabase lo porta altrove e la richiesta di
 * autorizzazione si perde per strada, senza che ce ne arrivi notizia. Chiedendo
 * al nostro server, il passo si sblocca appena l'autorizzazione arriva davvero —
 * da qualunque finestra sia passata, anche a distanza di minuti.
 *
 * Volutamente minima: e' una lettura ripetuta, quindi niente chiamate verso
 * Supabase e nessun dato oltre al si'/no.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    select: { id: true },
  });
  if (!shop) return json({ linked: false });

  const token = await prisma.supabaseOAuthToken.findUnique({
    where: { shopId: shop.id },
    // Solo la presenza: i token restano dove sono.
    select: { shopId: true },
  });

  return json({ linked: token !== null });
}
