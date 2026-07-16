import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import { listRegions, SUPABASE_REGIONS } from '~/lib/supabase-management.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response('Shop non trovato', { status: 404 });

  try {
    const token = await getValidAccessToken(shop.id);
    const regions = await listRegions(token);
    return json({ regions });
  } catch (e) {
    console.error('[api.supabase.regions]', e instanceof Error ? e.message : 'errore sconosciuto');
    // Fallback: restituisci comunque la lista statica per non bloccare il form.
    return json({ regions: SUPABASE_REGIONS });
  }
}
