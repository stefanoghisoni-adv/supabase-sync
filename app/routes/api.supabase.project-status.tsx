// app/routes/api.supabase.project-status.tsx
import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import { getProject } from '~/lib/supabase-management.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response('Shop non trovato', { status: 404 });

  const ref = new URL(request.url).searchParams.get('ref');
  if (!ref) return json({ status: 'UNKNOWN', ready: false }, { status: 400 });

  try {
    const token = await getValidAccessToken(shop.id);
    const { status } = await getProject(token, ref);
    return json({ status, ready: status === 'ACTIVE_HEALTHY' });
  } catch (e) {
    console.error('[api.supabase.project-status]', e instanceof Error ? e.message : 'errore sconosciuto');
    return json({ status: 'ERROR', ready: false }, { status: 502 });
  }
}
