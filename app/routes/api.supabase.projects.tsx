import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import { listProjects } from '~/lib/supabase-management.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!shop) {
    throw new Response('Shop non trovato', { status: 404 });
  }

  try {
    const token = await getValidAccessToken(shop.id);
    const projects = await listProjects(token);
    return json({ projects });
  } catch (e) {
    console.error('[api.supabase.projects]', e);
    return json({ projects: [], error: 'Impossibile recuperare i progetti Supabase.' }, { status: 502 });
  }
}
