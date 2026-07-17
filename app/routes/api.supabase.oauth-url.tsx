import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { signState } from '~/lib/supabase-oauth.server';
import { buildAuthorizeUrl } from '~/lib/supabase-management.server';
import { isAuthorized } from '~/utils/authorization.server';

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!shop) {
    return json({ error: 'Shop non trovato' }, { status: 404 });
  }
  if (!isAuthorized(shop.authorization)) {
    return json(
      { error: "L'utilizzo dell'app è sospeso per questo negozio.", code: 'not_authorized' },
      { status: 403 },
    );
  }

  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!clientId || !appUrl) {
    return json({ error: 'Integrazione Supabase non configurata' }, { status: 500 });
  }

  const state = signState(shop.id);
  const url = buildAuthorizeUrl({
    clientId,
    redirectUri: `${appUrl}/auth/supabase/callback`,
    state,
  });

  return json({ url });
}
