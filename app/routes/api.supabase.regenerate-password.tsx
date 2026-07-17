// app/routes/api.supabase.regenerate-password.tsx
import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { encrypt } from '~/utils/crypto.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import { resetDbPassword } from '~/lib/supabase-management.server';
import { generateDbPassword } from '~/lib/password.server';
import { isAuthorized } from '~/utils/authorization.server';

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ ok: false, error: 'Shop non trovato' }, { status: 404 });
  if (!isAuthorized(shop.authorization)) {
    return json(
      { ok: false, error: "L'utilizzo dell'app è sospeso per questo negozio.", code: 'not_authorized' },
      { status: 403 },
    );
  }

  const config = await prisma.supabaseConfig.findUnique({ where: { shopId: shop.id } });
  if (!config?.supabaseProjectRef) {
    return json({ ok: false, error: 'Nessun progetto collegato' }, { status: 400 });
  }

  try {
    const token = await getValidAccessToken(shop.id);
    const newPass = generateDbPassword();
    await resetDbPassword(token, config.supabaseProjectRef, newPass);
    await prisma.supabaseConfig.update({
      where: { shopId: shop.id },
      data: { supabaseDbPassword: encrypt(newPass) },
    });
    return json({ ok: true, password: newPass });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'errore sconosciuto';
    console.error('[api.supabase.regenerate-password]', msg);
    if (msg.startsWith('unsupported')) {
      return json(
        { ok: false, error: 'La rigenerazione automatica non è disponibile per questo progetto. Cambiala dalla dashboard Supabase.', code: 'unsupported' },
        { status: 501 },
      );
    }
    return json({ ok: false, error: 'Rigenerazione password non riuscita. Riprova.' }, { status: 502 });
  }
}
